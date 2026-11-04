import type { CodalN30Data, ReportSource } from "@/lib/fundamental/types";
import { dedupeByMonth } from "@/lib/core/monthlyReport";

export type MonthlySourceRecord = NonNullable<ReportSource["records"]>[number];
export interface MonthlyPointSource {
  periodEnd: string;
  amountUnit: string | null;
  record: MonthlySourceRecord | null;
}

/** The existing reader projects data[] and records[] from the same n30rows.
 * Preserve that pairing before the chart's existing monthly selection; do not
 * reselect a version by publication time, URL or a nearest-date guess.
 * Missing/ambiguous identity suppresses metadata only, never numeric data.
 */
export function monthlyPointSources(
  reports: CodalN30Data[],
  records: ReadonlyArray<MonthlySourceRecord> | undefined,
): Map<string, MonthlyPointSource> {
  const periodCounts = new Map<string, number>();
  const idCounts = new Map<number, number>();
  for (const record of records ?? []) {
    if (typeof record?.financialPeriodEnd === "string") {
      periodCounts.set(record.financialPeriodEnd, (periodCounts.get(record.financialPeriodEnd) ?? 0) + 1);
    }
    if (typeof record?.id === "number") idCounts.set(record.id, (idCounts.get(record.id) ?? 0) + 1);
  }
  const pairs = new Map<CodalN30Data, MonthlySourceRecord | null>();
  for (const [index, report] of reports.entries()) {
    if (!report) continue;
    const record = records?.length === reports.length ? records[index] : undefined;
    const exact = record != null && Number.isSafeInteger(record.id) && record.id! > 0
      && idCounts.get(record.id!) === 1 && periodCounts.get(report.period_end) === 1
      && /^1[34]\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(report.period_end)
      && record.financialPeriodEnd === report.period_end;
    pairs.set(report, exact ? record : null);
  }
  return new Map([...dedupeByMonth(reports)].map(([month, report]) => [month, {
    periodEnd: report.period_end,
    amountUnit: typeof report.unit === "string" && report.unit.trim() ? report.unit : null,
    record: pairs.get(report) ?? null,
  }]));
}
