import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { conversionFactor, lookupUnit, normaliseUnit, KNOWN_UNITS } from "./units";

describe("واحد مقدار (#140)", () => {
  test("هزار سهم هزار برابر سهم است", () => {
    const c = conversionFactor("هزار سهم", "سهم");
    assert.equal(c.ok ? c.factor : null, 1000);
  });

  test("سهم به سهم ضریب یک", () => {
    const c = conversionFactor("سهم", "سهم");
    assert.equal(c.ok ? c.factor : null, 1);
  });

  test("واحد صندوق با قیمت هر سهم سازگار است", () => {
    // نام متفاوت، ولی هر دو «یک واحد قابل معاملهٔ ابزار فهرست‌شده»اند.
    assert.equal(conversionFactor("واحد", "سهم").ok, true);
    assert.equal(conversionFactor("عدد", "سهم").ok, true);
  });

  test("طلای فیزیکی با قیمت هر سهم ناسازگار است", () => {
    const c = conversionFactor("گرم", "سهم");
    assert.equal(c.ok, false);
    assert.equal(c.ok ? null : c.reason, "incompatible");
  });

  test("کیلوگرم هزار گرم است", () => {
    const c = conversionFactor("کیلوگرم", "گرم");
    assert.equal(c.ok ? c.factor : null, 1000);
  });

  test("واحد ناشناخته حدس زده نمی‌شود", () => {
    const q = conversionFactor("واحدِ عجیب", "سهم");
    assert.equal(q.ok, false);
    assert.equal(q.ok ? null : q.reason, "unknown_quantity_unit");

    const p = conversionFactor("سهم", "چیزی");
    assert.equal(p.ok, false);
    assert.equal(p.ok ? null : p.reason, "unknown_price_unit");
  });

  test("نرمال‌سازی فارسی: ی و ک عربی و نیم‌فاصله", () => {
    assert.equal(normaliseUnit("هزار‌سهم"), "هزار سهم");
    assert.equal(lookupUnit("  سهم  ")?.perBase, 1);
  });

  test("همهٔ واحدهای ثبت‌شده ضریب مثبت دارند", () => {
    for (const u of KNOWN_UNITS) {
      const spec = lookupUnit(u)!;
      assert.ok(spec.perBase > 0, `${u} ضریب نامعتبر دارد`);
    }
  });
});
