// Fixed-cardinality, content-free counters of existing null-return guards.
// First failed N10 guard; N30 aggregates skipped rows only when no product survives.
// Optional bounded public metadata describes future hooked attempts only.
// Not a history reconstruction, provider verdict, acceptance rule or report data.
export const ADMISSION_REASONS = Object.freeze({
  "ن-۱۰": Object.freeze(["context_invalid", "geometry_ambiguous", "scope_unknown", "scope_unsupported",
    "statement_ambiguous", "unit_unverified", "values_unobserved", "period_unverified", "arithmetic_mismatch",
    "capital_unverified", "normalized_identity_mismatch", "eps_unverified", "internal_exception", "unspecified"]),
  "ن-۳۰": Object.freeze(["unsupported_layout", "short_rows", "missing_sales", "zero_sales_only",
    "arithmetic_mismatch", "mixed_rows", "no_product_rows", "unspecified"]),
});

export function admissionCounts() {
  return Object.fromEntries(Object.entries(ADMISSION_REASONS).map(([kind, reasons]) =>
    [kind, Object.fromEntries(reasons.map(reason => [reason, 0]))]));
}
function readCounts(value) {
  const clean = admissionCounts();
  for (const [kind, counts] of Object.entries(clean)) for (const reason of Object.keys(counts)) {
    const count = value?.[kind]?.[reason];
    if (Number.isSafeInteger(count) && count >= 0) counts[reason] = count;
  }
  return clean;
}
export function readAdmissionDiagnostics(value) {
  const lastCycle = readCounts(value?.version === 1 ? value.lastCycle : null);
  return { version: 1, totals: readCounts(value?.version === 1 ? value.totals : null), lastCycle,
    observations: readObservations(value?.version === 1 ? value.observations : null, lastCycle) };
}
export function admissionEvent(value, expectedKind) {
  if (value?.kind !== expectedKind || !Object.hasOwn(ADMISSION_REASONS, expectedKind) ||
      !ADMISSION_REASONS[expectedKind].includes(value.reason)) return null;
  return { kind: expectedKind, reason: value.reason }; // Drop all unknown fields.
}
export function recordAdmissionRejection(diagnostics, kind, event, context) {
  if (!Object.hasOwn(ADMISSION_REASONS, kind)) return;
  const reason = admissionEvent(event, kind)?.reason ?? "unspecified";
  for (const counts of [diagnostics.totals, diagnostics.lastCycle]) {
    counts[kind][reason] = Math.min(Number.MAX_SAFE_INTEGER, counts[kind][reason] + 1);
  }
  // This observer must not change the existing count, null result or retry path.
  try {
    const window = diagnostics.observations;
    if (window?.limit == null) return;
    let observation = null;
    try {
      observation = cleanObservation({ kind, reason, lane: context?.lane,
        announcementRef: context?.announcement?.link, periodDeclaredText: context?.announcement?.date_title,
        attemptStartedAt: context?.attemptStartedAt, rejectedAt: context?.rejectedAt }, window.cycleStartedAt);
    } catch { /* malformed optional metadata is omitted, not an ingestion failure */ }
    if (observation && window.events.length < window.limit) {
      const candidate = { ...window, events: [...window.events, observation] };
      if (byteSize(candidate) <= ADMISSION_OBSERVATION_BYTES - 32) { window.events.push(observation); return; }
    }
    window.omittedCount = Math.min(Number.MAX_SAFE_INTEGER, window.omittedCount + 1);
    window.coverage = "partial";
    while (window.events.length && byteSize(window) > ADMISSION_OBSERVATION_BYTES) {
      window.events.pop();
      window.omittedCount = Math.min(Number.MAX_SAFE_INTEGER, window.omittedCount + 1);
    }
  } catch {
    // An invalid optional envelope cannot throw across the admission boundary.
    try { diagnostics.observations = unknownObservations(); } catch { /* observer only */ }
  }
}
export function notifyAdmissionRejection(observer, kind, reason) {
  // Diagnostics must never turn a null into an exception or change acceptance.
  try { if (typeof observer === "function") observer({ kind, reason }); } catch { /* observer only */ }
  return null;
}

export const ADMISSION_OBSERVATION_CAP = 32;
export const ADMISSION_OBSERVATION_BYTES = 32 * 1024;
const unknownObservations = () => ({ version: 1, window: "cycle_observed_rejections", coverage: "unknown",
  limit: null, cycleStartedAt: null, omittedCount: null, events: [] });

