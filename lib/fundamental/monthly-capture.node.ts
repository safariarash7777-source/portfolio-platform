import { fundamentalReadPair } from "./read-config.node.mjs";
import { projectMonthlyCohort, type CohortBatch } from "./monthly-cohort";
import type { CodalRow } from "./supabase";

/** Private proof capability. No caller-controlled host, route, period, issuer,
 * or SQL-shaped selector. The identifiers below are pilot selectors, not ISINs. */
export const MONTHLY_CAPTURE_VERSION = "monthly-capture-v2";
const CURRENT = "1405-07";
const BASELINE = "1404-07";
const SYMBOLS = ["فولاد", "کی بی سی", "شپدیس"] as const;
const PILOT = SYMBOLS.map(symbol => ({ id: symbol, symbol }));
const KNOWN_PUBLISHER_SERIALS = [
  { symbol: "فولاد", month: CURRENT, serial: "LyQnlYP7OOObOOOIDLto8TGJDkDQ==", witnessedAmount: 662639489 },
  { symbol: "فولاد", month: BASELINE, serial: "5nKO45yY4Zr5NLhxicMKgA==", witnessedAmount: 269323842 },
  { symbol: "کی بی سی", month: CURRENT, serial: "ENvoXfX5exv7M34fcbnpNA==", witnessedAmount: 890995 },
  { symbol: "شپدیس", month: CURRENT, serial: "IysBiBJD5If1wqv5zbL6ew==", witnessedAmount: null },
] as const;
const ROW_CAP = 600; // One statement, plus one sentinel row to detect excess.
const BYTE_CAP = 256 * 1024;
const TOTAL_MS = 8_000;
const SELECT = [
  "id", "symbol", "report_kind", "period_end", "title", "source_url", "captured_at",
  "financial_period:data->>period_end", "financial_symbol:data->>symbol", "financial_kind:data->>report_kind",
  "financial_months:data->period_months", "measure:data->>monthly_measure",
  "unit:data->>unit", "amount:data->period_total_amount", "observed_zero:data->sales_zero_reported",
  "announcement:raw->>announcement_link", "jperiod:raw->>period_end_jalali", "duration:raw->period_months",
  "parser:raw->parser_version", "pub_date:raw->>date_publish", "pub_time:raw->>time_publish",
].join(",");
const PROJECTION_KEYS = SELECT.split(",").map(field => field.split(":")[0]);
type ReadOutcome = "binding" | "deadline" | "transport" | "http" | "body_cap" | "invalid_shape" | "partial" | "row_cap";
class CaptureFailure extends Error { constructor(readonly reason: ReadOutcome) { super(reason); } }
const bad = (): never => { throw new CaptureFailure("invalid_shape"); };
const integerId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : bad();
const scalar = (v: unknown, limit: number) => v == null ? null : typeof v === "string" && v.length <= limit ? v : bad();
const smallNumber = (v: unknown) => v == null ? undefined : typeof v === "number" && Number.isSafeInteger(v) ? v : bad();
function fromProjection(value: unknown): CodalRow {
  const row = record(value);
  if (Object.keys(row).length !== PROJECTION_KEYS.length ||
      !PROJECTION_KEYS.every(key => Object.prototype.hasOwnProperty.call(row, key))) return bad();
  if (!integerId(row.id) || !SYMBOLS.some(s => s === row.symbol) || row.report_kind !== "ن-۳۰") return bad();
  // Type is the existing database contract, which historically permits missing
  // monetary fields at runtime. Preserve them so the projector rejects/labels
  // them. Never supply guessed unit, month, amount, company, or parser version.
  if (row.amount != null && (typeof row.amount !== "number" || !Number.isFinite(row.amount))) return bad();
  if (row.observed_zero != null && typeof row.observed_zero !== "boolean") return bad();
  const data = {
    symbol: scalar(row.financial_symbol, 120), report_kind: scalar(row.financial_kind, 10),
    period_end: scalar(row.financial_period, 20), period_months: smallNumber(row.financial_months),
    monthly_measure: scalar(row.measure, 100), unit: scalar(row.unit, 40), period_total_amount: row.amount,
    sales_zero_reported: row.observed_zero,
  } as unknown as CodalRow["data"];
  return { id: row.id, symbol: row.symbol as string, report_kind: "ن-۳۰",
    title: scalar(row.title, 1000), source_url: scalar(row.source_url, 4096), period_end: scalar(row.period_end, 20),
    captured_at: scalar(row.captured_at, 64), data,
    raw: { announcement_link: scalar(row.announcement, 4096),
      period_end_jalali: scalar(row.jperiod, 20) ?? undefined, period_months: smallNumber(row.duration),
      parser_version: smallNumber(row.parser), date_publish: scalar(row.pub_date, 64) ?? undefined,
      time_publish: scalar(row.pub_time, 64) ?? undefined } };
}

