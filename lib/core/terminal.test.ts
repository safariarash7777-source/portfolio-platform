// تست‌های پل ترمینال — T7 ممیزی. فقط تابع خالص toFundamentalInput
// (buildTerminalView شبکه‌ای است و در تست واحد جایی ندارد).

import { test } from "node:test";
import assert from "node:assert/strict";
import { toFundamentalInput } from "./terminal";
import type { CodalN10Data } from "@/lib/fundamental/types";

function n10(partial: Record<string, unknown>): CodalN10Data {
  return partial as unknown as CodalN10Data;
}

test("null ورودی → null خروجی (هیچ عدد ساختگی)", () => {
  assert.equal(toFundamentalInput(null), null);
});

test("بدون standalone.revenue عددی → null (دادهٔ ناقص حذف می‌شود)", () => {
  assert.equal(toFundamentalInput(n10({ standalone: {} })), null);
  assert.equal(toFundamentalInput(n10({ standalone: { revenue: "abc" } })), null);
});

test("نگاشت کامل: همهٔ فیلدها منتقل و انواع نامعتبر null می‌شوند", () => {
  const fi = toFundamentalInput(
    n10({
      capital: 5000,
      period_months: 12,
      audited: true,
      standalone: {
        revenue: 100,
        gross_profit: 40,
        operating_profit: 30,
        net_profit: 25,
        eps_rial: 500,
        prior: { revenue: 80, net_profit: 20 },
      },
    })
  );
  assert.ok(fi);
  assert.equal(fi!.revenue, 100);
  assert.equal(fi!.net_profit, 25);
  assert.equal(fi!.eps_rial, 500);
  assert.equal(fi!.capital, 5000);
  assert.equal(fi!.period_months, 12);
  assert.equal(fi!.audited, true);
  assert.deepEqual(fi!.prior, { revenue: 80, net_profit: 20 });
});

test("eps/capital غیرعددی → null؛ prior ناقص → null؛ audited غیرصریح → false", () => {
  const fi = toFundamentalInput(
    n10({
      capital: "نامشخص",
      period_months: 6,
      audited: undefined,
      standalone: {
        revenue: 100,
        gross_profit: null,
        operating_profit: null,
        net_profit: 10,
        eps_rial: "—",
        prior: { revenue: 80 }, // net_profit جا افتاده
      },
    })
  );
  assert.ok(fi);
  assert.equal(fi!.eps_rial, null);
  assert.equal(fi!.capital, null);
  assert.equal(fi!.audited, false);
  assert.equal(fi!.prior, null);
});
