// Explicit, single-announcement adoption only. No discovery, scheduler or retry loop.
import { createHash } from "node:crypto";

export const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const rowHash = row => createHash("sha256").update(canonical(row)).digest("hex");
const baseUrl = row => row.source_url?.replace(/#pv\d+$/, "");

export function validateArchive(a, kind, archive, version, period) {
  const m = archive?.manifest;
  if (kind !== "ن-۳۰" || !Number.isSafeInteger(version) || version <= 2 || version > 1000000
      || !(archive?.bytes instanceof Uint8Array) || !archive.bytes.length || archive.bytes.length > 10_000_000
      || !m || m.symbol !== a.l18 || m.period_end_jalali !== period || m.announcement_link !== a.link
      || m.link_excel !== a.link_excel || typeof m.review_ref !== "string" || !m.review_ref.trim()
      || !/^[a-f0-9]{64}$/.test(m.html_sha256 ?? "")
      || createHash("sha256").update(archive.bytes).digest("hex") !== m.html_sha256) throw new Error("archive identity/hash/version mismatch");
  const announcement = new URL(a.link), excel = new URL(a.link_excel);
  if (announcement.protocol !== "https:" || announcement.hostname !== "codal.ir" || announcement.hash
      || announcement.username || announcement.password || announcement.pathname !== "/Reports/Decision.aspx"
      || excel.protocol !== "https:" || excel.hostname !== "excel.codal.ir" || excel.hash || excel.username || excel.password
      || decodeURIComponent(excel.pathname) !== `/service/Excel/GetAll/${announcement.searchParams.get("LetterSerial")}/0`)
    throw new Error("archive announcement/Excel identity mismatch");
  return structuredClone(m);
}

// Compare every legacy field: only the new provenance/quantity admission fields
// may be enriched. Amounts, order, raw rates and legacy quantities cannot drift.
export function legacyProjection(value) {
  const enrichment = new Set(["quantity_source", "quantity_witness", "quantity_unit", "quantity_status", "quantity_reason", "market_basis", "qty_unit", "market", "unit_header", "unit_inferred", "period_months"]);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(legacyProjection);
  return Object.fromEntries(Object.entries(value).filter(([k]) => !enrichment.has(k)).map(([k,v]) => [k, legacyProjection(v)]));
}
export function preservesLegacy(value, candidate) {
  return canonical(legacyProjection(value)) === canonical(legacyProjection(candidate));
}

export function adoptionPayload(row, context, request) {
  const baseline = request?.baseline;
  const old = baseline?.rows?.find(r => r.id === baseline.id);
  if (!old || baseline.rows.length > 500 || baseline.rows.some(r => r.symbol !== row.symbol || r.report_kind !== "ن-۳۰" || r.period_end !== row.period_end)
      || baseline.sha256 !== rowHash(old) || baseline.version !== old.raw?.parser_version
      || !/^[a-f0-9]{64}$/.test(baseline.sha256) || !/^[a-f0-9-]{36}$/.test(request.requestId ?? "")
      || old.symbol !== row.symbol || old.report_kind !== row.report_kind || old.period_end !== row.period_end
      || old.raw?.period_end_jalali !== context.manifest.period_end_jalali || baseUrl(old) !== context.manifest.announcement_link
      || old.raw?.period_months !== 1 || row.data?.period_months !== 1
      || old.raw?.announcement_link !== baseUrl(old) || old.raw?.link_excel !== context.manifest.link_excel
      || old.source_url !== `${baseUrl(old)}#pv${baseline.version}` || baseline.version >= context.version
      || baseline.rows.some(r => baseUrl(r) === baseUrl(old) && (r.raw?.parser_version ?? 1) >= context.version)
      || !preservesLegacy(old.data, row.data)) throw new Error("adoption baseline/legacy mismatch");
  // Preserve publication, title (including amendment), and old raw fields. Never
  // label the old record as byte-verified. This is a NEW interpretation only.
  const candidate = { ...old, ...row, company_name: old.company_name, title: old.title, published_at: old.published_at,
    raw: { ...old.raw, parser_version: context.version, quantity_capture: row.raw.quantity_capture,
      reinterpretation: { schema: 1, operation: "archive", request_id: request.requestId,
        baseline_id: old.id, baseline_sha256: baseline.sha256, baseline_version: baseline.version,
        original_body_sha256: old.raw?.quantity_capture?.html_sha256 ?? null,
        archive: context.manifest } } };
  delete candidate.id;
  delete candidate.captured_at;
  return { p_baseline: baseline.rows, p_baseline_id: old.id, p_candidate: candidate };
}

export function restorePayload(baseline, restoreId, targetVersion, requestId) {
  const old = baseline.rows.find(r => r.id === baseline.id), prior = baseline.rows.find(r => r.id === restoreId);
  if (!old || !prior || rowHash(old) !== baseline.sha256 || old.raw?.parser_version !== baseline.version
      || baseUrl(old) !== baseUrl(prior) || old.period_end !== prior.period_end || old.symbol !== prior.symbol
      || old.report_kind !== "ن-۳۰" || prior.report_kind !== "ن-۳۰"
      || prior.raw?.parser_version >= baseline.version || !Number.isSafeInteger(targetVersion) || targetVersion <= baseline.version
      || !/^[a-f0-9-]{36}$/.test(requestId ?? "")) throw new Error("invalid restore baseline");
  const candidate = structuredClone(old);
  delete candidate.id;
  delete candidate.captured_at;
  candidate.source_url = `${baseUrl(old)}#pv${targetVersion}`;
  candidate.data = structuredClone(prior.data);
  delete candidate.raw.quantity_capture;
  candidate.raw.parser_version = targetVersion;
  candidate.raw.reinterpretation = { schema: 1, operation: "restore", request_id: requestId,
    baseline_id: old.id, baseline_sha256: baseline.sha256, baseline_version: baseline.version, restore_id: prior.id };
  return { p_baseline: baseline.rows, p_baseline_id: old.id, p_candidate: candidate };
}

// One POST, then authoritative exact readback even when the POST response is
// lost/invalid. An absent record is UNKNOWN, never permission for automatic retry.
export async function persistReinterpretation(payload, { fetch, url, headers }) {
  try {
    const response = await fetch(`${url}/rest/v1/rpc/codal_reinterpret_one`, {
      method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: "error", credentials: "omit",
    });
    // Consume only success; even a failed response can be ambiguous at a proxy.
    if (response.ok) await response.json();
  } catch { /* Resolve only from exact persisted row, never replay. */ }
  return await readBackReinterpretation(payload, { fetch, url, headers });
}

/** Recovery entry point: GET only, using the already saved original intent. */
export async function readBackReinterpretation(payload, { fetch, url, headers }) {
  const expected = payload.p_candidate;
  try {
    const qs = new URLSearchParams({ select: "*", source_url: `eq.${expected.source_url}`, limit: "2" });
    const response = await fetch(`${url}/rest/v1/codal_reports?${qs}`, { method: "GET", headers, signal: AbortSignal.timeout(15000), redirect: "error", credentials: "omit" });
    if (!response.ok) throw new Error("readback failed");
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("missing/duplicate");
    const { id, captured_at, ...actual } = rows[0];
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(Date.parse(captured_at)) || canonical(actual) !== canonical(expected))
      throw new Error("stored identity/payload mismatch");
    return { status: "confirmed", row: rows[0] };
  } catch {
    const error = new Error("Reinterpretation write outcome UNKNOWN; preserve request and read back before any manual retry");
    error.name = "ReinterpretationUnknownWrite";
    throw error;
  }
}