async function until<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new CaptureFailure("deadline");
  let abort!: () => void;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        abort = () => reject(new CaptureFailure("deadline"));
        signal.addEventListener("abort", abort, { once: true });
      }),
      Promise.resolve().then(run),
    ]);
  } finally { signal.removeEventListener("abort", abort); }
}

function resultOf(batch: CohortBatch, failure: ReadOutcome | null, usage: { requests: number; bytes: number; rows: number }) {
  const sales = projectMonthlyCohort(batch, PILOT.filter(p => p.symbol !== "کی بی سی"), CURRENT, "sales");
  const services = projectMonthlyCohort(batch, PILOT.filter(p => p.symbol === "کی بی سی"), CURRENT, "service_recognized_income");
  const projections = [...sales.rows, ...services.rows];
  const officialWitnesses = KNOWN_PUBLISHER_SERIALS.map(expected => {
    const found = projections.find(row => row.symbol === expected.symbol)!;
    const p = expected.month === CURRENT ? found.current : found.baseline;
    const status = sales.state !== "complete" ? "not_confirmed"
      : p.state === "ready" && p.evidence.serial === expected.serial && expected.witnessedAmount === null ? "selected_serial_amount_not_captured"
      : p.state === "ready" && p.evidence.serial === expected.serial
        ? p.amountMillionIrr === expected.witnessedAmount ? "selected_known_serial" : "same_serial_value_unchecked"
      : p.state === "ready" ? "selected_other_serial_unchecked"
      : p.state === "unverified" ? "unverified" : "not_observed_in_read";
    // Witness amounts are not used to calculate a point. They only gate
    // already normalized rows known to match this bounded captured proof.
    return { symbol: expected.symbol, month: expected.month, serial: expected.serial, status };
  });
  // Comparison values are not certified by a stored source URL alone. This
  // fixed proof gates ratios on both previously captured official identities.
  function verifiedRatio(row: typeof sales.rows[number]) {
    return officialWitnesses.filter(p => p.symbol === row.symbol && p.status === "selected_known_serial").length === 2
      ? row.yoyPercent : null;
  }
  const scope = {
    store: "three fixed issuers' normalized monthly ledger; not full-market or publisher inventory",
    current: CURRENT, baseline: BASELINE, version: MONTHLY_CAPTURE_VERSION,
  };
  return { state: sales.state, failure, scope, usage: { ...usage }, officialWitnesses,
    normalizedRatiosWithKnownSerials: Object.fromEntries(projections.map(row => [row.symbol, verifiedRatio(row)])),
    observed: projections.map(row => ({ issuerSelector: row.issuerId, symbol: row.symbol, current: row.current, baseline: row.baseline })),
  };
}

type CaptureOptions = {
  environment: Readonly<Record<string, string | undefined>>;
  read: typeof fetch;
  /** Cancellation only narrows the fixed transport budget; it cannot lengthen it. */
  signal?: AbortSignal;
};

