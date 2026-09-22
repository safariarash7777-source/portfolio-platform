/**
 * تقدمِ اصلاحیه در انتخابِ گزارشِ هر دوره.
 *
 * ── چرا این تست وجود دارد ───────────────────────────────────────────────────
 * انتخابِ قبلی فقط `audited` و سپس `id` را می‌دید. `id` ترتیبِ **درج** است، نه
 * ترتیبِ انتشار — و `published_at` روی هر ۳۴۳۹ ردیفِ ن-۱۰ پروژهٔ اصلی `null`
 * است، پس هیچ مهرِ زمانیِ واقعی‌ای هم در کار نیست.
 *
 * اعدادِ این تست از اندازه‌گیریِ فقط‌خواندنیِ پروژهٔ اصلی (۱۴۰۵/۰۶/۲۸) آمده‌اند،
 * نه از حدس: فولاد دورهٔ ۳ماههٔ منتهی به ۱۴۰۵/۰۳/۳۱ اصلاحیه‌ای با `id` **کمتر**
 * از نسخهٔ اولیه دارد، و شپنا دورهٔ ۶ماههٔ ۱۴۰۴/۰۶/۳۱ اصلاحیه‌ای با ارقامِ
 * **متفاوت**. روی کد قبلی هر دو مورد نسخهٔ اولیه را برمی‌گرداندند.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dedupeByPeriod, isAmendmentTitle, type CodalRow } from "./supabase";

const row = (
  id: number,
  opts: { audited: boolean; amend: boolean; revenue: number; pm?: number; period?: string }
): CodalRow => ({
  id,
  symbol: "تست",
  report_kind: "ن-۱۰",
  period_end: opts.period ?? "2026-06-21",
  title: opts.amend
    ? "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه (حسابرسی نشده)(اصلاحیه)"
    : "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه (حسابرسی نشده)",
  source_url: `https://codal.ir/x/${id}`,
  data: {
    period_end: opts.period ?? "2026-06-21",
    period_months: opts.pm ?? 3,
    audited: opts.audited,
    standalone: { revenue: opts.revenue },
  } as never,
  raw: null,
});

const pick = (rows: CodalRow[]) => dedupeByPeriod(rows)[0]!;

describe("تشخیصِ اصلاحیه از عنوان", () => {
  test("عنوانِ دارای «اصلاحیه» شناخته می‌شود", () => {
    assert.equal(isAmendmentTitle("صورت‌های مالی … (اصلاحیه)"), true);
  });

  test("املای عربیِ «اصلاحيه» هم شناخته می‌شود", () => {
    // ⚠️ این املا واقعاً در عنوان‌های کدال هست؛ بدونِ نرمال‌سازی نامرئی می‌ماند.
    assert.equal(isAmendmentTitle("صورت‌های مالی … (اصلاحيه)"), true);
  });

  test("عنوانِ عادی اصلاحیه نیست و ورودیِ خالی نمی‌شکند", () => {
    assert.equal(isAmendmentTitle("صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹"), false);
    assert.equal(isAmendmentTitle(null), false);
    assert.equal(isAmendmentTitle(undefined), false);
  });
});

describe("تقدمِ اصلاحیه بر نسخهٔ اولیه", () => {
  test("اصلاحیه حتی با id کمتر برنده است — موردِ واقعیِ فولاد", () => {
    // id ۴۰۴۷ اصلاحیه، id ۴۰۴۸ نسخهٔ اولیه. کد قبلی ۴۰۴۸ را برمی‌گرداند.
    const chosen = pick([
      row(4047, { audited: false, amend: true, revenue: 834_166_799 }),
      row(4048, { audited: false, amend: false, revenue: 834_166_799 }),
    ]);
    assert.equal(chosen.id, 4047);
    assert.equal(isAmendmentTitle(chosen.title), true);
  });

  test("وقتی ارقام فرق دارند، رقمِ اصلاحیه انتخاب می‌شود — موردِ واقعیِ شپنا", () => {
    const chosen = pick([
      // شناسه‌ها عینِ پروژهٔ اصلی‌اند: اصلاحیه ۹۰۶۴ و نسخهٔ اولیه ۹۰۶۵ —
      // یعنی اصلاحیه `id` کوچک‌تر دارد و با قاعدهٔ قبلی می‌باخت.
      row(9064, { audited: false, amend: true, revenue: 1_228_343_563, pm: 3, period: "2024-06-20" }),
      row(9065, { audited: false, amend: false, revenue: 1_224_492_187, pm: 3, period: "2024-06-20" }),
    ]);
    assert.equal(
      (chosen.data as { standalone: { revenue: number } }).standalone.revenue,
      1_228_343_563,
      "رقمِ باطل‌شده نباید برنده شود"
    );
  });

  test("حسابرسی‌شده همچنان بر اصلاحیهٔ حسابرسی‌نشده مقدم است", () => {
    // ⚠️ ترتیب عوض نشد: اصلاحیه فقط **در همان وضعیتِ حسابرسی** تقدم دارد.
    // یک اصلاحیهٔ حسابرسی‌نشده، گزارشِ حسابرسی‌شده را کنار نمی‌زند.
    const chosen = pick([
      row(10, { audited: true, amend: false, revenue: 3_490_894_407 }),
      row(11, { audited: false, amend: true, revenue: 3_477_461_406 }),
    ]);
    assert.equal(chosen.id, 10);
  });

  test("بینِ دو اصلاحیه، جدیدترین id برنده است", () => {
    const chosen = pick([
      row(20, { audited: false, amend: true, revenue: 100 }),
      row(21, { audited: false, amend: true, revenue: 200 }),
    ]);
    assert.equal(chosen.id, 21);
  });

  test("بینِ دو نسخهٔ عادی، رفتارِ قبلی حفظ شده", () => {
    const chosen = pick([
      row(30, { audited: false, amend: false, revenue: 100 }),
      row(31, { audited: false, amend: false, revenue: 200 }),
    ]);
    assert.equal(chosen.id, 31);
  });

  test("دوره‌های متفاوت با هم قاطی نمی‌شوند", () => {
    const out = dedupeByPeriod([
      row(40, { audited: false, amend: false, revenue: 100, pm: 3, period: "2026-06-21" }),
      row(41, { audited: false, amend: false, revenue: 200, pm: 12, period: "2026-03-20" }),
    ]);
    assert.equal(out.length, 2);
  });
});

/**
 * زمانِ انتشار به‌جای `id` در تساوی — ۱۴۰۵/۰۶/۳۱.
 *
 * همهٔ شناسه‌ها، زمان‌ها و ارقامِ زیر از خواندنِ فقط‌خواندنیِ Production آمده‌اند.
 * در هر سه نمونه `id` **برعکسِ** زمانِ انتشار است (بک‌فیلِ آرشیو از جدید به قدیم
 * درج کرده) — و همین است که کدِ #150 را به گزارشِ کهنه می‌برد.
 */
