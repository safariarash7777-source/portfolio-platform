// تست واحد تجمیع روزانهٔ بازار (فاز ۱۷) — بدون شبکه، فقط منطق محاسبه.
// اجرا:  node breadth.test.mjs
import assert from "node:assert/strict";
import { computeBreadth, isBuyQueue, isSellQueue } from "./breadth.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

console.log("breadth unit tests:");

// ── تشخیص صف ──
t("صف خرید: بهترین تقاضا روی سقف دامنه و عرضهٔ صفر", () => {
  assert.equal(isBuyQueue({ bandHigh: 1000, bestBidPrice: 1000, bestAskVolume: 0 }), true);
});
t("صف خرید نیست وقتی عرضه موجود است", () => {
  assert.equal(isBuyQueue({ bandHigh: 1000, bestBidPrice: 1000, bestAskVolume: 500 }), false);
});
t("صف خرید نیست وقتی تقاضا زیر سقف است", () => {
  assert.equal(isBuyQueue({ bandHigh: 1000, bestBidPrice: 990, bestAskVolume: 0 }), false);
});
t("فیلد غایب → قضاوت نمی‌شود (false، هیچ حدسی)", () => {
  assert.equal(isBuyQueue({ bestBidPrice: 1000, bestAskVolume: 0 }), false);
  assert.equal(isBuyQueue({}), false);
  assert.equal(isSellQueue({ bandLow: 900 }), false);
});
t("صف فروش: بهترین عرضه روی کف دامنه و تقاضای صفر", () => {
  assert.equal(isSellQueue({ bandLow: 900, bestAskPrice: 900, bestBidVolume: 0 }), true);
});
t("صف فروش نیست وقتی تقاضا موجود است", () => {
  assert.equal(isSellQueue({ bandLow: 900, bestAskPrice: 900, bestBidVolume: 10 }), false);
});

// ── محاسبهٔ breadth ──
const stocks = [
  // مثبت قوی + صف خرید (قیمت‌ها تومان؛ value ریال مثل tval خام)
  { id: "الف", value: 5_000_000_000, closingChangePercent: 4.9, closingPrice: 1000,
    buyI: 2000, sellI: 500, buyCountI: 10, sellCountI: 5,
    bandHigh: 1049, bestBidPrice: 1049, bestBidVolume: 100_000, bestAskVolume: 0 },
  // منفی + صف فروش
  { id: "ب", value: 2_000_000_000, closingChangePercent: -3.2, closingPrice: 500,
    buyI: 100, sellI: 900, buyCountI: 4, sellCountI: 8,
    bandLow: 480, bestAskPrice: 480, bestAskVolume: 50_000, bestBidVolume: 0 },
  // خنثی، بدون فیلد صف
  { id: "ج", value: 1_000_000_000, closingChangePercent: 0.1, closingPrice: 200,
    buyI: 300, sellI: 300, buyCountI: 3, sellCountI: 3 },
  // معامله‌نشده (value=0) — در نبض شمرده نمی‌شود
  { id: "د", value: 0, closingChangePercent: 2, closingPrice: 100, buyI: 0, sellI: 0 },
];
const b = computeBreadth(stocks);

t("نبض: مثبت/منفی/خنثی/کل فقط از معامله‌شده‌ها", () => {
  assert.equal(b.pos_count, 1);
  assert.equal(b.neg_count, 1);
  assert.equal(b.flat_count, 1);
  assert.equal(b.total_traded, 3);
});
t("صف‌ها: یک صف خرید و یک صف فروش", () => {
  assert.equal(b.buy_queue_count, 1);
  assert.equal(b.sell_queue_count, 1);
});
t("ارزش صف خرید = حجم سطر اول × قیمت × ۱۰ (ریال)", () => {
  assert.equal(b.buy_queue_value, 100_000 * 1049 * 10);
});
t("ارزش صف فروش = حجم سطر اول عرضه × قیمت × ۱۰ (ریال)", () => {
  assert.equal(b.sell_queue_value, 50_000 * 480 * 10);
});
t("خالص پول حقیقی = Σ(buyI−sellI)×پایانی×۱۰ (ریال)", () => {
  const expect = (2000 - 500) * 1000 * 10 + (100 - 900) * 500 * 10 + (300 - 300) * 200 * 10;
  assert.equal(b.net_real_flow, expect);
});
t("سرانهٔ خرید حقیقی = ارزش خرید حقیقی ÷ شمار خریداران", () => {
  const buyRial = 2000 * 1000 * 10 + 100 * 500 * 10 + 300 * 200 * 10;
  assert.equal(b.per_capita_buy, Math.round(buyRial / (10 + 4 + 3)));
});
t("ارزش معاملات جمع value معامله‌شده‌ها (ریال)", () => {
  assert.equal(b.trade_value, 8_000_000_000);
});
t("ورودی خالی → صفرها و nullهای صادق", () => {
  const e = computeBreadth([]);
  assert.equal(e.total_traded, 0);
  assert.equal(e.trade_value, null);
  assert.equal(e.per_capita_buy, null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