function utc(value, now = Date.now()) {
  const ms = typeof value === "number" ? value :
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > now || ms > 8640000000000000) return null;
  const iso = new Date(ms).toISOString();
  return typeof value === "string" && iso !== value ? null : iso;
}
function sourceReference(value) {
  if (typeof value !== "string" || value.length > 512 || /[^\x21-\x7e]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["codal.ir", "www.codal.ir"].includes(url.hostname) || url.port ||
        url.username || url.password || url.hash || url.pathname.toLowerCase() !== "/reports/decision.aspx") return null;
    const seen = new Set();
    for (const [key, item] of url.searchParams) {
      if (seen.has(key) || !["LetterSerial", "rt", "let", "ct", "ft"].includes(key)) return null;
      seen.add(key);
      if (key !== "LetterSerial" && !/^-?\d{1,3}$/.test(item)) return null;
    }
    const id = url.searchParams.get("LetterSerial");
    if (!id || id.length > 256 || !/^[A-Za-z0-9+/_-]{16,254}={0,2}$/.test(id)) return null;
    return { ref: value, id };
  } catch { return null; }
}
function declaredPeriod(value) {
  // Quoted announcement text only, not a verified financial period/calendar.
  if (typeof value !== "string" || value.length !== 10) return null;
  const digits = value.replace(/[۰-۹٠-٩]/g, c => String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)));
  const match = digits.match(/^(1[34]\d{2})[/-](\d{2})[/-](\d{2})$/);
  return match && +match[2] >= 1 && +match[2] <= 12 && +match[3] >= 1 &&
    +match[3] <= (+match[2] <= 6 ? 31 : 30) ? value : null;
}
function cleanObservation(raw, cycleStartedAt) {
  if (!admissionEvent(raw, raw?.kind) || !["feed", "backfill"].includes(raw.lane)) return null;
  const source = sourceReference(raw.announcementRef);
  let start = utc(raw.attemptStartedAt), end = utc(raw.rejectedAt);
  if ((start && start < cycleStartedAt) || (end && end < cycleStartedAt) || (start && end && start > end)) start = end = null;
  return { kind: raw.kind, reason: raw.reason, lane: raw.lane, reportId: null,
    sourceAnnouncementId: source?.id ?? null, announcementRef: source?.ref ?? null,
    periodDeclaredText: declaredPeriod(raw.periodDeclaredText), periodVerified: null, scopeVerified: null,
    clocks: { sourceSentAt: null, sourcePublishedAt: null, attemptStartedAt: start, rejectedAt: end } };
}
const byteSize = value => Buffer.byteLength(JSON.stringify(value), "utf8");

/** Called only at the existing cycle-counter reset, never a new scheduler. */
export function resetAdmissionCycle(diagnostics, { feedMaxDownloads, backfillSymbols, backfillMaxDownloads }, startedAt) {
  diagnostics.lastCycle = admissionCounts();
  diagnostics.observations = unknownObservations();
  const settings = [feedMaxDownloads, backfillSymbols, backfillMaxDownloads];
  const clock = utc(startedAt);
  if (!clock || settings.some(n => !Number.isSafeInteger(n) || n < 0)) return;
  const [feed, symbols, backfill] = settings.map(n => Math.min(n, ADMISSION_OBSERVATION_CAP));
  diagnostics.observations = { version: 1, window: "cycle_observed_rejections", coverage: "observed",
    limit: Math.min(ADMISSION_OBSERVATION_CAP, feed + symbols * backfill), cycleStartedAt: clock,
    omittedCount: 0, events: [] };
}

function readObservations(value, counts) {
  try {
    if (value?.version !== 1 || value.window !== "cycle_observed_rejections" ||
        !["observed", "partial"].includes(value.coverage) || !Number.isInteger(value.limit) || value.limit < 0 ||
        value.limit > ADMISSION_OBSERVATION_CAP || !Number.isSafeInteger(value.omittedCount) || value.omittedCount < 0 ||
        !Array.isArray(value.events) || value.events.length > value.limit) return unknownObservations();
    const cycleStartedAt = utc(value.cycleStartedAt);
    if (!cycleStartedAt) return unknownObservations();
    const events = value.events.map(raw => cleanObservation({ kind: raw?.kind, reason: raw?.reason, lane: raw?.lane,
      announcementRef: raw?.announcementRef, periodDeclaredText: raw?.periodDeclaredText,
      attemptStartedAt: raw?.clocks?.attemptStartedAt, rejectedAt: raw?.clocks?.rejectedAt }, cycleStartedAt));
    if (events.some(e => !e)) return unknownObservations();
    const total = Object.values(counts).flatMap(Object.values).reduce((sum, n) => sum + n, 0);
    if (!Number.isSafeInteger(total) || events.length + value.omittedCount !== total ||
        value.coverage !== (value.omittedCount ? "partial" : "observed")) return unknownObservations();
    const observed = admissionCounts();
    for (const event of events) if (++observed[event.kind][event.reason] > counts[event.kind][event.reason]) return unknownObservations();
    const clean = { version: 1, window: "cycle_observed_rejections", coverage: value.coverage, limit: value.limit,
      cycleStartedAt, omittedCount: value.omittedCount, events };
    return byteSize(clean) <= ADMISSION_OBSERVATION_BYTES ? clean : unknownObservations();
  } catch { return unknownObservations(); }
}
