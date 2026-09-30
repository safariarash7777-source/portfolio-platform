import { test } from "node:test";
import assert from "node:assert/strict";
import { navValidity, navSourceAt, finiteNumber } from "./nav-quality.mjs";
const NOW = Date.parse("2026-09-30T10:00:00Z");
const entry = { nav: 3600, navDate: "1405-07-08", navTime: "13:25:00", at: NOW };
test("NAV منبع تازه با تومان درست پذیرفته می‌شود", () => assert.equal(navValidity(entry, 362, NOW).state, "ready"));
test("کش امروز و NAV هشت روز قبل همچنان کهنه است", () => assert.equal(navValidity({ ...entry, navDate: "1405-06-30" }, 362, NOW).state, "stale"));
test("واحد ده برابر، ساعت آینده و تاریخ نامعتبر رد می‌شوند", () => {
  assert.equal(navValidity(entry, 3620, NOW).state, "invalid-unit");
  assert.equal(navValidity({ ...entry, navTime: "17:00:00" }, 362, NOW).state, "invalid-time");
  assert.equal(navSourceAt("1405-07-31", "13:00:00"), null);
  assert.equal(navValidity({ ...entry, navTime: null }, 362, NOW).state, "unavailable");
});
test("null مقدار مالی صفر نمی‌شود؛ صفر واقعی حفظ می‌شود", () => {
  for (const v of [null, undefined, "", false, NaN]) assert.equal(finiteNumber(v), null);
  assert.equal(finiteNumber(0), 0); assert.equal(finiteNumber("0"), 0);
});
