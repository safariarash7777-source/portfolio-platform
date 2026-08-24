import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { serviceRoleGap, SERVICE_ROLE_GAP_STATUS } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// چرخهٔ کارنامهٔ قابل راستی‌آزمایی — فقط ادمین (انسان در حلقه).
//  POST  { action:"publish", ... }        → درج در signals (هش در لحظهٔ انتشار — تریگر DB)
//  POST  { action:"close", ... }          → درج در signal_outcomes
//  POST  { action:"publish_weekly", ... } → درج در weekly_outlooks
//  POST  { action:"close_weekly", ... }   → درج در weekly_outlook_results
//  GET                                    → فهرست تحلیل‌ها + چشم‌اندازها (برای پنل ادمین)
//
// قوانین سخت: جدول‌ها append-only هستند (تریگر DB خودش UPDATE/DELETE را بلاک می‌کند).
// هیچ ویرایشی بعد از انتشار وجود ندارد.

type SessionClient = Awaited<ReturnType<typeof createClient>>;

async function requireAdmin(): Promise<{
  ok: boolean;
  userId: string | null;
  supabase: SessionClient;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, userId: null, supabase };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { ok: profile?.role === "admin", userId: user.id, supabase };
}

const OUTCOMES = ["target", "stop", "manual_close", "expired"] as const;
const LABELS = ["سازنده", "خنثی", "فرسایشی"] as const;

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  // ── خواندن با نشست ──
  // هر چهار جدولِ کارنامه سیاستِ `public read … (qual: true)` دارند، پس
  // خواندنشان هرگز به سکرتِ سرور نیاز نداشت. با آن گره، نبودِ یک متغیر کلِ
  // کارنامه را از دسترس خارج می‌کرد؛ حالا فقط **انتشار** (POST) که واقعاً
  // سیاستِ نوشتن ندارد به سکرت وابسته است.
  const admin = gate.supabase;
  const [sigs, outs, weeks, weekResults] = await Promise.all([
    admin
      .from("signals")
      .select(
        "id, seq, symbol, direction, entry_price, entry_date, horizon, reasons, published_at, record_hash"
      )
      .order("seq", { ascending: false })
      .limit(100),
    admin.from("signal_outcomes").select("signal_id, exit_price, exit_date, outcome, closed_at"),
    admin
      .from("weekly_outlooks")
      .select("id, seq, week_start, label, score, note_md, published_at, record_hash")
      .order("seq", { ascending: false })
      .limit(60),
    admin.from("weekly_outlook_results").select("outlook_id, realized_label, correct, closed_at"),
  ]);
  return NextResponse.json({
    analyses: sigs.data ?? [],
    outcomes: outs.data ?? [],
    weekly: weeks.error ? null : weeks.data ?? [],
    weeklyResults: weekResults.error ? null : weekResults.data ?? [],
    weeklyTableMissing: Boolean(weeks.error),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const admin = tryCreateAdminClient();
  if (!admin)
    return NextResponse.json(serviceRoleGap("کارنامهٔ تحلیل‌ها"), { status: SERVICE_ROLE_GAP_STATUS });

  // ── انتشار تحلیل نماد ──────────────────────────────────────────────
  if (action === "publish") {
    const symbol = String(body.symbol ?? "").trim();
    const direction = body.direction === "sell" ? "sell" : "buy";
    const entryPrice = Number(body.entry_price);
    const horizon = String(body.horizon ?? "").trim() || null;
    const bandLow = body.band_low != null && body.band_low !== "" ? Number(body.band_low) : null;
    const bandHigh = body.band_high != null && body.band_high !== "" ? Number(body.band_high) : null;
    const text = String(body.text ?? "").trim();
    const assumptions = Array.isArray(body.assumptions)
      ? body.assumptions.filter((a): a is string => typeof a === "string" && a.trim() !== "")
      : [];
    if (!symbol || !Number.isFinite(entryPrice) || entryPrice <= 0) {
      return NextResponse.json({ error: "نماد و قیمت مرجع الزامی است." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "متن تحلیل الزامی است (انسان در حلقه)." }, { status: 400 });
    }
    if ((bandLow != null && !Number.isFinite(bandLow)) || (bandHigh != null && !Number.isFinite(bandHigh))) {
      return NextResponse.json({ error: "بازهٔ ارزش نامعتبر است." }, { status: 400 });
    }
    if (bandLow != null && bandHigh != null && bandLow > bandHigh) {
      return NextResponse.json({ error: "کف بازه نباید از سقف بزرگ‌تر باشد." }, { status: 400 });
    }
    const reasons = {
      band: bandLow != null || bandHigh != null ? { low: bandLow, high: bandHigh } : null,
      assumptions,
      text,
    };
    const { data, error } = await admin
      .from("signals")
      .insert({
        symbol,
        direction,
        entry_price: entryPrice,
        horizon,
        reasons,
        approved_by: gate.userId,
      })
      .select("id, seq, record_hash, prev_hash, published_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "خطا در انتشار." }, { status: 500 });
    }
    return NextResponse.json({ published: data });
  }

  // ── بستن تحلیل نماد ────────────────────────────────────────────────
  if (action === "close") {
    const signalId = String(body.signal_id ?? "").trim();
    const exitPrice = Number(body.exit_price);
    const outcome = String(body.outcome ?? "");
    const note = String(body.note ?? "").trim() || null;
    if (!signalId || !Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ error: "شناسهٔ تحلیل و قیمت بستن الزامی است." }, { status: 400 });
    }
    if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) {
      return NextResponse.json({ error: "نوع نتیجه نامعتبر است." }, { status: 400 });
    }
    // جلوگیری از بستن دوباره
    const { data: existing } = await admin
      .from("signal_outcomes")
      .select("id")
      .eq("signal_id", signalId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "این تحلیل قبلاً بسته شده است." }, { status: 409 });
    }
    const { data, error } = await admin
      .from("signal_outcomes")
      .insert({ signal_id: signalId, exit_price: exitPrice, outcome, note })
      .select("id, seq, record_hash")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "خطا در ثبت نتیجه." }, { status: 500 });
    }
    return NextResponse.json({ closed: data });
  }

  // ── انتشار چشم‌انداز هفتگی ─────────────────────────────────────────
  if (action === "publish_weekly") {
    const weekStart = String(body.week_start ?? "").trim();
    const label = String(body.label ?? "");
    const score = body.score != null && body.score !== "" ? Number(body.score) : null;
    const noteMd = String(body.note_md ?? "").trim() || null;
    const drivers = Array.isArray(body.drivers) ? body.drivers : [];
    const assumptions = Array.isArray(body.assumptions) ? body.assumptions : [];
    const engineSnapshot = body.engine_snapshot ?? null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "تاریخ شروع هفته نامعتبر است." }, { status: 400 });
    }
    if (!LABELS.includes(label as (typeof LABELS)[number])) {
      return NextResponse.json({ error: "برچسب چشم‌انداز نامعتبر است." }, { status: 400 });
    }
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      return NextResponse.json({ error: "امتیاز باید بین ۰ تا ۱۰۰ باشد." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("weekly_outlooks")
      .insert({
        week_start: weekStart,
        label,
        score,
        drivers,
        assumptions,
        note_md: noteMd,
        engine_snapshot: engineSnapshot,
      })
      .select("id, seq, record_hash, published_at")
      .single();
    if (error || !data) {
      const missing = error?.message?.includes("weekly_outlooks");
      return NextResponse.json(
        {
          error: missing
            ? "جدول چشم‌انداز هفتگی هنوز ساخته نشده — sql/phase12_weekly_outlook.sql را در Supabase اجرا کنید."
            : error?.message ?? "خطا در انتشار چشم‌انداز.",
        },
        { status: missing ? 503 : 500 }
      );
    }
    return NextResponse.json({ published: data });
  }

  // ── بستن چشم‌انداز هفتگی ───────────────────────────────────────────
  if (action === "close_weekly") {
    const outlookId = String(body.outlook_id ?? "").trim();
    const realizedLabel = String(body.realized_label ?? "");
    const realizedScore =
      body.realized_score != null && body.realized_score !== "" ? Number(body.realized_score) : null;
    const note = String(body.note ?? "").trim() || null;
    const detail = body.detail ?? null;
    if (!outlookId) {
      return NextResponse.json({ error: "شناسهٔ چشم‌انداز الزامی است." }, { status: 400 });
    }
    if (!LABELS.includes(realizedLabel as (typeof LABELS)[number])) {
      return NextResponse.json({ error: "برچسب محقق‌شده نامعتبر است." }, { status: 400 });
    }
    const { data: outlook } = await admin
      .from("weekly_outlooks")
      .select("id, label")
      .eq("id", outlookId)
      .maybeSingle();
    if (!outlook) {
      return NextResponse.json({ error: "چشم‌انداز یافت نشد." }, { status: 404 });
    }
    const { data: existing } = await admin
      .from("weekly_outlook_results")
      .select("id")
      .eq("outlook_id", outlookId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "این چشم‌انداز قبلاً بسته شده است." }, { status: 409 });
    }
    const correct = outlook.label === realizedLabel;
    const { data, error } = await admin
      .from("weekly_outlook_results")
      .insert({
        outlook_id: outlookId,
        realized_label: realizedLabel,
        realized_score: realizedScore,
        correct,
        detail,
        note,
      })
      .select("id, seq, record_hash, correct")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "خطا در ثبت نتیجه." }, { status: 500 });
    }
    return NextResponse.json({ closed: data });
  }

  return NextResponse.json({ error: "عملیات ناشناخته." }, { status: 400 });
}
