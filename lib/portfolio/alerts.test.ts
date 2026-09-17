import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideDeviationAlert, alertKey } from "./alerts";
import type { AlertState } from "./alerts";
import type { RebalanceResult } from "./contracts";

const NOW = new Date("2026-09-17T12:00:00Z");
const opts = { thresholdPoints: 5, cooldownHours: 24, now: NOW };
const fresh: AlertState = { lastKey: null, lastSentAt: null };

const result = (o: Partial<RebalanceResult> = {}): RebalanceResult => ({
  identity: { holdingVersionId: "h1", targetVersionId: "t1", pricedAt: NOW.toISOString() },
  rows: [
    { assetClass: "gold", value: 100, currentWeightPct: 50, targetWeightPct: 70,
      deltaPercentagePoints: 20, valueDelta: 40 },
    { assetClass: "equity_ir", value: 100, currentWeightPct: 50, targetWeightPct: 30,
      deltaPercentagePoints: -20, valueDelta: -40 },
  ],
  totalValue: 200, fullCoverage: true, gaps: [], definitive: true, notes: [],
  ...o,
});

describe("هشدار انحراف با جلوگیری از تکرار (#140)", () => {
  test("انحراف واقعی یک‌بار هشدار می‌دهد", () => {
    const d = decideDeviationAlert(result(), fresh, opts);
    assert.equal(d.send, true);
    assert.equal(d.reason, "send");
    assert.match(d.message ?? "", /بازتوازن/);
  });

  test("واژگان ممنوع تولید نمی‌شود", () => {
    const d = decideDeviationAlert(result(), fresh, opts);
    assert.doesNotMatch(d.message ?? "", /سیگنال|بخرید|بفروشید|توصیه|پیشنهاد/);
  });

  test("نتیجهٔ غیرقطعی هرگز هشدار نمی‌سازد", () => {
    const d = decideDeviationAlert(result({ definitive: false }), fresh, opts);
    assert.equal(d.send, false);
    assert.equal(d.reason, "not_definitive");
    assert.equal(d.message, null);
  });

  test("زیر آستانه ساکت است", () => {
    const small = result({
      rows: [{ assetClass: "gold", value: 100, currentWeightPct: 69, targetWeightPct: 70,
               deltaPercentagePoints: 1, valueDelta: 2 }],
    });
    assert.equal(decideDeviationAlert(small, fresh, opts).reason, "below_threshold");
  });

  // ⚠️ همان چیزی که #140 خواست: رفرش دوباره نباید پیام تکراری بفرستد.
  test("همان وضعیت دوباره پیام نمی‌فرستد", () => {
    const first = decideDeviationAlert(result(), fresh, opts);
    assert.equal(first.send, true);
    const second = decideDeviationAlert(
      result(),
      { lastKey: first.key, lastSentAt: NOW.toISOString() },
      opts
    );
    assert.equal(second.send, false);
    assert.equal(second.reason, "duplicate");
  });

  test("نوسان کوچک قیمت کلید را عوض نمی‌کند", () => {
    const a = alertKey(result(), ["gold", "equity_ir"]);
    const wobbled = result({
      rows: [
        { assetClass: "gold", value: 101, currentWeightPct: 50.2, targetWeightPct: 70,
          deltaPercentagePoints: 19.8, valueDelta: 41 },
        { assetClass: "equity_ir", value: 99, currentWeightPct: 49.8, targetWeightPct: 30,
          deltaPercentagePoints: -19.8, valueDelta: -39 },
      ],
    });
    assert.equal(alertKey(wobbled, ["gold", "equity_ir"]), a, "عدد نباید داخل کلید باشد");
  });

  test("ترتیب دسته‌ها کلید را عوض نمی‌کند", () => {
    assert.equal(alertKey(result(), ["gold", "equity_ir"]), alertKey(result(), ["equity_ir", "gold"]));
  });

  test("نسخهٔ تازهٔ دارایی وضعیت تازه است و دوباره هشدار می‌دهد", () => {
    const first = decideDeviationAlert(result(), fresh, opts);
    const afterEdit = result({
      identity: { holdingVersionId: "h2", targetVersionId: "t1", pricedAt: NOW.toISOString() },
    });
    const d = decideDeviationAlert(
      afterEdit,
      { lastKey: first.key, lastSentAt: new Date(NOW.getTime() - 48 * 3600_000).toISOString() },
      opts
    );
    assert.equal(d.send, true, "نسخهٔ تازه یعنی وضعیت تازه");
  });

  test("فاصلهٔ خنک‌شدن رعایت می‌شود", () => {
    const d = decideDeviationAlert(
      result({ identity: { holdingVersionId: "h9", targetVersionId: "t1", pricedAt: NOW.toISOString() } }),
      { lastKey: "چیز دیگری", lastSentAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString() },
      opts
    );
    assert.equal(d.send, false);
    assert.equal(d.reason, "cooling_down");
  });

  test("پس از پایان فاصله، وضعیت تازه دوباره می‌رود", () => {
    const d = decideDeviationAlert(
      result({ identity: { holdingVersionId: "h9", targetVersionId: "t1", pricedAt: NOW.toISOString() } }),
      { lastKey: "چیز دیگری", lastSentAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString() },
      opts
    );
    assert.equal(d.send, true);
  });
});
