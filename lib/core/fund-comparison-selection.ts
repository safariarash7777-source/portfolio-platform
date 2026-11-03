import { fundSelectionIssue, MAX_FUND_COMPARISON, type FundComparisonRow } from "./fundComparison";

const empty = () => Array<string>(MAX_FUND_COMPARISON).fill("");
/** Public symbols only. The URL never contains an account, portfolio or credential. */
export function isFundSelectionValue(raw: string): boolean {
  if (!raw || raw.length > 1200) return false;
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.length !== MAX_FUND_COMPARISON) return false;
    if (!ids.every(id => typeof id === "string" && id.length <= 80 && id.trim() === id && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(id))) return false;
    const chosen = ids.filter(Boolean);
    return chosen.length > 0 && new Set(chosen).size === chosen.length;
  } catch { return false; }
}

export function restoreFundSelection(raw: string | null, funds: readonly FundComparisonRow[]): { ids: string[]; rejected: boolean } {
  if (!raw) return { ids: empty(), rejected: false };
  if (!isFundSelectionValue(raw)) return { ids: empty(), rejected: true };
  const ids: string[] = JSON.parse(raw);
  let anchor: FundComparisonRow | undefined;
  let rejected = false;
  const restored = ids.map(id => {
    const row = funds.find(fund => fund.id === id);
    // Preserve an unavailable selection; its existing notice requests a new choice.
    if (!row) return id;
    if (fundSelectionIssue(anchor, row)) { rejected = true; return ""; }
    anchor ??= row;
    return id;
  });
  return { ids: restored, rejected };
}

export function fundSelectionHref(href: string, ids: readonly string[]): string {
  const url = new URL(href, "https://local.invalid");
  const raw = JSON.stringify(ids);
  if (ids.some(Boolean) && isFundSelectionValue(raw)) url.searchParams.set("compare", raw);
  else url.searchParams.delete("compare");
  return `${url.pathname}${url.search}${url.hash}`;
}
