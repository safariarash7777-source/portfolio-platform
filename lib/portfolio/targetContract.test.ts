import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseStoredAllocations,
  describeTargetProblems,
  mapAssetLabel,
  normaliseLabel,
} from "./targetContract";

describe("آداپتور قرارداد سبد هدف (#140)", () => {
  // نمونهٔ واقعی: اندازه‌گیری فقط‌خواندنی از Production نشان داد کلیدها
  // `asset`/`pct`/`note` هستند و برچسب‌ها متن آزاد فارسی‌اند.
  test("شکل واقعی دیتابیس خوانده می‌شود، نه قرارداد خیالی", () => {
    const r = parseStoredAllocations([
      { asset: "سهام", pct: 60, note: "هستهٔ سبد" },
      { asset: "درامد ثابت", pct: 40, note: null },
    ]);
    assert.deepEqual(r.weights.sort((a, b) => a.assetClass.localeCompare(b.assetClass)), [
      { assetClass: "equity_ir", weightPct: 60 },
      { assetClass: "fixed_income", weightPct: 40 },
    ]);
    assert.deepEqual(r.unmapped, []);
    assert.deepEqual(r.invalid, []);
  });

  test("املای بدون همزه هم شناخته می‌شود — چون در داده واقعی هست", () => {
    assert.equal(mapAssetLabel("درامد ثابت"), "fixed_income");
    assert.equal(mapAssetLabel("درآمد ثابت"), "fixed_income");
    assert.equal(normaliseLabel("درآمد‌ثابت"), "درامد ثابت");
  });

  test("دستهٔ ناشناخته حدس زده نمی‌شود و مخفی هم نمی‌شود", () => {
    const r = parseStoredAllocations([
      { asset: "سهام", pct: 70 },
      { asset: "dsf", pct: 30 }, // ورودی واقعیِ آزمایشی در دیتابیس
    ]);
    assert.deepEqual(r.weights, [{ assetClass: "equity_ir", weightPct: 70 }]);
    assert.deepEqual(r.unmapped, [{ label: "dsf", pct: 30 }]);
    const notes = describeTargetProblems(r);
    assert.match(notes[0], /dsf/);
    assert.match(notes[0], /حدس زده نمی‌شود/);
  });

  test("درصد نامعتبر پنهان نمی‌شود و صفر فرض نمی‌شود", () => {
    const r = parseStoredAllocations([
      { asset: "طلا", pct: "خیلی" },
      { asset: "سهام", pct: -5 },
      { asset: "ارز", pct: 0 },
    ]);
    assert.deepEqual(r.weights, []);
    assert.equal(r.invalid.length, 3);
    assert.match(describeTargetProblems(r).join(" "), /نامعتبر/);
  });

  test("دو برچسب هم‌معنی جمع می‌شوند، نه اینکه یکی دیگری را پاک کند", () => {
    const r = parseStoredAllocations([
      { asset: "سهام", pct: 30 },
      { asset: "سهام ایران", pct: 20 },
    ]);
    assert.deepEqual(r.weights, [{ assetClass: "equity_ir", weightPct: 50 }]);
  });

  test("ورودی غیرآرایه و نام خالی امن مدیریت می‌شوند", () => {
    assert.deepEqual(parseStoredAllocations(null).weights, []);
    assert.deepEqual(parseStoredAllocations({ asset: "سهام" }).weights, []);
    const r = parseStoredAllocations([{ asset: "  ", pct: 10 }]);
    assert.equal(r.invalid.length, 1);
  });

  test("رشتهٔ عددی برای درصد قبول می‌شود", () => {
    const r = parseStoredAllocations([{ asset: "طلا", pct: "70" }]);
    assert.deepEqual(r.weights, [{ assetClass: "gold", weightPct: 70 }]);
  });
});
