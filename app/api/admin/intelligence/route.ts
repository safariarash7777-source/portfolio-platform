import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  capturePackage,
  transitionAnalysis,
  type CapturePackage,
  type IntelGateway,
  type IntelWriter,
} from "@/lib/intelligence/service";
import type { AnalysisState } from "@/lib/intelligence/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/api/admin/intelligence` — موتورِ دستیِ هوشمندی (فقط ادمین). `G3-003`.
 *
 * این فایل عمداً **نازک** است: مجوز، اعتبارسنجی و قواعدِ گذار در
 * `lib/intelligence/service.ts` هستند تا بدونِ HTTP قابلِ اجرا و تست باشند
 * («یک موتور، چند نما»). اینجا فقط Supabase به قراردادِ `IntelGateway` وصل
 * می‌شود.
 *
 * قواعدِ سختِ این مسیر:
 *  ۱. **هیچ Agent، هیچ LLM.** ثبت کاملاً دستی است.
 *  ۲. **هیچ انتشارِ عمومی.** `PATCH` مقصدِ `published` را رد می‌کند.
 *  ۳. **هیچ دادهٔ ساختگی.** بستهٔ ناقص اصلاً وارد دیتابیس نمی‌شود.
 *  ۴. هشِ محتوا همیشه سمتِ سرور ساخته می‌شود.
 *  ۵. مجوز پیش از ساختِ writer — با تست اثبات شده.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * نویسنده — روی **نشستِ خودِ ادمین**، نه service-role.
 *
 * ── چرا این تفاوت حیاتی است ────────────────────────────────────────────
 * `capture_intel_package` و `publish_intel_analysis` توابعِ SECURITY DEFINER
 * هستند که خودشان احراز می‌کنند:
 *
 *     IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role='admin')
 *       THEN RAISE EXCEPTION 'admin required'
 *
 * کلاینتِ service-role هیچ نشستی حمل نمی‌کند، پس `auth.uid()` در آن `NULL`
 * است و این شرط **همیشه** رد می‌شود. یعنی این مسیر حتی با کلیدِ سرویس‌رول و
 * migrationِ اجراشده هم کار نمی‌کرد — «admin required» می‌گرفت. تریگرِ
 * `intel_record_workflow_event` هم `actor_id` را از `auth.uid()` می‌گیرد و
 * با service-role رویداد را بی‌مالک ثبت می‌کرد.
 *
 * سیاستِ `intel_admin_all` در `sql/phase20` هم `FOR ALL TO authenticated` با
 * همان شرطِ ادمین است، پس نشست دقیقاً همان دسترسی را دارد.
 */
function supabaseWriter(admin: SessionClient): IntelWriter {
  return {
    async capture(payload) {
      // یک RPC، یک تراکنش. اگر این پنج `INSERT` جدا بود، شکستِ عبارتِ چهارم
      // یک بستهٔ نصفه به‌جا می‌گذاشت که بعداً شبیهِ دادهٔ واقعی به‌نظر می‌رسد.
      const { data, error } = await admin.rpc("capture_intel_package", {
        p_source: payload.source.id
          ? { id: payload.source.id }
          : {
              kind: payload.source.kind,
              name: payload.source.name,
              url: payload.source.url ?? null,
              trust_tier: payload.source.trustTier ?? "unverified",
            },
        p_evidence: {
          excerpt: payload.evidence.excerpt,
          content_url: payload.evidence.contentUrl ?? null,
          observed_at: payload.evidence.observedAt,
          published_at: payload.evidence.publishedAt ?? null,
          content_hash: payload.contentHash,
        },
        p_event: payload.event
          ? {
              domain: payload.event.domain,
              title: payload.event.title,
              summary: payload.event.summary ?? null,
              occurred_at: payload.event.occurredAt,
              scope: payload.event.scope,
              symbol: payload.event.symbol ?? null,
            }
          : null,
        p_analysis: {
          domain: payload.analysis.domain,
          title: payload.analysis.title,
          body_md: payload.analysis.bodyMd,
          brief_date: payload.analysis.briefDate ?? null,
        },
        p_claims: payload.claims.map((c) => ({
          kind: c.kind,
          statement: c.statement,
          confidence: c.confidence,
          scenario_label: c.scenarioLabel ?? null,
        })),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },

    async loadState(analysisId) {
      const { data, error } = await admin
        .from("intel_analyses")
        .select("status")
        .eq("id", analysisId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.status as AnalysisState | undefined) ?? null;
    },

    async transition(analysisId, to, note, actorId) {
      // `approved_by`/`approved_at` فقط هنگامِ تأییدِ داخلی ست می‌شوند؛ قیدِ
      // `intel_analyses_publication_consistent` بقیهٔ حالت‌ها را رد می‌کند.
      const patch: Record<string, unknown> = { status: to, review_note: note };
      if (to === "approved_internal") {
        patch.approved_by = actorId;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await admin.from("intel_analyses").update(patch).eq("id", analysisId);
      if (error) throw new Error(error.message);
    },
  };
}

async function gateway(): Promise<IntelGateway> {
  // یک کلاینت برای هر سه کار — پیش‌تر هر فراخوان کلاینتِ تازه‌ای می‌ساخت.
  const supabase = await createClient();
  return {
    async getUser() {
      const { data } = await supabase.auth.getUser();
      return data.user ? { id: data.user.id } : null;
    },
    async getRole(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.role as string | undefined) ?? null;
    },
    // همچنان factory: هیچ نویسنده‌ای پیش از تأییدِ مجوز ساخته نمی‌شود.
    createWriter: () => supabaseWriter(supabase),
    hash: (input) => createHash("sha256").update(input, "utf8").digest("hex"),
  };
}

export async function POST(request: Request) {
  let payload: CapturePackage;
  try {
    payload = (await request.json()) as CapturePackage;
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است" }, { status: 400 });
  }
  const result = await capturePackage(await gateway(), payload);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(request: Request) {
  let body: { analysisId?: string; to?: AnalysisState; note?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است" }, { status: 400 });
  }
  const result = await transitionAnalysis(
    await gateway(),
    String(body.analysisId ?? ""),
    body.to as AnalysisState,
    body.note ?? null
  );
  return NextResponse.json(result.body, { status: result.status });
}