const pub = (
  id: number,
  date: string,
  time: string,
  opts: { audited?: boolean; amend?: boolean; revenue: number; netProfit?: number; consolidated?: boolean },
): CodalRow => {
  const r = row(id, { audited: opts.audited ?? false, amend: opts.amend ?? false, revenue: opts.revenue });
  if (opts.consolidated) r.title = `صورت‌های مالی تلفیقی سال مالی (حسابرسی نشده)${opts.amend ? "(اصلاحیه)" : ""}`;
  if (opts.netProfit !== undefined) (r.data as unknown as { standalone: Record<string, number> }).standalone.net_profit = opts.netProfit;
  r.raw = { date_publish: date, time_publish: time };
  return r;
};

describe("زمانِ انتشار در تساوی", () => {
  // ❌ تصحیح: این دو آزمون پیش‌تر فخاس و ذوب را «گزارشِ دیرترِ همان دوره» می‌گرفتند
  // و انتظار داشتند دیرتر برنده شود. عنوانِ واقعیِ هر دو «دیرتر» تلفیقی است.
  // حالا با عنوانِ واقعی: گزارشِ جداگانهٔ شرکت برنده است، هرچند زودتر آمده.
  test("فخاس سالانهٔ ۱۴۰۳ (شناسه و عنوانِ واقعی): جداگانه (۰۳/۰۶) بر تلفیقیِ دیرتر (۰۴/۱۳)", () => {
    const sep = pub(8275, "۱۴۰۴/۰۳/۰۶", "۱۷:۱۴:۲۵", { revenue: 262508422, netProfit: 73398051 });
    const cons = pub(8274, "۱۴۰۴/۰۴/۱۳", "۱۵:۱۴:۴۰", { consolidated: true, revenue: 262955304, netProfit: 61536590 });
    for (const order of [[sep, cons], [cons, sep]]) {
      const w = pick(order);
      assert.equal(w.id, 8275);
      assert.equal((w.data as { standalone: { net_profit: number } }).standalone.net_profit, 73398051);
    }
  });

  test("ذوب ۶ماههٔ ۱۴۰۴ (واقعی): جداگانه (۰۸/۰۱) بر تلفیقیِ دیرتر (۰۸/۳۰)", () => {
    const sep = pub(4517, "۱۴۰۴/۰۸/۰۱", "۰۰:۱۷:۳۸", { revenue: 301142570 });
    const cons = pub(4516, "۱۴۰۴/۰۸/۳۰", "۰۶:۴۴:۳۱", { consolidated: true, revenue: 314634906 });
    assert.equal(pick([sep, cons]).id, 4517);
    assert.equal(pick([cons, sep]).id, 4517);
  });

  test("فملی ۹ماههٔ ۱۴۰۴ (واقعی، هم‌دامنه): انتشارِ ۱۱/۰۸ بر ۱۱/۰۷ با وجودِ `id` کمتر", () => {
    const early = pub(23, "۱۴۰۴/۱۱/۰۷", "۱۹:۳۴:۴۰", { revenue: 1894724914 });
    const late = pub(21, "۱۴۰۴/۱۱/۰۸", "۱۳:۲۲:۲۲", { revenue: 1894724914 });
    assert.equal(pick([early, late]).id, 21);
    assert.equal(pick([late, early]).id, 21);
  });

  test("پاریز: از سه اصلاحیه، آخرین منتشرشده — نه قدیمی‌ترین با بزرگ‌ترین `id`", () => {
    const a = pub(2967, "۱۴۰۴/۱۲/۰۵", "۱۷:۱۶:۱۵", { amend: true, revenue: 5142308 });
    const b = pub(2966, "۱۴۰۴/۱۲/۱۸", "۰۸:۳۶:۵۳", { amend: true, revenue: 5142308 });
    const c = pub(2965, "۱۴۰۵/۰۳/۱۶", "۲۱:۲۰:۰۵", { amend: true, revenue: 5142309 });
    for (const order of [[a, b, c], [c, b, a], [b, a, c]]) assert.equal(pick(order).id, 2965);
  });

  test("زمان بالای اصلاحیه نمی‌نشیند: تلفیقیِ دیرتر جای اصلاحیه را نمی‌گیرد (حآفرین)", () => {
    // اصلاحیه ۱۴۰۵/۰۴/۰۲، گزارشِ تلفیقیِ بی‌اصلاحیه ۱۴۰۵/۰۴/۲۰. تلفیقی گزارشِ دیگری
    // است نه نسخهٔ تازهٔ همان؛ اگر زمان بالاتر بود، صورتِ گروه برنده می‌شد.
    const amend = pub(7085, "۱۴۰۵/۰۴/۰۲", "۱۷:۱۴:۳۳", { amend: true, revenue: 1 });
    const laterConsol = pub(7084, "۱۴۰۵/۰۴/۲۰", "۰۸:۳۲:۰۳", { consolidated: true, revenue: 2 });
    assert.equal(pick([amend, laterConsol]).id, 7085);
    assert.equal(pick([laterConsol, amend]).id, 7085);
  });

  test("حسابرسی همچنان بالای زمان است", () => {
    const audited = pub(10, "۱۴۰۴/۰۱/۰۱", "۱۰:۰۰:۰۰", { audited: true, revenue: 1 });
    const later = pub(11, "۱۴۰۵/۰۱/۰۱", "۱۰:۰۰:۰۰", { revenue: 2 });
    assert.equal(pick([later, audited]).id, 10);
  });

  test("زمانِ نامعلوم یا ناقص → برگشت به `id`، نه حدس", () => {
    const known = pub(100, "۱۴۰۵/۰۱/۰۱", "۱۰:۰۰:۰۰", { revenue: 1 });
    const unknown = pub(99, "", "", { revenue: 2 });
    const noRaw = { ...pub(98, "x", "y", { revenue: 3 }), raw: null };
    assert.equal(pick([known, unknown]).id, 100);
    assert.equal(pick([unknown, known]).id, 100);
    assert.equal(pick([noRaw, unknown]).id, 99);
  });

  test("زمانِ دقیقاً یکسان → `id` (یکی از ۶ گروهِ واقعی)", () => {
    const x = pub(500, "۱۴۰۴/۰۵/۰۱", "۱۲:۰۰:۰۰", { revenue: 1 });
    const y = pub(501, "۱۴۰۴/۰۵/۰۱", "۱۲:۰۰:۰۰", { revenue: 2 });
    assert.equal(pick([x, y]).id, 501);
    assert.equal(pick([y, x]).id, 501);
  });
});

