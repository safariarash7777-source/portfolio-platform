import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * گاردِ ادعاهای همگانی روی مسیرِ عمومی.
 *
 * ── چرا ─────────────────────────────────────────────────────────────────────
 *
 * هیرو نوشته بود «**هر** تحلیل فرض‌ها و سناریوهایش را همراه دارد». همین صفحه
 * نقضش می‌کرد: `InsightsPreview` مطالبِ خامِ تلگرام و اینستاگرام را رندر می‌کند
 * که فقط عنوان، پلتفرم و تاریخ دارند.
 *
 * ادعای همگانی («هر…»، «همهٔ…»، «تمامِ…») دربارهٔ تحلیل‌ها فقط وقتی مجاز است که
 * هر چیزی که صفحه نشان می‌دهد واقعاً آن ویژگی را داشته باشد. چون صفحهٔ اصلی
 * دو جنسِ متفاوت را کنارِ هم نشان می‌دهد (پستِ شبکهٔ اجتماعی و تحلیلِ کارنامه)،
 * گزارهٔ درست **شرطی** است، نه همگانی.
 */
const PUBLIC_COPY_FILES = [
  "components/landing/Hero.tsx",
  "components/landing/AboutStrip.tsx",
  "components/landing/Method.tsx",
  "components/landing/TwoProducts.tsx",
  "components/landing/TrackRecordStrip.tsx",
  "app/about/page.tsx",
];

/** «هر/همه/تمامِ …تحلیل» — کمّی‌سنجِ همگانی روی چیزی که صفحه اثباتش نمی‌کند. */
const BLANKET = [
  /هر\s+تحلیل/,
  /همهٔ?\s+تحلیل/,
  /تمامِ?\s+تحلیل/,
  /هر\s+مطلب/,
  /همهٔ?\s+مطالب/,
];

function copyOf(file: string): string {
  // فقط متنِ قابلِ نمایش؛ کامنت‌های کد که خودشان دربارهٔ همین قاعده توضیح
  // می‌دهند نباید تست را قرمز کنند.
  const src = readFileSync(file, "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("ادعای همگانی روی مسیرِ عمومی", () => {
  for (const file of PUBLIC_COPY_FILES) {
    test(`${file} کمّی‌سنجِ همگانی دربارهٔ تحلیل‌ها ندارد`, () => {
      const copy = copyOf(file);
      for (const re of BLANKET) {
        assert.ok(
          !re.test(copy),
          `ادعای همگانی «${re.source}» پیدا شد. اگر واقعاً برای همهٔ موارد صادق است اثباتش را کنارش بگذار، وگرنه شرطی‌اش کن.`
        );
      }
    });
  }

  test("اطلاعات قابلِ اثبات در بخش مربوط به خود باقی می‌ماند", () => {
    // کوتاه‌شدن معرفی نباید منبع/تاریخ مطالب یا مقصد کارنامه را حذف کند.
    // جای همهٔ این اطلاعات در متن Hero اجباری نیست.
    assert.match(copyOf("components/landing/Hero.tsx"), /زمانِ? به‌روزرسانی/);
    const insights = copyOf("components/landing/InsightsPreview.tsx");
    assert.match(insights, /href=\{item\.content_url\}/, "کارت باید به منبع واقعی پیوند بدهد");
    assert.match(insights, /PLATFORM_META\[item\.platform\]/);
    assert.match(insights, /formatJalali\(item\.published_at\)/, "تاریخ باید از رکورد محتوا بیاید");
    assert.match(copyOf("components/layout/Navbar.tsx"), /href: "\/analyses", label: "کارنامه"/);
  });
});
