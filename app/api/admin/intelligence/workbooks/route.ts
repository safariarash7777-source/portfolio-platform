import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import {
  classifyStoreError,
  decideWorkbook,
  listWorkbooks,
  MAX_STORED_BYTES,
  openWorkbook,
  saveWorkbook,
  type StoredReview,
  type StoredVersion,
  type WorkbookDecision,
  type WorkbookGateway,
  type WorkbookStore,
} from "@/lib/intelligence/workbook-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function privateJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * `/api/admin/intelligence/workbooks` — ذخیره/بازکردن/نسخهٔ دوم/تأییدِ داخلیِ
 * کاربرگِ پژوهش (#142). نازک: مجوز و اعتبارسنجی در
 * `lib/intelligence/workbook-store.ts`.
 *
 * روی **نشستِ خودِ ادمین** می‌نویسد، نه service-role: تریگرهای `phase34`
 * نویسنده را از `auth.uid()` می‌گیرند و RLS همان شرطِ ادمین را دوباره می‌سنجد.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>;

const VERSION_COLUMNS = "id,workbook_id,version,title,created_at";

function toVersion(r: Record<string, unknown>): StoredVersion {
  return {
    id: String(r.id),
    workbookId: String(r.workbook_id),
    version: Number(r.version),
    title: String(r.title),
    body: r.body,
    createdAt: String(r.created_at),
  };
}

function supabaseStore(db: SessionClient): WorkbookStore {
  return {
    async recent(limit) {
      const { data, error } = await db
        .from("research_workbook_versions")
        .select(VERSION_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw classifyStoreError(error);
      return (data ?? []).map((r) => {
        const { body: _omit, ...rest } = toVersion(r as Record<string, unknown>);
        void _omit;
        return rest;
      });
    },
    async versions(workbookId) {
      const { data, error } = await db
        .from("research_workbook_versions")
        .select(`${VERSION_COLUMNS},body`)
        .eq("workbook_id", workbookId)
        .order("version", { ascending: true });
      if (error) throw classifyStoreError(error);
      return (data ?? []).map((r) => toVersion(r as Record<string, unknown>));
    },
    async reviews(versionIds) {
      if (versionIds.length === 0) return [];
      const { data, error } = await db
        .from("research_workbook_reviews")
        .select("id,version_id,decision,note,reviewed_at")
        .in("version_id", versionIds);
      if (error) throw classifyStoreError(error);
      return (data ?? []).map((r): StoredReview => ({
        id: String(r.id),
        versionId: String(r.version_id),
        decision: r.decision as WorkbookDecision,
        note: (r.note as string | null) ?? null,
        reviewedAt: String(r.reviewed_at),
      }));
    },
    async insertVersion(row) {
      const { data, error } = await db
        .from("research_workbook_versions")
        .insert({ workbook_id: row.workbookId, version: row.version, title: row.title, body: row.body })
        .select(VERSION_COLUMNS)
        .single();
      if (error) throw classifyStoreError(error);
      return toVersion(data as Record<string, unknown>);
    },
    async insertReview(row) {
      const { data, error } = await db
        .from("research_workbook_reviews")
        .insert({ version_id: row.versionId, decision: row.decision, note: row.note })
        .select("id,version_id,decision,note,reviewed_at")
        .single();
      if (error) throw classifyStoreError(error);
      return {
        id: String(data.id),
        versionId: String(data.version_id),
        decision: data.decision as WorkbookDecision,
        note: (data.note as string | null) ?? null,
        reviewedAt: String(data.reviewed_at),
      };
    },
  };
}

async function gateway(): Promise<WorkbookGateway> {
  const supabase = await createClient();
  return {
    privatePreparationWritable: process.env.P07_PRIVATE_PREPARATION_ENABLED === 'true',
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      const status = authSessionFailure(error);
      if (status === 503) throw new Error('session lookup unavailable');
      if (status === 401) return null;
      return data.user ? { id: data.user.id } : null;
    },
    async getRole(userId) {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error) throw new Error("role lookup failed");
      return (data?.role as string | undefined) ?? null;
    },
    createStore: () => supabaseStore(supabase),
    newId: () => randomUUID(),
  };
}

export async function GET(request: Request) {
  try { return await read(request); } catch { return privateJson({ error: "دریافت کاربرگ انجام نشد؛ دوباره تلاش کنید." }, 503); }
}
async function read(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const v = url.searchParams.get("version");
  const result = id
    ? await openWorkbook(await gateway(), id, v === null ? null : Number(v))
    : await listWorkbooks(await gateway());
  return privateJson(result.body, result.status);
}

export async function POST(request: Request) {
  try { return await write(request); } catch { return privateJson({ error: "ذخیره انجام نشد؛ متن را نگه دارید و دوباره تلاش کنید." }, 503); }
}
async function write(request: Request) {
  // سقفِ بدنه پیش از پارس: JSONِ چندمگابایتی نباید اول کامل در حافظه ساخته شود.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_STORED_BYTES * 2) {
    return privateJson({ error: "درخواست بیش از حد بزرگ است" }, 413);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return privateJson({ error: "بدنهٔ درخواست نامعتبر است" }, 400);
  }
  const result =
    body.action === "save"
      ? await saveWorkbook(await gateway(), body)
      : body.action === "decide"
        ? await decideWorkbook(await gateway(), body)
        : { status: 400 as const, body: { error: "کنشِ نامعتبر" } };
  return privateJson(result.body, result.status);
}
