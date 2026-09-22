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
 * دادهٔ ۱۲ماهه از Production است (فخاس، سالانهٔ ۱۴۰۳، شناسه‌ها، زمان‌ها و
 * **عنوان‌های** واقعی): ۸۲۷۵ جداگانهٔ شرکت (زودتر)، ۸۲۷۴ تلفیقی (دیرتر). ردیفِ
 * ۹ماهه **ساختگی** است و فقط برای ساختنِ حلقهٔ Q4 آمده.
 *
 * ❌ تصحیح: نسخهٔ قبلی هر دو را جداگانه فرض کرده بود و انتظار داشت دیرتر (۸۲۷۴،
 * ۶۱٬۵۳۶٬۵۹۰) برنده شود. آن رقمِ گروه است؛ رقمِ شرکت ۷۳٬۳۹۸٬۰۵۱ است.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { getFundamentalsFromSupabase, type CodalRow } from "./supabase";
import { deriveQuarters, type QuarterInput } from "@/lib/core/quarterly";

const annual = (id: number, date: string, time: string, revenue: number, netProfit: number, consolidated = false): CodalRow => ({
  id,
  symbol: "فخاس",
  report_kind: "ن-۱۰",
  period_end: "1403-12-30",
  title: consolidated
    ? "صورت‌های مالی تلفیقی سال مالی منتهی به ۱۴۰۳/۱۲/۳۰ (حسابرسی نشده)"
    : "صورت‌های مالی  سال مالی منتهی به ۱۴۰۳/۱۲/۳۰ (حسابرسی نشده)",
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

// Production: جداگانهٔ شرکت زودتر، تلفیقی دیرتر و با `id` کمتر.
const EARLY = annual(8275, "۱۴۰۴/۰۳/۰۶", "۱۷:۱۴:۲۵", 262_508_422, 73_398_051);
const LATE = annual(8274, "۱۴۰۴/۰۴/۱۳", "۱۵:۱۴:۴۰", 262_955_304, 61_536_590, true);

let realFetch: typeof fetch;
const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

before(() => {
  realFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
  globalThis.fetch = miniPostgrest(() => DATASET) as typeof fetch;
});

/** مجموعهٔ دادهٔ فعلی — هر آزمون می‌تواند جایگزینش کند. */
let DATASET: CodalRow[] = [];

/**
 * PostgRESTِ کوچک: فیلترِ `eq`، مرتب‌سازیِ چندکلیدی و `limit` را واقعاً اعمال
 * می‌کند. بدونِ این، برشِ `limit` اصلاً آزمون‌پذیر نیست.
 */
function miniPostgrest(data: () => CodalRow[]) {
  return async (url: string | URL) => {
    const u = new URL(String(url));
    let list = data().slice();
    for (const [k, v] of u.searchParams) {
      if (["select", "order", "limit"].includes(k)) continue;
      if (v.startsWith("eq.")) list = list.filter((r) => String((r as unknown as Record<string, unknown>)[k]) === v.slice(3));
      if (v === "not.is.null") list = list.filter((r) => (r as unknown as Record<string, unknown>)[k] != null);
    }
    const order = (u.searchParams.get("order") ?? "").split(",").filter(Boolean);
    list.sort((a, b) => {
      for (const o of order) {
        const [col, dir] = o.split(".");
        const av = String((a as unknown as Record<string, unknown>)[col] ?? "");
        const bv = String((b as unknown as Record<string, unknown>)[col] ?? "");
        const c = col === "id" ? Number(av) - Number(bv) : av.localeCompare(bv);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0;
    });
    const limit = Number(u.searchParams.get("limit") ?? "0");
    if (limit) list = list.slice(0, limit);
    return new Response(JSON.stringify(list), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

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

test("کارت و فصل‌ها روی یک دوره یک گزارش را می‌بینند — گزارشِ جداگانهٔ شرکت، نه تلفیقیِ دیرتر", async () => {
  DATASET = [EARLY, LATE, nineMonth];
  const f = await getFundamentalsFromSupabase("فخاس");
  assert.ok(f?.n10, "کارتِ ن-۱۰ ساخته نشد");

  // ۱) کارتِ اصلی
  assert.equal(f.n10.data.standalone.net_profit, 73_398_051);
  assert.match(f.n10.source.source_url ?? "", /LetterSerial=8275$/);
  assert.equal(f.n10.source.scope, "company");

  // ۲) ورودیِ فصل‌سازی: یک ردیف برای هر دوره، و همان ردیفِ کارت
  const annualRows = (f.n10Periods ?? []).filter((p) => p.data.period_months === 12);
  assert.deepEqual(annualRows.map((p) => p.id), [8275]);

  // ۳) خروجیِ نهاییِ صفحه: Q4 = ۱۲ماهه − ۹ماهه، از گزارشِ درست
  const q4 = deriveQuarters(toQuarterInputs(f.n10Periods)).find((q) => q.fy === 1403 && q.q === 4);
  assert.ok(q4, "Q4 1403 ساخته نشد");
  assert.equal(q4.netProfit, 73_398_051 - NINE_MONTH_NET);
});

// ── B-056: دامنهٔ شرکت در برابرِ تلفیقی ───────────────────────────────────
const mk = (
  id: number,
  symbol: string,
  pe: string,
  pm: number,
  o: { consolidated?: boolean; revenue: number; netProfit: number; date?: string; kind?: "ن-۱۰" | "ن-۳۰" },
): CodalRow => ({
  id,
  symbol,
  report_kind: o.kind ?? "ن-۱۰",
  period_end: pe,
  title: `${pm === 12 ? "صورت‌های مالی" : `اطلاعات و صورت‌های مالی میاندوره‌ای دوره ${pm} ماهه`}${o.consolidated ? " تلفیقی" : ""} (حسابرسی نشده)`,
  source_url: `https://codal.ir/Reports/Decision.aspx?LetterSerial=${id}`,
  data: {
    period_end: pe,
    period_months: pm,
    audited: false,
    capital: 10_000_000,
    standalone: {
      revenue: o.revenue, cogs: -o.revenue * 0.6, gross_profit: o.revenue * 0.4,
      operating_profit: o.revenue * 0.3, net_profit: o.netProfit,
    },
    ...(o.kind === "ن-۳۰" ? { products: [], fiscal_year: 1404 } : {}),
  } as never,
  raw: { date_publish: o.date ?? "۱۴۰۴/۰۱/۰۱", time_publish: "۱۰:۰۰:۰۰" },
});

test("گزارشِ جداگانه بر تلفیقیِ همان دوره مقدم است — حتی اگر تلفیقی دیرتر آمده باشد", async () => {
  DATASET = [
    mk(9001, "تستا", "1404-12-29", 12, { revenue: 100, netProfit: 10, date: "۱۴۰۵/۰۳/۰۱" }),
    mk(9002, "تستا", "1404-12-29", 12, { consolidated: true, revenue: 105, netProfit: 12, date: "۱۴۰۵/۰۴/۰۱" }),
  ];
  const f = await getFundamentalsFromSupabase("تستا");
  assert.equal(f?.n10?.data.standalone.revenue, 100);
  assert.equal(f?.n10?.source.scope, "company");
  assert.equal(f?.n10?.source.verified, true);
  assert.equal(f?.n10PeriodsScope, "company");
});

test("دورهٔ فقط‌تلفیقی: نمایش داده می‌شود ولی قطعی به شرکت نسبت داده نمی‌شود", async () => {
  DATASET = [mk(9101, "تستب", "1404-12-29", 12, { consolidated: true, revenue: 105, netProfit: 12 })];
  const f = await getFundamentalsFromSupabase("تستب");
  assert.equal(f?.n10?.source.scope, "consolidated_ambiguous");
  assert.equal(f?.n10?.source.verified, false, "تیکِ «اعتبارسنجی متقاطع» برای دامنهٔ مبهم نباید باشد");
  assert.match(f?.n10?.source.title ?? "", /تلفیقی/);
  assert.match(f?.n10?.source.verification_note ?? "", /گروه/);
  assert.equal(f?.n10PeriodsScope, "consolidated_ambiguous");
});

test("زنجیرهٔ فصلی دامنه‌ها را قاطی نمی‌کند: ۳ماههٔ جداگانه + ۶ماههٔ فقط‌تلفیقی ⇒ Q2 تهی", async () => {
  DATASET = [
    mk(9201, "تستج", "1404-03-31", 3, { revenue: 50, netProfit: 5 }),
    mk(9202, "تستج", "1404-06-31", 6, { consolidated: true, revenue: 130, netProfit: 14 }),
  ];
  const f = await getFundamentalsFromSupabase("تستج");
  assert.deepEqual((f?.n10Periods ?? []).map((p) => p.id), [9201], "تلفیقیِ سالِ دارای جداگانه کنار رفت");
  const q = deriveQuarters(toQuarterInputs(f?.n10Periods));
  assert.equal(q.find((x) => x.fy === 1404 && x.q === 2)?.netProfit ?? null, null, "Q2 = گروه − شرکت نباید ساخته شود");
  assert.equal(f?.n10PeriodsScope, "company");
});

test("limit: رشدِ ردیف تازه‌ترین دوره را نمی‌اندازد (id کمتر ولی period_end تازه‌تر)", async () => {
  // بک‌فیلِ آرشیو از جدید به قدیم درج کرد: تازه‌ترین سالانه کمترین id را دارد.
  const newest = mk(1, "تستد", "1404-12-29", 12, { revenue: 999, netProfit: 99 });
  const older = Array.from({ length: 450 }, (_, i) => {
    const y = 1400 - Math.floor(i / 4);
    const pm = [3, 6, 9, 12][i % 4];
    const pe = `${y}-${["03-31", "06-31", "09-30", "12-29"][i % 4]}`;
    return mk(1000 + i, "تستد", pe, pm, { revenue: 10 + i, netProfit: 1 });
  });
  DATASET = [newest, ...older];
  const f = await getFundamentalsFromSupabase("تستد");
  assert.equal(f?.n10?.data.period_end, "1404-12-29");
  assert.equal(f?.n10?.data.standalone.revenue, 999);
});

test("شپنا ۳ماههٔ ۱۴۰۳ (واقعی): Q1 از اصلاحیه، نه نسخهٔ اولیهٔ باطل — همان که کارت می‌بیند", async () => {
  // نقصِ سیم‌کشیِ #150 دقیقاً اینجا دیده می‌شد: کارت اصلاحیه (۹۰۶۴) را انتخاب می‌کرد،
  // ولی `lib/core/quarterly` با `id` بزرگ‌تر نسخهٔ اولیه (۹۰۶۵) را، پس نمودارِ فصلی
  // سودِ خالصِ Q1 را ۳۰٬۲۷۷٬۳۲۷ نشان می‌داد در حالی که رقمِ اصلاح‌شده ۳۳٬۴۵۰٬۱۷۱ است.
  const q1 = (id: number, amend: boolean, np: number, date: string): CodalRow => ({
    ...mk(id, "شپنا", "1403-03-31", 3, { revenue: 1_000_000, netProfit: np, date }),
    title: `اطلاعات و صورت‌های مالی میاندوره‌ای  دوره ۳ ماهه منتهی به  ۱۴۰۳/۰۳/۳۱ (حسابرسی نشده)${amend ? "(اصلاحیه)" : ""}`,
  });
  DATASET = [q1(9064, true, 33_450_171, "۱۴۰۳/۰۵/۲۰"), q1(9065, false, 30_277_327, "۱۴۰۳/۰۴/۳۰")];
  const f = await getFundamentalsFromSupabase("شپنا");
  assert.deepEqual((f?.n10Periods ?? []).map((p) => p.id), [9064]);
  const q = deriveQuarters(toQuarterInputs(f?.n10Periods)).find((x) => x.fy === 1403 && x.q === 1);
  assert.equal(q?.netProfit, 33_450_171);
});
