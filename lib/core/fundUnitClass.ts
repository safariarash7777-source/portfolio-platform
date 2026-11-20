/** A source-attested class is required; a symbol/category is never a class mapping. */
export type FundUnitClass = "etf-tradable" | "ordinary-subscription" | "preferred-tradable";
export interface FundClassEvidence {
  unitClass: FundUnitClass;
  source: string;
}

export const UNIT_CLASS_LABELS: Record<FundUnitClass, string> = {
  "etf-tradable": "واحد قابل معامله",
  "ordinary-subscription": "واحد عادی صدور و ابطال",
  "preferred-tradable": "واحد ممتاز قابل معامله",
};

export function evidencedClass(evidence: FundClassEvidence | null | undefined): FundUnitClass | null {
  return typeof evidence?.source === "string" && evidence.source.trim() && Object.hasOwn(UNIT_CLASS_LABELS, evidence.unitClass) ? evidence.unitClass : null;
}

export function readFundClassEvidence(value: unknown): FundClassEvidence | null {
  if (value === null || typeof value !== "object" || !("unitClass" in value) || !("source" in value)) return null;
  if (typeof value.source !== "string" || !value.source.trim() || typeof value.unitClass !== "string"
    || !Object.hasOwn(UNIT_CLASS_LABELS, value.unitClass)) return null;
  return { unitClass: value.unitClass as FundUnitClass, source: value.source.trim() };
}
