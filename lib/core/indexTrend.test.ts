// تست‌های سری روند شاخص (M5) — فقط تابع pure؛ بدون شبکه.
// اجرا: npx tsx --test lib/core/indexTrend.test.ts
import test from "node:test";
import assert from "node:assert";
import { buildIndexSeries, type IndexHistRow } from "./indexTrend";

const row = (jdate: string, total: number, ew: number | null = null): IndexHistRow => ({
  jdate,
  total_index: total,
  equal_weight_index: ew,
  trade_value: null,
});

test("مرتب‌سازی صعودی بر اساس jdate (ورودی نزولی است)", () => {
  const s = buildIndexSeries([row("1405/04/27", 2100000), row("1405/04/25", 2050000), row("1405/04/26", 2080000)]);
  const total = s.find((x) => x.id === "total")!;
  assert.deepEqual(
    total.points.map((p) => p.jdate),
    ["1405/04/25", "1405/04/26", "1405/04/27"],
  );
});

test("سری هم‌وزن فقط از ردیف‌های دارای مقدار مثبت ساخته می‌شود", () => {
  const s = buildIndexSeries([row("1405/04/25", 2050000, 800000), row("1405/04/26", 2080000, null)]);
  const ew = s.find((x) => x.id === "equal_weight")!;
  assert.equal(ew.points.length, 1);
  assert.equal(ew.points[0].value, 800000);
});

test("ردیف نامعتبر (شاخص صفر/منفی) حذف می‌شود", () => {
  const s = buildIndexSeries([row("1405/04/25", 0), row("1405/04/26", -5), row("1405/04/27", 2100000)]);
  const total = s.find((x) => x.id === "total")!;
  assert.equal(total.points.length, 1);
});

test("jdate تکراری فقط یک بار می‌آید", () => {
  const s = buildIndexSeries([row("1405/04/25", 2050000), row("1405/04/25", 9999999)]);
  const total = s.find((x) => x.id === "total")!;
  assert.equal(total.points.length, 1);
  assert.equal(total.points[0].value, 2050000);
});

test("ورودی خالی → خروجی خالی (بدون عدد ساختگی)", () => {
  assert.deepEqual(buildIndexSeries([]), []);
});
