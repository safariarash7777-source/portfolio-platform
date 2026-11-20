// Coverage here means stored row count only, not validated financial coverage.
// PostgREST may return fewer rows than requested; only an empty page ends a read.
export async function readStoredReportCounts(symbols, { baseUrl, headers, fetch: read = globalThis.fetch }) {
  const counts = new Map();
  if (!symbols.length) return counts;
  const wanted = new Set(symbols);
  const list = [...wanted].map(s => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",");
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const qs = new URLSearchParams({ select: "id,symbol", symbol: `in.(${list})`, order: "id.desc", limit: "1000" });
    if (cursor !== null) qs.set("id", `lt.${cursor}`);
    const res = await read(`${baseUrl}/rest/v1/codal_reports?${qs}`, {
      headers, signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`covered reports HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("covered reports invalid schema");
    if (!rows.length) return counts;
    for (const row of rows) {
      const id = row?.id;
      const validId = (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
        (typeof id === "string" && /^[1-9]\d*$/.test(id));
      if (!validId || !wanted.has(row.symbol) || (cursor !== null && BigInt(id) >= BigInt(cursor))) {
        throw new Error("covered reports invalid identity/order");
      }
      cursor = String(id);
      counts.set(row.symbol, (counts.get(row.symbol) || 0) + 1);
    }
  }
  throw new Error("covered reports page limit reached");
}
