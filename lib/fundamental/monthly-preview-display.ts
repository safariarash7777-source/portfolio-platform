import type { readFixedMonthlyCapture } from "./monthly-capture.node";

type Capture = Awaited<ReturnType<typeof readFixedMonthlyCapture>>;
const cohort = ["فولاد", "کی بی سی", "شپدیس"] as const;
type PilotSymbol = typeof cohort[number];
export type PilotPoint = Readonly<{amountMillionIrr: number; rowId: number; sourceUrl: string}>;
type PilotRow = Readonly<{symbol: PilotSymbol; current: PilotPoint | null; baseline: PilotPoint | null; ratio: number | null}>;
export type PilotSnapshot = Readonly<{
  commit: string; state: "complete" | "unavailable"; rows: readonly PilotRow[];
}>;
export const pilotScope = {current: "1405-07", baseline: "1404-07", version: "monthly-capture-v2"} as const;

export function toPilotSnapshot(commit: string, result: Capture | null): PilotSnapshot {
  const rows: PilotRow[] = [];
  if (!result || result.state !== "complete" || result.failure !== null || result.usage.requests !== 1)
    return {commit, state: "unavailable", rows};
  for (const symbol of cohort) {
    const row = result.observed.find(row => row.symbol === symbol);
    const point = (which: "current" | "baseline"): PilotPoint | null => {
      const observed = row?.[which];
      if (observed?.state !== "ready") return null;
      const witness = result.officialWitnesses.find(w => w.symbol === symbol && w.month === pilotScope[which] &&
        w.status === "selected_known_serial" && w.serial === observed.evidence.serial);
      if (!witness || !/^[A-Za-z0-9_+/-]{8,80}={0,2}$/.test(witness.serial) ||
        !Number.isSafeInteger(observed.evidence.rowId) || observed.evidence.rowId <= 0 ||
        !Number.isFinite(observed.amountMillionIrr) || observed.amountMillionIrr < 0) return null;
      return {amountMillionIrr: observed.amountMillionIrr, rowId: observed.evidence.rowId,
        sourceUrl: "https://codal.ir/Reports/Decision.aspx?LetterSerial=" + encodeURIComponent(witness.serial) + "&rt=" + (symbol === "کی بی سی" ? "5" : "0") + "&let=58&ct=0&ft=-1"};
    };
    const current = point("current");
    const baseline = point("baseline");
    const ratio = result.normalizedRatiosWithKnownSerials[symbol];
    rows.push({symbol, current, baseline,
      ratio: current && baseline && typeof ratio === "number" && Number.isFinite(ratio) ? ratio : null});
  }
  if (!rows.some(row => row.current || row.baseline)) return {commit, state: "unavailable", rows: []};
  return {commit, state: "complete", rows};
}
