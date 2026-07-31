import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyQueryError } from "@/lib/health/status";
import {
  buildDeskView,
  buildPanel,
  type DeskPanel,
  type PanelInput,
  type PanelSpec,
} from "@/lib/desk/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/desk — میزِ آرش (فقط ادمین). `G3-002`.
 *
 * قواعدِ سختِ این روت:
 *  ۱. **لایهٔ تجمیع است، نه موتور.** هیچ محاسبهٔ مالی اینجا نیست؛ فقط شمارش
 *     و آخرین زمان از منابعِ موجود. طبقه‌بندی در `lib/desk/contracts.ts` است
 *     («یک موتور، چند نما»).
 *  ۲. **هیچ عددِ ساختگی.** منبعِ ناموجود → `unavailable`، نه صفر.
 *  ۳. هر بخش try/catchِ خودش را دارد: شکستِ یک پرس‌وجو نباید کلِ میز را خالی
 *     کند — درسِ `B-024`.
 *  ۴. هیچ Agent، هیچ LLM، هیچ وابستگیِ OpenAI.
 *  ۵. هیچ سکرت، هیچ دادهٔ شخصیِ کاربر — فقط شمارشِ تجمیعی.
 *
 * دسترسی دو لایه گیت می‌شود: `app/(protected)/admin/layout.tsx` نما را، و
 * همین روت مستقلاً داده را. یکی از این دو کافی نیست.
 */

type Admin = ReturnType<typeof createAdminClient>;

/**
 * شمارش + آخرین زمانِ یک جدول، با تفکیکِ «جدول نیست» از «خالی است».
 *
 * این تفکیک کلِ نکته است. `count=0` با `available=false` یکی نیست، و ادغامشان
 * دقیقاً همان اشتباهی است که سه بار در این پروژه شاخص را بی‌فایده کرد.
 */
async function probe(
  admin: Admin,
  table: string,
  timeColumn: string | null
): Promise<PanelInput> {
  try {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      const kind = classifyQueryError(error.code, error.message);
      return {
        available: false,
        count: 0,
        unavailableReason:
          kind === "missing_table"
            ? `جدولِ \`${table}\` هنوز اجرا نشده — migration مربوطه NOT_APPLIED است`
            : `پرس‌وجوی \`${table}\` مردود شد`,
      };
    }

    const rows = count ?? 0;
    if (rows === 0 || !timeColumn) return { available: true, count: rows };

    const { data, error: timeError } = await admin
      .from(table)
      .select(timeColumn)
      .order(timeColumn, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (timeError) {
      // جدول هست و ستون نیست → باگِ خودِ ماست، نه واقعیتِ محیط. شمارش معتبر
      // است، پس بخش را `unavailable` نمی‌کنیم؛ فقط بدونِ زمان گزارش می‌شود.
      return { available: true, count: rows };
    }
    const value = (data as Record<string, unknown> | null)?.[timeColumn];
    return { available: true, count: rows, lastAt: typeof value === "string" ? value : null };
  } catch {
    return { available: false, count: 0, unavailableReason: `پرس‌وجوی \`${table}\` مردود شد` };
  }
}

/** جمعِ چند منبع در یک بخش: در دسترس بودن یعنی **دستِ‌کم یکی** پاسخ داد. */
function mergeInputs(inputs: PanelInput[]): PanelInput {
  const reachable = inputs.filter((i) => i.available);
  if (reachable.length === 0) {
    return {
      available: false,
      count: 0,
      unavailableReason:
        inputs.map((i) => i.unavailableReason).find(Boolean) ??
        "هیچ‌کدام از منابعِ این بخش در دسترس نیست",
    };
  }
  const times = reachable
    .map((i) => (typeof i.lastAt === "string" ? i.lastAt : null))
    .filter((t): t is string => Boolean(t))
    .sort();
  return {
    available: true,
    count: reachable.reduce((sum, i) => sum + i.count, 0),
    lastAt: times.length > 0 ? times[times.length - 1] : null,
  };
}

const fa = (n: number) => n.toLocaleString("fa-IR");

