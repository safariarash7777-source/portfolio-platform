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
