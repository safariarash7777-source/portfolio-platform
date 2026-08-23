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

describe("هر سطحِ عمومیِ بازار از یک مسیرِ گاردشده رد می‌شود", () => {
  // ساختاری و عمدی. دو سطحِ عمومی دو معماریِ متفاوت دارند و نباید یک ادعای
  // یکسان برایشان نوشت:
  //
  //   LiveMarket   ردیف‌های خامِ پاسخ را خودش رندر می‌کند ⇒ باید گاردها را
  //                مستقیم صدا بزند.
  //   MarketTicker فقط خروجیِ `selectTickerAssets` را رندر می‌کند ⇒ گارد
  //                داخلِ همان تابع است (و در market-ticker-select.test.ts
  //                رفتاری تست شده). ادعای درست اینجا این است که تیکر واقعاً
  //                از آن مسیر رد می‌شود و آرایه‌های خام را دور نمی‌زند.

  test("LiveMarket گاردِ قیمت و گاردِ درصد را مستقیم استفاده می‌کند", () => {
    const src = readFileSync("components/landing/LiveMarket.tsx", "utf8");
    assert.match(src, /from "@\/lib\/market-price"/, "import گاردِ قیمت گم شده");
    assert.match(src, /hasRealPrice\(/, "گاردِ قیمت فراخوانی نمی‌شود");
    assert.match(src, /hasRealChange/, "گاردِ درصدِ تغییر فراخوانی نمی‌شود");
  });

  test("MarketTicker فقط از انتخابِ گاردشده می‌خواند", () => {
    const src = readFileSync("components/market/MarketTicker.tsx", "utf8");
    assert.match(src, /selectTickerAssets\(/, "از انتخابِ گاردشده استفاده نمی‌کند");
  });

  test("MarketTicker آرایه‌های خامِ پاسخ را دور نمی‌زند", () => {
    // اگر روزی کسی `json.crypto.map(...)` را مستقیم به تیکر برگرداند، گارد
    // بی‌اثر می‌شود بدونِ اینکه هیچ تستِ دیگری قرمز شود.
    const src = readFileSync("components/market/MarketTicker.tsx", "utf8");
    for (const raw of ["json.crypto", "json.goldGlobal", "json.ir.gold", "json.ir.currency", "json?.ir?.gold", "json?.ir?.currency"]) {
      assert.ok(!src.includes(raw), `تیکر نباید مستقیم ${raw} را بخواند`);
    }
  });

  test("انتخابِ تیکر خودش گاردِ مشترک را وارد می‌کند", () => {
    const src = readFileSync("lib/market-ticker-select.ts", "utf8");
    assert.match(src, /from "\.\/market-price"/, "انتخاب باید از تعریفِ مشترک بخواند");
    assert.match(src, /hasRealPrice\(/, "انتخاب گاردِ قیمت را صدا نمی‌زند");
  });
});