export async function GET() {
  // ── Auth: فقط admin ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const admin = createAdminClient();
  const panels: DeskPanel[] = [];

  // ── ۱) امروز — از موتورهای بازارِ موجود، بدونِ محاسبهٔ تازه ──
  {
    const [snapshots, fx, breadth] = await Promise.all([
      probe(admin, "ir_market_snapshots", "captured_at"),
      probe(admin, "fx_rates", "date"),
      probe(admin, "market_breadth", "date"),
    ]);
    const spec: PanelSpec = {
      key: "today",
      sources: ["ir_market_snapshots", "fx_rates", "market_breadth"],
      // اسنپ‌شاتِ بازار هر ۳۰ دقیقه می‌آید؛ بیش از دو ساعت یعنی رله ساکت است.
      rule: { okWithinMinutes: 120, staleWithinMinutes: 24 * 60 },
      metrics: [
        { key: "snapshots", label: "اسنپ‌شاتِ بازار", value: snapshots.available ? fa(snapshots.count) : null },
        { key: "fx", label: "نرخِ ارز", value: fx.available ? fa(fx.count) : null },
        { key: "breadth", label: "نبضِ بازار", value: breadth.available ? fa(breadth.count) : null },
      ],
    };
    panels.push(buildPanel(spec, mergeInputs([snapshots, fx, breadth]), now));
  }

  // ── ۲) هوشمندیِ بازار — رخداد و شاهد؛ `intel_*` ممکن است اجرا نشده باشد ──
  {
    const [events, evidence, content, codal] = await Promise.all([
      probe(admin, "intel_events", "occurred_at"),
      probe(admin, "intel_evidence", "observed_at"),
      probe(admin, "content_hub", "created_at"),
      probe(admin, "codal_reports", "created_at"),
    ]);
    const spec: PanelSpec = {
      key: "intelligence",
      sources: ["intel_events", "intel_evidence", "content_hub", "codal_reports"],
      rule: { okWithinMinutes: 48 * 60, staleWithinMinutes: 14 * 24 * 60 },
      metrics: [
        { key: "events", label: "رخدادِ ثبت‌شده", value: events.available ? fa(events.count) : null,
          hint: events.available ? undefined : "نیازمندِ اجرای `phase20`" },
        { key: "evidence", label: "شاهد", value: evidence.available ? fa(evidence.count) : null },
        { key: "content", label: "هابِ محتوا", value: content.available ? fa(content.count) : null },
        { key: "codal", label: "گزارشِ کدال", value: codal.available ? fa(codal.count) : null },
      ],
    };
    panels.push(buildPanel(spec, mergeInputs([events, evidence, content, codal]), now));
  }

  // ── ۳) تصمیم‌ها و سناریوها — صفِ تأیید، یک صف از دو منبع ──
  {
    const [outlooks, drafts, analyses] = await Promise.all([
      probe(admin, "weekly_outlooks", "created_at"),
      probe(admin, "signal_drafts", "created_at"),
      probe(admin, "intel_analyses", "created_at"),
    ]);
    const spec: PanelSpec = {
      key: "decisions",
      sources: ["weekly_outlooks", "signal_drafts", "intel_analyses"],
      rule: { okWithinMinutes: 7 * 24 * 60, staleWithinMinutes: 30 * 24 * 60 },
      metrics: [
        { key: "outlooks", label: "چشم‌اندازِ هفتگی", value: outlooks.available ? fa(outlooks.count) : null },
        { key: "drafts", label: "پیش‌نویسِ در انتظار", value: drafts.available ? fa(drafts.count) : null },
        { key: "analyses", label: "تحلیلِ ثبت‌شده", value: analyses.available ? fa(analyses.count) : null,
          hint: analyses.available ? undefined : "نیازمندِ اجرای `phase20`" },
      ],
    };
    panels.push(buildPanel(spec, mergeInputs([outlooks, drafts, analyses]), now));
  }

  // ── ۴) سبدِ مرجع — تنها بخشِ کاملاً تازه؛ بدونِ `phase20` وجود ندارد ──
  {
    const [portfolios, versions, positions] = await Promise.all([
      probe(admin, "intel_reference_portfolios", "created_at"),
      probe(admin, "intel_reference_versions", "created_at"),
      probe(admin, "intel_reference_positions", "created_at"),
    ]);
    const spec: PanelSpec = {
      key: "reference",
      sources: ["intel_reference_portfolios", "intel_reference_versions", "intel_reference_positions"],
      rule: null, // سبدِ مرجع «کهنه» نمی‌شود؛ یا نسخهٔ نهایی دارد یا ندارد.
      metrics: [
        { key: "portfolios", label: "سبد", value: portfolios.available ? fa(portfolios.count) : null },
        { key: "versions", label: "نسخه", value: versions.available ? fa(versions.count) : null },
        { key: "positions", label: "موقعیت", value: positions.available ? fa(positions.count) : null,
          hint: "وزنِ اولیهٔ سبد یک تصمیمِ باز است و مهندسی آن را حدس نمی‌زند" },
      ],
    };
    panels.push(buildPanel(spec, mergeInputs([portfolios, versions, positions]), now));
  }

  // ── ۵) عملیات و سلامت — دفترِ اجرای cron، نه حضورِ محصول ──
  {
    const cron = await probe(admin, "cron_runs", "started_at");
    const spec: PanelSpec = {
      key: "operations",
      sources: ["cron_runs", "/api/admin/health"],
      // یک cron روزانه؛ بیش از ۲۶ ساعت یعنی یک نوبت از دست رفته.
      rule: { okWithinMinutes: 26 * 60, staleWithinMinutes: 72 * 60 },
      metrics: [
        { key: "runs", label: "اجرای ثبت‌شده", value: cron.available ? fa(cron.count) : null,
          hint: cron.available ? undefined : "نیازمندِ اجرای `phase21`" },
      ],
    };
    panels.push(buildPanel(spec, cron, now));
  }

  return NextResponse.json(buildDeskView(panels, now));
}
