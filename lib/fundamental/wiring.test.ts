/**
 * سیم‌کشیِ انتخابِ گزارش از ورودیِ عمومی تا کارت **و** فصل‌ها.
 *
 * ── چرا جدا از `amendment.test.ts` ─────────────────────────────────────────
 * `amendment.test.ts` تابعِ `dedupeByPeriod` را جدا می‌آزماید. ولی صفحهٔ نماد
 * از دو راه عدد می‌گیرد: کارتِ اصلی از `n10`، و فصل‌ها/TTM/P/E از `n10Periods`
 * که به `deriveQuarters` می‌رود. تا ۱۴۰۵/۰۶/۳۱ راهِ دوم **همهٔ** نسخه‌ها را
 * می‌گرفت و `lib/core/quarterly` دوباره با قاعدهٔ قدیمی (حسابرسی ← `id`)
 * انتخاب می‌کرد — پس اصلاحِ #150 به کارت رسید ولی به فصل‌ها نه. یک صفحه، دو پاسخ.
 *
 * این آزمون از `getFundamentalsFromSupabase` وارد می‌شود (همان که
 * `lib/fundamental/registry.ts` و `app/symbol/[symbol]/page.tsx` صدا می‌زنند) و
 * هر دو خروجی را روی **یک** دوره می‌سنجد.
 *
 * دادهٔ ۱۲ماهه از Production است (فخاس، سالانهٔ ۱۴۰۳، شناسه‌ها و زمان‌های
 * واقعی). ردیفِ ۹ماهه **ساختگی** است و فقط برای ساختنِ حلقهٔ Q4 آمده.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { getFundamentalsFromSupabase, type CodalRow } from "./supabase";
import { deriveQuarters, type QuarterInput } from "@/lib/core/quarterly";

const annual = (id: number, date: string, time: string, revenue: number, netProfit: number): CodalRow => ({
  id,
  symbol: "فخاس",
  report_kind: "ن-۱۰",
  period_end: "1403-12-30",
  title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۳/۱۲/۳۰ (حسابرسی نشده)",
  source_url: `https://codal.ir/Reports/Decision.aspx?LetterSerial=${id}`,
  data: {
    period_end: "1403-12-30",
    period_months: 12,
    audited: false,
    capital: 10_000_000,
    standalone: {
      revenue,
      cogs: -revenue * 0.6,
      gross_profit: revenue * 0.4,
      operating_profit: revenue * 0.3,
      net_profit: netProfit,
    },
  } as never,
  raw: { date_publish: date, time_publish: time },
});

// ساختگی — فقط حلقهٔ ۹ماهه برای Q4 = ۱۲ماهه − ۹ماهه.
const NINE_MONTH_NET = 40_000_000;
const nineMonth: CodalRow = {
  ...annual(8000, "۱۴۰۳/۱۱/۰۱", "۱۰:۰۰:۰۰", 190_000_000, NINE_MONTH_NET),
  period_end: "1403-09-30",
  title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۹ ماهه منتهی به ۱۴۰۳/۰۹/۳۰ (حسابرسی نشده)",
};
(nineMonth.data as { period_end: string; period_months: number }).period_end = "1403-09-30";
(nineMonth.data as { period_end: string; period_months: number }).period_months = 9;

// Production: `id` برعکسِ زمانِ انتشار است — همان چیزی که قاعدهٔ `id` را فریب می‌دهد.
const EARLY = annual(8275, "۱۴۰۴/۰۳/۰۶", "۱۷:۱۴:۲۵", 262_508_422, 73_398_051);
const LATE = annual(8274, "۱۴۰۴/۰۴/۱۳", "۱۵:۱۴:۴۰", 262_955_304, 61_536_590);

let realFetch: typeof fetch;
const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

before(() => {
  realFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
  // مثلِ PostgREST با `order=id.desc`.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([EARLY, LATE, nineMonth].sort((a, b) => b.id - a.id)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
});

/** عیناً نگاشتِ `app/symbol/[symbol]/page.tsx` (بخشِ T3) از `n10Periods` به ورودیِ فصلی. */
const toQuarterInputs = (periods: NonNullable<Awaited<ReturnType<typeof getFundamentalsFromSupabase>>>["n10Periods"]) =>
  (periods ?? []).map((p): QuarterInput => ({
    id: p.id,
    period_end: p.data.period_end,
    period_months: p.data.period_months,
    audited: p.data.audited,
    capital: p.data.capital,
    revenue: p.data.standalone.revenue,
    gross_profit: p.data.standalone.gross_profit,
    operating_profit: p.data.standalone.operating_profit,
    net_profit: p.data.standalone.net_profit,
  }));

test("کارت و فصل‌ها روی یک دوره یک گزارش را می‌بینند — گزارشِ دیرتر منتشرشده", async () => {
  const f = await getFundamentalsFromSupabase("فخاس");
  assert.ok(f?.n10, "کارتِ ن-۱۰ ساخته نشد");

  // ۱) کارتِ اصلی
  assert.equal(f.n10.data.standalone.net_profit, 61_536_590);
  assert.match(f.n10.source.source_url ?? "", /LetterSerial=8274$/);

  // ۲) ورودیِ فصل‌سازی: یک ردیف برای هر دوره، و همان ردیفِ کارت
  const annualRows = (f.n10Periods ?? []).filter((p) => p.data.period_months === 12);
  assert.deepEqual(annualRows.map((p) => p.id), [8274]);

  // ۳) خروجیِ نهاییِ صفحه: Q4 = ۱۲ماهه − ۹ماهه، از گزارشِ درست
  const q4 = deriveQuarters(toQuarterInputs(f.n10Periods)).find((q) => q.fy === 1403 && q.q === 4);
  assert.ok(q4, "Q4 1403 ساخته نشد");
  assert.equal(q4.netProfit, 61_536_590 - NINE_MONTH_NET);
});
