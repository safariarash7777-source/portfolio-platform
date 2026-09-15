import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describe } from "@/lib/intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/intelligence/rehearsal` — ثبتِ یک روزِ **واقعیِ** تمرین.
 *
 * قواعدِ سخت:
 *  ۱. **هیچ روزِ مصنوعی.** این مسیر فقط یک روز را ثبت می‌کند؛ هیچ‌جا روزِ
 *     خودکار، backfill یا نمونه ساخته نمی‌شود.
 *  ۲. روزِ بدونِ بریف نمی‌تواند زمانِ تولید داشته باشد — قیدِ دیتابیس هم همین
 *     را می‌گوید، اینجا فقط پیامش فارسی می‌شود.
 *  ۳. حذف وجود ندارد. اصلاح فقط تا وقتی روز مهر نشده ممکن است.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * گیتِ نقش — و همان کلاینتی که درج با آن انجام می‌شود.
 *
 * `intel_rehearsal_days` زیرِ سیاستِ `intel_admin_all` است
 * (`FOR ALL TO authenticated` با شرطِ ادمین، `sql/phase20`)، پس نشستِ ادمین
 * دقیقاً همان اجازه را دارد و دیگر لازم نیست این مسیر به
 * `SUPABASE_SERVICE_ROLE_KEY` گره بخورد.
 */
async function requireAdmin(): Promise<{ id: string; supabase: SessionClient } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (error || profile?.role !== "admin") return null;
  return { id: data.user.id, supabase };
}

interface Body {
  rehearsalDate?: string;
  dayIndex?: number;
  briefProduced?: boolean;
  briefAnalysisId?: string | null;
  minutesToApproval?: number | null;
  absentSources?: string[];
  staleSources?: string[];
  humanCorrections?: number;
  rejectedConclusions?: number;
  missedEvents?: number;
  followupNote?: string | null;
}

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;
const isNameList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 120);

export async function POST(request: Request) {
  // مجوز پیش از هر پرس‌وجو — همان ترتیبی که در
  // `lib/intelligence/service.ts` با تست اثبات شده.
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است" }, { status: 400 });
  }

  if (typeof body.rehearsalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.rehearsalDate)) {
    return NextResponse.json({ error: "تاریخِ روزِ تمرین نامعتبر است" }, { status: 400 });
  }
  if (!isCount(body.dayIndex) || body.dayIndex < 1) {
    return NextResponse.json({ error: "شمارهٔ روز نامعتبر است" }, { status: 400 });
  }
  if (typeof body.briefProduced !== "boolean") {
    return NextResponse.json({ error: "وضعیتِ تولیدِ بریف لازم است" }, { status: 400 });
  }
  if (body.briefProduced && !body.briefAnalysisId) {
    return NextResponse.json({ error: "روزی که بریف داشته باید به بریف اشاره کند" }, { status: 400 });
  }
  // «بریف نداشتیم» و «بریف در صفر دقیقه آماده شد» نباید یک ردیف شوند.
  if (!body.briefProduced && (body.briefAnalysisId || body.minutesToApproval != null)) {
    return NextResponse.json(
      { error: "روزِ بدونِ بریف نمی‌تواند زمانِ تولید یا ارجاع به بریف داشته باشد" },
      { status: 400 }
    );
  }
  if (body.minutesToApproval != null && !isCount(body.minutesToApproval)) {
    return NextResponse.json({ error: "زمانِ تولید نامعتبر است" }, { status: 400 });
  }
  for (const [key, value] of Object.entries({
    humanCorrections: body.humanCorrections ?? 0,
    rejectedConclusions: body.rejectedConclusions ?? 0,
    missedEvents: body.missedEvents ?? 0,
  })) {
    if (!isCount(value)) {
      return NextResponse.json({ error: `مقدارِ «${key}» نامعتبر است` }, { status: 400 });
    }
  }
  if (body.absentSources != null && !isNameList(body.absentSources)) {
    return NextResponse.json({ error: "فهرستِ منابعِ غایب نامعتبر است" }, { status: 400 });
  }
  if (body.staleSources != null && !isNameList(body.staleSources)) {
    return NextResponse.json({ error: "فهرستِ منابعِ بیات نامعتبر است" }, { status: 400 });
  }
  if (body.followupNote != null && (typeof body.followupNote !== "string" || body.followupNote.length > 2000)) {
    return NextResponse.json({ error: "یادداشتِ پیگیری نامعتبر است" }, { status: 400 });
  }

  const { error } = await admin.supabase.from("intel_rehearsal_days").insert({
    rehearsal_date: body.rehearsalDate,
    day_index: body.dayIndex,
    brief_produced: body.briefProduced,
    brief_analysis_id: body.briefAnalysisId ?? null,
    minutes_to_approval: body.minutesToApproval ?? null,
    absent_sources: body.absentSources ?? [],
    stale_sources: body.staleSources ?? [],
    human_corrections: body.humanCorrections ?? 0,
    rejected_conclusions: body.rejectedConclusions ?? 0,
    missed_events: body.missedEvents ?? 0,
    followup_note: body.followupNote ?? null,
    recorded_by: admin.id,
  });

  if (error) {
    const message = /duplicate key|unique/i.test(error.message)
      ? "این روز قبلاً ثبت شده است"
      : describe(new Error(error.message));
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
