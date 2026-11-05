import type { ReportRecord } from "../fundamental/types";
import type { QuarterInput } from "./quarterly";

export interface QuarterReportSource {
  /** Identity consumed by the existing engine, even if metadata cannot bind. */
  id: number | null;
  periodEnd: string;
  periodMonths: number;
  unit: string | null;
  binding: "matched" | "missing_record" | "invalid_identity" | "ambiguous_identity" | "identity_mismatch" | "period_mismatch";
  /** Only the exact input's row metadata; no date/URL/nearest-period lookup. */
  record: ReportRecord | null;
}

export interface QuarterAmountsSource {
  /** rejected_difference records the reports checked, not a valid amount. */
  operation: "reported" | "difference" | "rejected_difference" | "unavailable";
  contributors: Array<{ role: "current" | "previous"; report: QuarterReportSource }>;
}

export interface QuarterProvenance {
  amounts: QuarterAmountsSource;
  /** Capital comes only from the current report, independently of the difference. */
  capital: QuarterReportSource | null;
}

export interface TtmProvenance {
  /** Keep all four actual windows and repeated/subtracted inputs; do not reduce
   * this chain to an annual report or a single latest timestamp. */
  netProfit: Array<{ fy: number; q: number; periodEnd: string; amounts: QuarterAmountsSource | null }>;
  capital: QuarterReportSource | null;
}

const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

/** Metadata-only identity checks. Never participates in dedupe or arithmetic. */
export function createQuarterSourceResolver(inputs: QuarterInput[]): (input: QuarterInput) => QuarterReportSource {
  const ids = new Map<number, number>();
  for (const input of inputs) if (input && validId(input.id)) ids.set(input.id, (ids.get(input.id) ?? 0) + 1);
  return input => {
    const record = input.record;
    const binding: QuarterReportSource["binding"] = !validId(input.id) ? "invalid_identity"
      : ids.get(input.id) !== 1 ? "ambiguous_identity"
      : !record ? "missing_record"
      : record.id !== input.id ? "identity_mismatch"
      : record.financialPeriodEnd !== input.period_end ? "period_mismatch"
      : "matched";
    return {
      id: validId(input.id) ? input.id : null,
      periodEnd: input.period_end,
      periodMonths: input.period_months,
      unit: input.unit ?? null,
      binding,
      record: binding === "matched" && record ? { ...record } : null,
    };
  };
}
