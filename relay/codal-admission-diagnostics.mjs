// Fixed-cardinality, content-free observations of existing null-return guards.
// First failed N10 guard; N30 aggregates skipped rows only when no product survives.
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
  return { version: 1, totals: readCounts(value?.version === 1 ? value.totals : null),
    lastCycle: readCounts(value?.version === 1 ? value.lastCycle : null) };
}
export function admissionEvent(value, expectedKind) {
  if (value?.kind !== expectedKind || !Object.hasOwn(ADMISSION_REASONS, expectedKind) ||
      !ADMISSION_REASONS[expectedKind].includes(value.reason)) return null;
  return { kind: expectedKind, reason: value.reason }; // Drop all unknown fields.
}
export function recordAdmissionRejection(diagnostics, kind, event) {
  if (!Object.hasOwn(ADMISSION_REASONS, kind)) return;
  const reason = admissionEvent(event, kind)?.reason ?? "unspecified";
  for (const counts of [diagnostics.totals, diagnostics.lastCycle]) {
    counts[kind][reason] = Math.min(Number.MAX_SAFE_INTEGER, counts[kind][reason] + 1);
  }
}
export function notifyAdmissionRejection(observer, kind, reason) {
  // Diagnostics must never turn a null into an exception or change acceptance.
  try { if (typeof observer === "function") observer({ kind, reason }); } catch { /* observer only */ }
  return null;
}
