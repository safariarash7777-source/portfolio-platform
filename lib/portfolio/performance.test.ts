import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computePerformance, isExternalFlow } from "./performance";
import type { CashFlow } from "./performance";

const start = { asOf: "2026-01-01T00:00:00Z", value: 1_000_000 };
const end = { asOf: "2026-06-01T00:00:00Z", value: 11_000_000 };
const flow = (kind: CashFlow["kind"], amount: number, at = "2026-03-01T00:00:00Z"): CashFlow => ({
  kind, amount, occurredAt: at,
});

describe("بازده با جداسازی واریز و برداشت (#140)", () => {
  test("واریز هرگز سود شمرده نمی‌شود", () => {
    const r = computePerformance(start, end, [flow("واریز", 10_000_000)]);
    assert.equal(r.netExternalFlow, 10_000_000);
    assert.equal(r.netProfit, 0, "ارزش ۱۰ میلیون بالا رفت ولی همه‌اش واریز بود");
    assert.equal(r.returnPct, 0);
  });

  test("بدون جداسازی، همین حالت سود کاذب می‌داد", () => {
    // شاهدِ عمدی: تفاضلِ خام همان چیزی است که نباید گزارش شود.
    const naive = end.value - start.value;
    const r = computePerformance(start, end, [flow("واریز", 10_000_000)]);
    assert.equal(naive, 10_000_000);
    assert.notEqual(r.netProfit, naive);
  });

  test("برداشت زیان کاذب نمی‌سازد", () => {
    const r = computePerformance(
      start,
      { asOf: "2026-06-01T00:00:00Z", value: 600_000 },
      [flow("برداشت", 500_000)]
    );
    assert.equal(r.netProfit, 100_000, "ارزش افت کرد ولی به‌خاطر برداشت بود");
    assert.equal(r.netExternalFlow, -500_000);
  });

  test("خرید و فروش جریانِ بیرونی نیستند", () => {
    assert.equal(isExternalFlow("خرید"), false);
    assert.equal(isExternalFlow("فروش"), false);
    assert.equal(isExternalFlow("واریز"), true);
    assert.equal(isExternalFlow("برداشت"), true);
    const r = computePerformance(start, end, [flow("خرید", 5_000_000), flow("فروش", 2_000_000)]);
    assert.equal(r.netExternalFlow, 0);
    assert.equal(r.netProfit, 10_000_000, "معاملهٔ درونی نباید بازده را تحریف کند");
  });

  test("جریان بیرون از بازه شمرده نمی‌شود", () => {
    const r = computePerformance(start, end, [flow("واریز", 10_000_000, "2025-12-01T00:00:00Z")]);
    assert.equal(r.netExternalFlow, 0);
    assert.equal(r.netProfit, 10_000_000);
  });

  test("سود واقعی درست حساب می‌شود", () => {
    const r = computePerformance(start, { asOf: "2026-06-01T00:00:00Z", value: 1_500_000 }, []);
    assert.equal(r.netProfit, 500_000);
    assert.equal(r.returnPct, 50);
  });

  test("مخرج شامل واریز است، وگرنه درصد متورم می‌شود", () => {
    // ۱ م آغاز + ۹ م واریز = ۱۰ م سرمایه؛ پایان ۱۱ م ⇒ سود ۱ م ⇒ ۱۰٪
    const r = computePerformance(start, end, [flow("واریز", 9_000_000)]);
    assert.equal(r.netProfit, 1_000_000);
    assert.equal(r.returnPct, 10);
  });

  test("بدون تاریخ کافی، بازده null است — نه صفر", () => {
    const r = computePerformance(null, end, [flow("واریز", 1)]);
    assert.equal(r.netProfit, null);
    assert.equal(r.returnPct, null);
    assert.match(r.unavailableReason ?? "", /ابتدا و انتهای بازه/);
  });

  test("سرمایهٔ درگیر صفر ⇒ درصد null، نه بی‌نهایت", () => {
    const r = computePerformance(
      { asOf: "2026-01-01T00:00:00Z", value: 0 },
      { asOf: "2026-06-01T00:00:00Z", value: 500_000 },
      []
    );
    assert.equal(r.returnPct, null);
    assert.ok(Number.isFinite(r.netProfit!));
  });
});
