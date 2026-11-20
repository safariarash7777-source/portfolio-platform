// Pure correctness scaffold. No fetch, env, persistence, screening rule, or UI.
import { jalaliYmdToGregorian } from "../core/jalali";
import { monthKeyOf } from "../core/monthlyReport";
import { yoyGrowthPercent } from "../core/fundamentalPresets";
import { approvedCodalUrl } from "../desk/workspace-model";
import { dedupeByPeriod, isConsolidatedTitle, latestParserRows, rowProvenance, type CodalRow } from "./supabase";
import { isMonthlyMeasure, type MonthlyMeasure } from "./types";
import { isMillionRialUnit } from "./units";

type ReadState = "complete" | "partial" | "unavailable";
export type CohortPage = { beforeId: number | null; rows: readonly CodalRow[] };
export type CohortBatch = { maxId: number; pages: readonly CohortPage[] };
const validId = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Only an explicit, ordered empty page completes a read. Adapters must use
 * the same cohort/upper ID/filter for every page, descend by immutable row ID,
 * and preserve all versions of selected announcements. No page is fetched here.
 * A transport failure supplies only pages already received (or no pages). */
function readBatch({ maxId, pages }: CohortBatch): { state: ReadState; rows: CodalRow[] } {
  const unavailable = { state: "unavailable" as const, rows: [] };
  if (!Number.isSafeInteger(maxId) || maxId < 0 || !pages.length) return unavailable;
  const rows: CodalRow[] = [];
  let before: number | null = null;
  for (const [index, page] of pages.entries()) {
    if (!page || page.beforeId !== before || !Array.isArray(page.rows) || page.rows.length > 1_000) return unavailable;
    if (!page.rows.length) return index === pages.length - 1 ? { state: "complete", rows } : unavailable;
    for (const row of page.rows) {
      if (!row || !validId(row.id) || row.id > maxId || (before != null && row.id >= before)) return unavailable;
      before = row.id;
      rows.push(row);
    }
  }
  return { state: "partial", rows: [] };
}

export type CohortIssuer = { id: string; symbol: string };
type SourceRecord = ReturnType<typeof rowProvenance>;
type SourceEvidence = {
  serial: string;
  rowId: number;
  sourceUrl: string;
  record: SourceRecord;
};
type Rejection = "identity" | "scope" | "period" | "measure" | "unit" | "amount" | "ambiguous-period";
type Point =
  | { state: "ready"; amountMillionIrr: number; evidence: SourceEvidence }
  | { state: "missing" | "not-confirmed" }
  | { state: "unverified"; reason: Rejection; evidence: SourceEvidence | null };