describe("publishKey", () => {
  test("رقمِ فارسی و عربی → لاتین، شکلِ قابلِ مقایسه", async () => {
    const { publishKey } = await import("./supabase");
    assert.equal(publishKey({ raw: { date_publish: "۱۴۰۴/۰۴/۱۳", time_publish: "۱۵:۱۴:۴۰" } }), "1404/04/13 15:14:40");
    assert.equal(publishKey({ raw: { date_publish: "١٤٠٤/٠٤/١٣", time_publish: "١٥:١٤:٤٠" } }), "1404/04/13 15:14:40");
  });

  test("شکلِ نامعتبر → null", async () => {
    const { publishKey } = await import("./supabase");
    for (const [d, t] of [["۱۴۰۴/۱۳/۰۱", "۱۰:۰۰:۰۰"], ["۱۴۰۴/۴/۱۳", "۱۵:۱۴:۴۰"], ["۱۴۰۴/۰۴/۱۳", "۲۴:۰۰:۰۰"], ["۱۴۰۴/۰۴/۱۳", "۱۵:۱۴"], ["", ""]]) {
      assert.equal(publishKey({ raw: { date_publish: d, time_publish: t } }), null, `${d} ${t}`);
    }
    assert.equal(publishKey({ raw: null }), null);
  });
});

