import assert from "node:assert/strict";
import test from "node:test";
import type { UTCTimestamp } from "lightweight-charts";
import { chartAxisDateLabel, chartTooltipDateLabel } from "./chartDate";

const epoch = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp;

test("محور و tooltip در مرز سال شمسی از helper پروژه پیروی می‌کنند", () => {
  assert.equal(chartAxisDateLabel(epoch("2026-03-20T12:00:00Z")), "۲۹ اسفند");
  assert.equal(chartTooltipDateLabel(epoch("2026-03-20T12:00:00Z")), "۱۴۰۴/۱۲/۲۹");
  assert.equal(chartAxisDateLabel(epoch("2026-03-21T12:00:00Z")), "۱ فروردین");
  assert.equal(chartTooltipDateLabel(epoch("2026-03-21T12:00:00Z")), "۱۴۰۵/۰۱/۰۱");
});

test("مرز ماه شمسی نام و شمارهٔ درست می‌دهد، نه ماه میلادی", () => {
  assert.equal(chartAxisDateLabel(epoch("2026-04-20T12:00:00Z")), "۳۱ فروردین");
  assert.equal(chartTooltipDateLabel(epoch("2026-04-20T12:00:00Z")), "۱۴۰۵/۰۱/۳۱");
  assert.equal(chartAxisDateLabel(epoch("2026-04-21T12:00:00Z")), "۱ اردیبهشت");
  assert.equal(chartTooltipDateLabel(epoch("2026-04-21T12:00:00Z")), "۱۴۰۵/۰۲/۰۱");
});

test("BusinessDay کتابخانه نیز با همان قرارداد شمسی نمایش داده می‌شود", () => {
  const businessDay = { year: 2026, month: 3, day: 21 };
  assert.equal(chartAxisDateLabel(businessDay), "۱ فروردین");
  assert.equal(chartTooltipDateLabel(businessDay), "۱۴۰۵/۰۱/۰۱");
});

test("رشتهٔ تاریخ کتابخانه نیز به ماه میلادی برنمی‌گردد", () => {
  assert.equal(chartAxisDateLabel("2026-04-21"), "۱ اردیبهشت");
  assert.equal(chartTooltipDateLabel("2026-04-21"), "۱۴۰۵/۰۲/۰۱");
});
