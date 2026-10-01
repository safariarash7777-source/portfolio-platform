import { test } from "node:test";
import assert from "node:assert/strict";
import { instantToTehranInput, tehranInputToInstant, isDate, formatTehranDate } from "./time";
test("a chosen Tehran wall time carries an explicit offset independent of device timezone", () => {
  for (const zone of ["UTC", "America/New_York", "Asia/Tehran"]) {
    const old = process.env.TZ;
    try {
      process.env.TZ = zone;
      const instant = tehranInputToInstant("۲۰۲۶-۰۹-۳۰T۱۰:۰۰");
      assert.equal(instant, "2026-09-30T10:00:00+03:30");
      assert.equal(new Date(instant!).toISOString(), "2026-09-30T06:30:00.000Z");
      assert.equal(instantToTehranInput("2026-09-30T06:30:00Z"), "2026-09-30T10:00:00");
      assert.equal(formatTehranDate("2026-09-30T21:00:00Z"), formatTehranDate("2026-10-01"));
      assert.equal(formatTehranDate("2026-10-01"), "۹ مهر ۱۴۰۵");
    } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  }
});
test("reopening midnight uses Tehran date; impossible dates and clocks cannot silently roll over", () => {
  assert.equal(instantToTehranInput("2026-09-30T21:00:00Z"), "2026-10-01T00:30:00");
  for (const value of ["2026-02-30T10:00", "2026-09-30T24:00", "2026-09-30T10:60", "2026-09-30T10:00:60", "", "not a date"]) assert.equal(tehranInputToInstant(value), null);
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2028-02-29"), true);
});
