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
import { listWorkbookSaveIntents, prepareWorkbookSave, readWorkbookSaveIntent, savePreparedWorkbook,
  type StoredWorkbookIntent, type WorkbookIntentGateway, type WorkbookIntentStore } from '@/lib/intelligence/workbook-intent-store';

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
    ...(typeof r.created_by === "string" ? { createdBy: r.created_by } : {}),
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
        .select(`${VERSION_COLUMNS},body,created_by`)
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
      if (error) throw classifyStoreError(error, 'write');
      return toVersion(data as Record<string, unknown>);
    },
    async insertReview(row) {
      const { data, error } = await db
        .from("research_workbook_reviews")
        .insert({ version_id: row.versionId, decision: row.decision, note: row.note })
        .select("id,version_id,decision,note,reviewed_at")
        .single();
      if (error) throw classifyStoreError(error, 'write');
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

const INTENT_COLUMNS = 'intent_id,workbook_id,base_version,target_version,request_hash,title,created_by,created_at';
function toIntent(row: Record<string, unknown>): StoredWorkbookIntent {
  return { intentId: String(row.intent_id), workbookId: String(row.workbook_id), baseVersion: Number(row.base_version), targetVersion: Number(row.target_version),
    requestBody: String(row.request_body), requestHash: String(row.request_hash), title: String(row.title), createdBy: String(row.created_by), createdAt: String(row.created_at) };
}
function intentStore(db: SessionClient): WorkbookIntentStore {
  return {
    async get(id) {
      const { data, error } = await db.from('research_workbook_save_intents').select(`${INTENT_COLUMNS},request_body`).eq('intent_id', id).maybeSingle();
      if (error) throw classifyStoreError(error);
      return data ? toIntent(data as Record<string, unknown>) : null;
    },
    async recent(limit, offset) {
      const { data, error } = await db.from('research_workbook_save_intents').select(INTENT_COLUMNS).order('created_at', { ascending: false }).order('intent_id', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw classifyStoreError(error);
      return (data ?? []).map(raw => { const { requestBody: _body, ...row } = toIntent(raw as Record<string, unknown>); void _body; return row; });
    },
    async insert(row) {
      const { data, error } = await db.from('research_workbook_save_intents').insert({ intent_id: row.intentId, request_body: row.requestBody }).select(`${INTENT_COLUMNS},request_body`).single();
      if (error) throw classifyStoreError(error, 'write');
      return toIntent(data as Record<string, unknown>);
    },
  };
}

async function gateway(): Promise<WorkbookIntentGateway> {
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
    createIntentStore: () => intentStore(supabase),
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
  const gw = await gateway();
  if (url.searchParams.has('intent')) { const result = await readWorkbookSaveIntent(gw, url.searchParams.get('intent')); return privateJson(result.body, result.status); }
  if (url.searchParams.has('intents')) { const result = await listWorkbookSaveIntents(gw, Number(url.searchParams.get('offset') ?? 0)); return privateJson(result.body, result.status); }
  const result = id ? await openWorkbook(gw, id, v === null ? null : Number(v)) : await listWorkbooks(gw);
  if (!id && result.status === 200) {
    const intents = await listWorkbookSaveIntents(gw);
    result.body.durableRecoveryAvailable = intents.status === 200;
    if (intents.status === 200) { result.body.saveIntents = intents.body.items; result.body.intentNextOffset = intents.body.nextOffset; }
  }
  return privateJson(result.body, result.status);
}

export async function POST(request: Request) {
  try { return await write(request); } catch { return privateJson({ error: "ذخیره انجام نشد؛ متن را نگه دارید و دوباره تلاش کنید." }, 503); }
}
async function write(request: Request) {
  // سقفِ بدنه پیش از پارس: JSONِ چندمگابایتی نباید اول کامل در حافظه ساخته شود.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_STORED_BYTES * 4 + 1024) {
    return privateJson({ error: "درخواست بیش از حد بزرگ است" }, 413);
  }
  let body: Record<string, unknown>;
  let exactBody: string;
  try {
    exactBody = await request.text();
    if (new TextEncoder().encode(exactBody).length > MAX_STORED_BYTES * 4 + 1024) return privateJson({ error: 'درخواست بیش از حد بزرگ است' }, 413);
    const parsed: unknown = JSON.parse(exactBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return privateJson({ error: "بدنهٔ درخواست نامعتبر است" }, 400);
  }
  if (body.action !== 'prepare_save' && (declared > MAX_STORED_BYTES * 2 || new TextEncoder().encode(exactBody).length > MAX_STORED_BYTES * 2)) return privateJson({ error: 'درخواست بیش از حد بزرگ است' }, 413);
  const gw = await gateway();
  if (body.action === 'prepare_save') { const prepared = await prepareWorkbookSave(gw, body.intentId, body.requestBody); return privateJson(prepared.body, prepared.status); }
  const intentId = request.headers.get('x-workbook-save-intent');
  const result =
    body.action === "save"
      ? intentId ? await savePreparedWorkbook(gw, intentId, exactBody) : await saveWorkbook(gw, body)
      : body.action === "decide"
        ? await decideWorkbook(gw, body)
        : { status: 400 as const, body: { error: "کنشِ نامعتبر" } };
  return privateJson(result.body, result.status);
}
