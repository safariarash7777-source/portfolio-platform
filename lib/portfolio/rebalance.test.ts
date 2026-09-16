import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareHoldingsToTarget,
  assertTargetSumsTo100,
  exceedsThreshold,
  InvalidTargetError,
} from "./rebalance";
import type { HoldingVersion, PricePoint, TargetVersion } from "./contracts";

const NOW = new Date("2026-09-16T00:00:00Z");
const opts = { maxPriceAgeDays: 3, now: NOW };

const target = (weights: [string, number][], refId: string | null = "ref-1"): TargetVersion => ({
  id: "tgt-1",
  version: 1,
  referenceVersionId: refId,
  weights: weights.map(([assetClass, weightPct]) => ({ assetClass, weightPct })),
});

const holdings = (rows: [string, string, number][]): HoldingVersion => ({
  id: "hold-1",
  version: 1,
  positions: rows.map(([positionKey, assetClass, qty]) => ({
    positionKey,
    symbol: positionKey,
    manualLabel: null,
    assetClass,
    qty,
    unit: "عدد",
    costBasis: null,
    asOf: "2026-09-15",
  })),
});

const price = (toman: number, asOf = "2026-09-15"): PricePoint => ({ toman, source: "رله", asOf });

describe("مقایسهٔ دارایی با سبد هدف (#140)", () => {
  test("۷۰/۱۰/۳۰ برابر ۱۱۰ درصد است و رد می‌شود، نه نرمال", () => {
    assert.throws(
      () => assertTargetSumsTo100(target([["gold", 70], ["fixed_income", 10], ["equity_ir", 30]])),
      (e: unknown) => e instanceof InvalidTargetError && /۱۰۰ درصد|100/.test((e as Error).message)
    );
  });

  test("۷۰/۱۵/۱۵ پذیرفته می‌شود — ممیزِ شناور نباید ردش کند", () => {
    assert.doesNotThrow(() =>
      assertTargetSumsTo100(target([["gold", 70], ["fixed_income", 15], ["equity_ir", 15]]))
    );
  });

  test("دستهٔ تکراری در هدف رد می‌شود", () => {
    assert.throws(
      () => assertTargetSumsTo100(target([["gold", 50], ["gold", 50]])),
      InvalidTargetError
    );
  });

  test("پوشش کامل: وزن جاری، اختلاف واحد درصد و مقدار تومانی", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100)]]),
      opts
    );
    assert.equal(r.definitive, true);
    assert.equal(r.totalValue, 2000);
    const gold = r.rows.find((x) => x.assetClass === "gold")!;
    assert.equal(gold.currentWeightPct, 50);
    assert.equal(gold.deltaPercentagePoints, 20); // 70 − 50
    assert.equal(gold.valueDelta, 400); // 70% از ۲۰۰۰ منهای ۱۰۰۰
  });

  test("قیمت کهنه ⇒ هیچ مقدار قطعی بازتوازن تولید نمی‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100, "2026-09-01")]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.fullCoverage, false);
    assert.equal(r.totalValue, null);
    assert.equal(r.gaps[0].reason, "stale_price");
    for (const row of r.rows) {
      assert.equal(row.valueDelta, null, `${row.assetClass} نباید عدد قطعی بدهد`);
      assert.equal(row.currentWeightPct, null);
    }
  });

  test("قیمت بدون منبع، قیمت نیست", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", { toman: 100, source: "   ", asOf: "2026-09-15" }]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.gaps[0].reason, "no_price");
  });

  test("قیمت گم‌شده با صفر یا آخرین مقدار پر نمی‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.deepEqual(r.gaps.map((g) => g.positionKey), ["س"]);
  });

  test("رشد قیمت طلا وزنش را عوض می‌کند، بدون هیچ معاملهٔ تازه", () => {
    const h = holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]);
    const t = target([["gold", 70], ["equity_ir", 30]]);
    const before = compareHoldingsToTarget(h, t, new Map([["ط", price(100)], ["س", price(100)]]), opts);
    const after = compareHoldingsToTarget(h, t, new Map([["ط", price(300)], ["س", price(100)]]), opts);
    const w = (r: typeof before) => r.rows.find((x) => x.assetClass === "gold")!.currentWeightPct;
    assert.equal(w(before), 50);
    assert.equal(w(after), 75);
    assert.equal(h.version, 1, "نسخهٔ دارایی نباید عوض شده باشد");
  });

  test("دو عضو با موجودی متفاوت، یک هدف: تفاوت‌هایشان یکی نیست", () => {
    const t = target([["gold", 70], ["equity_ir", 30]]);
    const p = new Map([["ط", price(100)], ["س", price(100)]]);
    const a = compareHoldingsToTarget(holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]), t, p, opts);
    const b = compareHoldingsToTarget(holdings([["ط", "gold", 1], ["س", "equity_ir", 19]]), t, p, opts);
    const d = (r: typeof a) => r.rows.find((x) => x.assetClass === "gold")!.valueDelta;
    assert.equal(a.totalValue, b.totalValue, "ارزش کل اتفاقاً برابر است");
    assert.notEqual(d(a), d(b), "ولی مقدار تغییر لازم نباید یکی باشد");
  });

  test("هویت محاسبه نسخهٔ دارایی و نسخهٔ هدف را حمل می‌کند", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(r.identity.holdingVersionId, "hold-1");
    assert.equal(r.identity.targetVersionId, "tgt-1");
    assert.equal(r.identity.pricedAt, NOW.toISOString());
  });

  test("هدفِ بدون اتصال به نسخهٔ مرجع صریح اعلام می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]], null),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.ok(r.notes.some((n) => /نسخهٔ مرجع/.test(n)));
  });

  test("آستانه روی نتیجهٔ غیرقطعی هرگز فعال نمی‌شود", () => {
    const stale = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", price(100, "2026-01-01")]]),
      opts
    );
    assert.equal(exceedsThreshold(stale, 1), false, "قیمت کهنه نباید اعلان بسازد");
  });

  test("آستانه فقط با عبور واقعی فعال می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100)]]),
      opts
    );
    assert.equal(exceedsThreshold(r, 20), true);
    assert.equal(exceedsThreshold(r, 21), false);
  });
});
