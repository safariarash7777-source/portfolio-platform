import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasRealPrice } from "./market-price";

/**
 * گاردِ قیمتِ واقعی.
 *
 * ⚠️ چرا این تست وجود دارد: نسخهٔ اولِ این گارد فقط در `LiveMarket` بود و
 * `MarketTicker` — که همان پاسخِ `/api/market` را رندر می‌کند — بدونِ گارد
 * ماند. تستِ رفتاریِ مرورگر آن نشتی را پیدا کرد، ولی تستِ مرورگر در CI اجرا
 * نمی‌شود. این تست تعریفِ مشترک را نگه می‌دارد؛ تستِ ساختاریِ پایین هم مطمئن
 * می‌شود هر دو سطح واقعاً از همین تعریف استفاده کنند.
 */

describe("hasRealPrice", () => {
  test("قیمتِ مثبت واقعی است", () => {
    for (const v of [1, 0.5, 111111111, Number.MAX_SAFE_INTEGER]) {
      assert.equal(hasRealPrice(v), true, `${v}`);
    }
  });

  test("صفر واقعی نیست — «۰ تومان» از دادهٔ واقعی قابلِ تشخیص نیست", () => {
    assert.equal(hasRealPrice(0), false);
    assert.equal(hasRealPrice(-0), false);
  });

  test("منفی واقعی نیست", () => {
    assert.equal(hasRealPrice(-1), false);
  });

  test("تهی و تعریف‌نشده واقعی نیستند", () => {
    assert.equal(hasRealPrice(null), false);
    assert.equal(hasRealPrice(undefined), false);
  });

  test("NaN و بی‌نهایت واقعی نیستند", () => {
    assert.equal(hasRealPrice(Number.NaN), false);
    assert.equal(hasRealPrice(Number.POSITIVE_INFINITY), false);
    assert.equal(hasRealPrice(Number.NEGATIVE_INFINITY), false);
  });
});

describe("هر دو سطحِ عمومی از همین تعریف استفاده می‌کنند", () => {
  // این بخش عمداً ساختاری است: اگر کسی یک سطحِ سومِ بازار اضافه کند و گارد را
  // فراموش کند، این تست چیزی نمی‌گوید — ولی اگر یکی از این دو سطح تعریفِ
  // مشترک را رها کند، همین‌جا قرمز می‌شود.
  for (const file of [
    "components/landing/LiveMarket.tsx",
    "components/market/MarketTicker.tsx",
  ]) {
    test(`${file} گاردِ مشترک را وارد و استفاده می‌کند`, () => {
      const src = readFileSync(file, "utf8");
      assert.match(src, /from "@\/lib\/market-price"/, "import گم شده");
      assert.match(src, /hasRealPrice\(/, "گارد فراخوانی نمی‌شود");
    });
  }
});
