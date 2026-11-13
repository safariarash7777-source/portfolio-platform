import test from "node:test";
import assert from "node:assert/strict";
import { monthlyPointSources, type MonthlySourceRecord } from "./monthly-point-provenance";
import type { CodalN30Data } from "@/lib/fundamental/types";
import { buildMonthlySales } from "@/lib/core/monthlyReport";

function report(period = "1404-01-31", total = 10, unit: string | null = "میلیون ریال"): CodalN30Data {
  return { symbol: "نمونه آزمون", report_kind: "ن-۳۰", period_end: period, fiscal_year: 1404,
    products: [], period_total_amount: total, fy_cumulative_amount: total, unit };
}
function record(period = "1404-01-31", id = 1): MonthlySourceRecord {
  return { id, financialPeriodEnd: period, storedPeriodEnd: "2025-04-20",
    sourceUrl: `https://codal.ir/Reports/Decision.aspx?LetterSerial=test-${id}`,
    publishedAt: "1404/02/05 13:14:15", publishedDateRaw: "1404/02/05", publishedTimeRaw: "13:14:15",
    publishedAtUtc: null, publicationUtcConfidence: "unknown",
    capturedAtRaw: "2025-04-26T16:01:02.123456+03:30", capturedAt: "2025-04-26T12:31:02.123Z",
    parserVersion: 2, parserVersionSource: "raw", amendment: false };
}

test("paired monthly projection keeps original timestamps, units and records without mutation", () => {
  const reports = [report()], records = [record()], before = structuredClone({ reports, records });
  const point = monthlyPointSources(reports, records).get("1404-01")!;
  assert.equal(point.record, records[0]);
  assert.equal(point.periodEnd, "1404-01-31");assert.equal(point.amountUnit, "میلیون ریال");
  assert.equal(point.record?.capturedAtRaw, "2025-04-26T16:01:02.123456+03:30");
  assert.equal(point.record?.publishedAtUtc, null);
  assert.deepEqual({ reports, records }, before);
});

test("swapped, truncated or absent record projections cannot inherit an apparently matching date", () => {
  const reports = [report(), report("1403-01-31")], records = [record(), record("1403-01-31", 2)];
  for (const bad of [[records[1], records[0]], [records[0]], undefined]) {
    const sources = monthlyPointSources(reports, bad);
    assert.equal(sources.get("1404-01")?.record, null);assert.equal(sources.get("1403-01")?.record, null);
    assert.equal(sources.get("1404-01")?.amountUnit, "میلیون ریال");
  }
});

test("duplicate period or record identity stays unknown instead of selecting provenance independently", () => {
  const duplicatePeriod = monthlyPointSources([report(), report()], [record(), record("1404-01-31", 2)]);
  assert.equal(duplicatePeriod.get("1404-01")?.record, null);
  const duplicateId = monthlyPointSources([report(), report("1404-02-31")], [record(), record("1404-02-31", 1)]);
  assert.equal(duplicateId.get("1404-01")?.record, null);assert.equal(duplicateId.get("1404-02")?.record, null);
});

test("existing zero-total monthly dedup selects the same report and its paired metadata", () => {
  const reports = [report("1404-01-31", 0), report("1404-01-30", 20, "واحد همان گزارش")];
  const records = [record("1404-01-31", 1), record("1404-01-30", 2)];
  const point = monthlyPointSources(reports, records).get("1404-01")!;
  assert.equal(buildMonthlySales(reports)?.currentMonths[0].amount, 20);
  assert.equal(point.periodEnd, reports[1].period_end);assert.equal(point.record, records[1]);
  assert.equal(point.amountUnit, "واحد همان گزارش");
});

test("reported zero remains traceable but a missing calendar month never gets a record", () => {
  const reports = [report("1404-01-31", 0), report("1404-03-31", 5)];
  const sources = monthlyPointSources(reports, [record(), record("1404-03-31", 3)]);
  assert.equal(buildMonthlySales(reports)?.currentMonths[0].amount, 0);
  assert.equal(sources.get("1404-01")?.record?.id, 1);
  assert.equal(buildMonthlySales(reports)?.currentMonths[1].amount, null);
  assert.equal(sources.has("1404-02"), false);
});

test("same month label across current and prior year retains separate source identities", () => {
  const reports = [report(), report("1403-01-31")], records = [record(), record("1403-01-31", 2)];
  const model = buildMonthlySales(reports)!, sources = monthlyPointSources(reports, records);
  assert.equal(model.currentMonths[0].monthLabel, model.priorMonths![0].monthLabel);
  assert.equal(sources.get(model.currentMonths[0].monthKey)?.record?.id, 1);
  assert.equal(sources.get(model.priorMonths![0].monthKey)?.record?.id, 2);
});

test("null row fields and unknown amount units are preserved without bundle defaults", () => {
  const row = { ...record(), sourceUrl: null, publishedAt: null, capturedAtRaw: null, capturedAt: null };
  const point = monthlyPointSources([report("1404-01-31", 10, null)], [row]).get("1404-01")!;
  assert.equal(point.amountUnit, null);assert.equal(point.record, row);
  assert.equal(point.record?.sourceUrl, null);assert.equal(point.record?.publishedAt, null);
  assert.equal(point.record?.capturedAt, null);assert.equal(point.record?.capturedAtRaw, null);
});

test("missing identities or malformed full periods cannot certify metadata", () => {
  assert.equal(monthlyPointSources([report()], [{ ...record(), id: null }]).get("1404-01")?.record, null);
  assert.equal(monthlyPointSources([report("1404-01-invalid")], [record("1404-01-invalid")]).get("1404-01")?.record, null);
});
