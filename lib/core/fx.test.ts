// تست‌های ماژول نرخ دلار — T6. دادهٔ مصنوعی قطعی؛ بدون شبکه.

import { test } from "node:test";
import assert from "node:assert/strict";
import { latestRate, yearlyAverages, type FxRate } from "./fx";

const r = (rate_date: string, usd_toman: number): FxRate => ({ rate_date, usd_toman, source: "brsapi" });

test("latestRate: اولین ردیف (تازه‌ترین) یا null", () => {
  assert.equal(latestRate([]), null);
  const rates = [r("2026-07-17", 188600), r("2026-07-16", 188200)];
  assert.equal(latestRate(rates)?.usd_toman, 188600);
});

test("yearlyAverages: میانگین هر سال جدا محاسبه می‌شود", () => {
  const rates = [
    r("2025-01-01", 100000),
    r("2025-12-30", 120000),
    r("2026-03-01", 180000),
    r("2026-07-17", 190000),
  ];
  const avg = yearlyAverages(rates);
  assert.equal(avg.get(2025), 110000);
  assert.equal(avg.get(2026), 185000);
  assert.equal(avg.has(2024), false);
});

test("yearlyAverages: نرخ نامعتبر نادیده گرفته می‌شود", () => {
  const avg = yearlyAverages([r("2026-01-01", 0), r("2026-01-02", -5), r("bad-date", 100)]);
  assert.equal(avg.size, 0);
});