function monthlySerial(link: unknown) {
  if (typeof link !== "string" || link.length > 4096 || !/^https:\/\//.test(link)) return null;
  const clean = approvedCodalUrl(link.replace(/#pv\d+$/, ""));
  if (!clean) return null;
  const url = new URL(clean);
  if (url.hash || url.pathname !== "/Reports/Decision.aspx" ||
    url.searchParams.getAll("let").length !== 1 || url.searchParams.get("let") !== "58") return null;
  const pairs = url.search.slice(1).split("&").filter(p => p.startsWith("LetterSerial="));
  if (pairs.length !== 1) return null;
  try {
    // Do not use URLSearchParams for the legacy unescaped '+': it is part of the serial.
    const serial = decodeURIComponent(pairs[0].slice("LetterSerial=".length));
    return /^[A-Za-z0-9_+/-]{8,80}={0,2}$/.test(serial) ? serial : null;
  } catch { return null; }
}

// The first common cohort compares full calendar months only. A partial
// issuer period remains unverified even if it falls in the same month key.
function isMonthEnd(period: string, storedDate: string | null | undefined) {
  const parts = /^1[34]\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(period);
  if (!parts || !storedDate || jalaliYmdToGregorian(period) !== storedDate) return false;
  const month = Number(parts[1]);
  const year = Number(period.slice(0, 4));
  const next = jalaliYmdToGregorian(`${year + (month === 12 ? 1 : 0)}-${month === 12 ? 1 : month + 1}-01`);
  return next != null && Date.parse(next) - Date.parse(storedDate) === 86_400_000;
}

function pointOf(
  rows: readonly CodalRow[], month: string, issuer: CohortIssuer, measure: MonthlyMeasure,
): Point {
  const candidates = rows.filter(row => monthKeyOf(row.data.period_end) === month);
  if (!candidates.length) return { state: "missing" };
  if (candidates.length !== 1) return { state: "unverified", reason: "ambiguous-period", evidence: null };
  const row = candidates[0];
  const data = row.data;
  const badIdentity: Point = { state: "unverified", reason: "identity", evidence: null };
  const rawLink = row.raw?.announcement_link;
  if (rawLink != null && typeof rawLink !== "string") return badIdentity;
  const serial = monthlySerial(row.source_url);
  if (!serial || typeof row.source_url !== "string") return badIdentity;
  const version = row.raw?.parser_version;
  const suffix = row.source_url.match(/#pv(\d+)$/);
  if (version != null && (!validId(version) || (suffix && Number(suffix[1]) !== version))) return badIdentity;
  const record = rowProvenance(row);
  if (record.id !== row.id || !record.sourceUrl || monthlySerial(record.sourceUrl) !== serial ||
    data.symbol !== issuer.symbol || data.report_kind !== "ن-۳۰") return badIdentity;
  const evidence = { serial, rowId: row.id, sourceUrl: record.sourceUrl, record };
  const invalid = (reason: Rejection): Point => ({ state: "unverified", reason, evidence });
  const title = typeof row.title === "string"
    ? row.title.replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\s\u200c]/g, "") : null;
  if (!title?.includes("گزارشفعالیتماهانه") || isConsolidatedTitle(row.title)) return invalid("scope");
  const rawPeriod = row.raw?.period_end_jalali;
  if (!isMonthEnd(data.period_end, row.period_end) ||
    (rawPeriod != null && (typeof rawPeriod !== "string" || rawPeriod.replaceAll("/", "-") !== data.period_end)) ||
    (data["period_months"] != null && data["period_months"] !== 1) ||
    (row.raw?.period_months != null && row.raw.period_months !== 1)) return invalid("period");
  if ((data["monthly_measure"] ?? "sales") !== measure) return invalid("measure");
  if (!isMillionRialUnit(data.unit)) return invalid("unit");
  const amount = data["period_total_amount"];
  if (typeof amount !== "number" || !Number.isFinite(amount) ||
    (amount === 0 && measure === "sales" && data["sales_zero_reported"] !== true)) return invalid("amount");
  return { state: "ready", amountMillionIrr: amount, evidence };
}

export function projectMonthlyCohort(
  batch: CohortBatch, expected: readonly CohortIssuer[], currentMonth: string, measure: MonthlyMeasure,
) {
  if (!/^1[34]\d{2}-(?:0[1-9]|1[0-2])$/.test(currentMonth) ||
    Number(currentMonth.slice(0, 4)) <= 1300 || !isMonthlyMeasure(measure)) throw Error("invalid cohort period/measure");
  const baselineMonth = String(Number(currentMonth.slice(0, 4)) - 1) + currentMonth.slice(4);
  const ids = new Set<string>();
  const bySymbol = new Map<string, CodalRow[]>();
  for (const issuer of expected) {
    if (!issuer.id.trim() || issuer.id.trim() !== issuer.id || !issuer.symbol.trim() ||
      issuer.symbol.trim() !== issuer.symbol || ids.has(issuer.id) || bySymbol.has(issuer.symbol))
      throw Error("ambiguous cohort issuer identity");
    ids.add(issuer.id);
    bySymbol.set(issuer.symbol, []);
  }
  const batchRead = readBatch(batch);
  for (const row of batchRead.rows)
    if (row.report_kind === "ن-۳۰" && row.data && bySymbol.has(row.symbol)) bySymbol.get(row.symbol)!.push(row);
  const notConfirmed: Point = { state: "not-confirmed" };
  const rows = expected.map(issuer => {
    // Use the main reader's parser precedence and amendment/date/ID tie-breakers.
    // Key by stable publisher serial, not URL spelling or parameter order.
    const latest = latestParserRows(bySymbol.get(issuer.symbol)!, row => {
      const serial = monthlySerial(row.source_url) ?? monthlySerial(row.raw?.announcement_link);
      return serial ? `codal:${serial}` : null;
    });
    const originals = new Map(latest.map(row => [row.id, row]));
    const selected = dedupeByPeriod(latest.map(row => ({ ...row, data: { ...row.data, period_months: 1 } })))
      .map(row => originals.get(row.id)!);
    const current = batchRead.state === "complete" ? pointOf(selected, currentMonth, issuer, measure) : notConfirmed;
    const baseline = batchRead.state === "complete" ? pointOf(selected, baselineMonth, issuer, measure) : notConfirmed;
    const ratio = current.state === "ready" && baseline.state === "ready"
      ? yoyGrowthPercent(current.amountMillionIrr, baseline.amountMillionIrr) : null;
    return { issuerId: issuer.id, symbol: issuer.symbol, current, baseline, yoyPercent: Number.isFinite(ratio) ? ratio : null };
  });
  const coverage = {
    expectedIssuers: expected.length,
    confirmedCurrent: rows.filter(row => row.current.state === "ready").length,
    confirmedBaseline: rows.filter(row => row.baseline.state === "ready").length,
    confirmedPairs: rows.filter(row => row.current.state === "ready" && row.baseline.state === "ready").length,
    yoyAvailable: rows.filter(row => row.yoyPercent != null).length,
  };
  // Counts on a partial/unavailable read are unknown, not data or zero coverage.
  return { state: batchRead.state, currentMonth, baselineMonth, measure, rows,
    coverage: batchRead.state === "complete" ? coverage : { expectedIssuers: expected.length,
      confirmedCurrent: null, confirmedBaseline: null, confirmedPairs: null, yoyAvailable: null } };
}
