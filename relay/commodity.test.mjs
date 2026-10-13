import test from "node:test";
import assert from "node:assert/strict";
import { mapCommodityRow } from "./commodity.mjs";

test("commodity missing or nonnumeric provider fields remain null", () => {
  for (const value of [null, undefined, "", "  ", false, true, [], [12], {}, NaN, Infinity, "NaN"]) {
    const row = mapCommodityRow({ symbol: "TEST", price: value, change_percent: value });
    assert.equal(row.price, null, `price ${JSON.stringify(value)}`);
    assert.equal(row.changePercent, null, `change ${JSON.stringify(value)}`);
  }
});

test("commodity legitimate zero, signed changes and decimal strings retain source units", () => {
  for (const [value, expected] of [[0, 0], ["0", 0], [" 123.45 ", 123.45], [-1.2, -1.2]]) {
    const row = mapCommodityRow({ symbol: "TEST", price: value, change_percent: value, unit: "USD/oz" });
    assert.equal(row.price, expected);
    assert.equal(row.changePercent, expected);
    assert.equal(row.unit, "USD/oz");
  }
});