describe("دامنه: جداگانه بر تلفیقی (B-056)", () => {
  test("تشخیصِ «تلفیقی» با ی/ک عربی", async () => {
    const { isConsolidatedTitle } = await import("./supabase");
    assert.equal(isConsolidatedTitle("صورت‌های مالی تلفيقي سال مالی"), true);
    assert.equal(isConsolidatedTitle("صورت‌های مالی سال مالی"), false);
    assert.equal(isConsolidatedTitle(null), false);
  });

  test("جداگانهٔ حسابرسی‌نشده بر تلفیقیِ حسابرسی‌شده و اصلاحیهٔ تلفیقی مقدم است", () => {
    const sep = pub(1, "۱۴۰۴/۰۱/۰۱", "۱۰:۰۰:۰۰", { revenue: 100 });
    const consAudited = pub(2, "۱۴۰۴/۰۲/۰۱", "۱۰:۰۰:۰۰", { audited: true, consolidated: true, revenue: 105 });
    const consAmend = pub(3, "۱۴۰۴/۰۳/۰۱", "۱۰:۰۰:۰۰", { amend: true, consolidated: true, revenue: 106 });
    for (const order of [[sep, consAudited, consAmend], [consAmend, consAudited, sep], [consAudited, sep, consAmend]]) {
      assert.equal(pick(order).id, 1);
    }
  });
});