export async function readFixedMonthlyCapture({ environment, read, signal }: CaptureOptions) {
  const usage = { requests: 0, bytes: 0, rows: 0 };
  const binding = fundamentalReadPair(environment);
  if (!binding) return resultOf({ maxId: 0, pages: [] }, "binding", usage);
  const pageTimeout = AbortSignal.timeout(TOTAL_MS);
  const deadline = signal ? AbortSignal.any([pageTimeout, signal]) : pageTimeout;
  const withinBinding = () => {
    if (binding.expiresAt <= Date.now() / 1000) throw new CaptureFailure("binding");
    if (deadline.aborted) throw new CaptureFailure("deadline");
  };
  try {
    withinBinding();
    const url = new URL(binding.url + "/rest/v1/codal_reports");
    url.search = new URLSearchParams({
      symbol: `in.(${SYMBOLS.map(s => JSON.stringify(s)).join(",")})`,
      report_kind: "eq.ن-۳۰", data: "not.is.null", limit: String(ROW_CAP + 1), select: SELECT,
    }).toString();
    usage.requests++;
    const response = await until(deadline, () => read(url, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal: deadline,
      headers: { apikey: binding.anon, Authorization: `Bearer ${binding.anon}`,
        Accept: "application/json", Prefer: "count=exact" },
    }));
    // In reviewed PostgREST versions this header and body originate in one
    // Read Committed statement. A capped or unknown total is not a snapshot.
    const range = response.headers.get("content-range");
    const rangeUnit = response.headers.get("range-unit");
    const appliedCount = response.headers.get("preference-applied")?.split(",")
      .map(value => value.trim().toLowerCase()).filter(value => /^count\s*=/.test(value)) ?? [];
    const incompatibleHeaders = (rangeUnit !== null && rangeUnit.toLowerCase() !== "items") ||
      (appliedCount.length > 0 && (appliedCount.length !== 1 || !/^count\s*=\s*exact$/.test(appliedCount[0])));
    const match = range?.match(/^0-(0|[1-9]\d*)\/([1-9]\d*)$/);
    const total = range === "*/0" ? 0 : match ? Number(match[2]) : null;
    const rejection = response.status === 206
      ? total !== null && total > ROW_CAP ? "row_cap" : "partial"
      : response.status !== 200 ? "http"
      : incompatibleHeaders || total === null || !Number.isSafeInteger(total) ? "partial"
      : total > ROW_CAP ? "row_cap"
      : match && Number(match[1]) !== total - 1 ? "partial" : null;
    if (rejection) {
      void response.body?.cancel().catch(() => {});
      throw new CaptureFailure(rejection);
    }
    const media = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (media !== "application/json") {
      void response.body?.cancel().catch(() => {});
      return bad();
    }
    const reader = response.body?.getReader();
    if (!reader) return bad();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let content = "";
    try {
      for (;;) {
        const { done, value } = await until(deadline, () => reader.read());
        if (done) break;
        usage.bytes += value.byteLength;
        if (usage.bytes > BYTE_CAP) throw new CaptureFailure("body_cap");
        try { content += decoder.decode(value, { stream: true }); } catch { return bad(); }
      }
      try { content += decoder.decode(); } catch { return bad(); }
    } finally { void reader.cancel().catch(() => {}); }
    withinBinding();
    let values: unknown;
    try { values = JSON.parse(content); } catch { return bad(); }
    if (!Array.isArray(values)) return bad();
    if (values.length > ROW_CAP) throw new CaptureFailure("row_cap");
    if (values.length !== total) throw new CaptureFailure("partial");
    const rows = values.map(fromProjection).sort((a,b) => b.id - a.id);
    if (new Set(rows.map(row => row.id)).size !== rows.length) return bad();
    usage.rows = rows.length;
    // The legacy projector expects a terminal page witness. These pages
    // are created locally from the single validated statement response.
    const maxId = rows[0]?.id ?? 0;
    const pages = rows.length
      ? [{ beforeId: null, rows }, { beforeId: rows[rows.length - 1].id, rows: [] }]
      : [{ beforeId: null, rows: [] }];
    return resultOf({ maxId, pages }, null, usage);
  } catch (error) {
    const failure: ReadOutcome = error instanceof CaptureFailure ? error.reason : "transport";
    return resultOf({ maxId: 0, pages: [] }, failure, usage);
  }
}
