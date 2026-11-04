// Official archived bytes + historical parser output; ALL IDs/timestamps/transport
// in these tests are synthetic. No production ingestion or adoption receipt.
import { readFileSync } from "node:fs";
import { foladQuantityFixture, loadOfflineCodal } from "./codal-offline.mjs";
import { rowHash } from "../codal-reinterpretation.mjs";

export function reinterpretationFixture() {
  const fixture = foladQuantityFixture();
  const packet = JSON.parse(readFileSync(new URL("../../docs/ops/research-pilot-20261026/foolad/stored-source-packet.json", import.meta.url), "utf8"));
  const historical = packet.packets.flatMap(p => p.rows ?? []).find(r => r.id === 11653);
  const old = { ...historical, id: 1, company_name: "فولاد", captured_at: "2026-01-01T00:00:00+00:00" };
  const a = { l18: old.symbol, l30: old.company_name, link: old.raw.announcement_link, link_excel: old.raw.link_excel,
    title: old.title, date_title: old.raw.period_end_jalali.replaceAll("-", "/"),
    date_publish: old.raw.date_publish, time_publish: old.raw.time_publish };
  const archive = { bytes: fixture.bytes, manifest: { symbol: old.symbol, period_end_jalali: "1405-06-31",
    announcement_link: a.link, link_excel: a.link_excel, html_sha256: fixture.origin.htmlSha256,
    review_ref: "OFFLINE TEST: official archive; synthetic row identity; old byte hash UNKNOWN" } };
  return { old, a, archive, fixture };
}

export async function candidateFor(rows, id = 1, overrides = {}) {
  const f = reinterpretationFixture();
  /** @type {Array<ReturnType<typeof import('../codal-reinterpretation.mjs').adoptionPayload>>} */
  const payloads = [];
  const { parser } = loadOfflineCodal({ environment: { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic" },
    fetchFixture: async (_url, init) => {
      if (init.method === "POST") { payloads.push(JSON.parse(init.body)); return Response.json({}); }
      return Response.json([{ ...payloads[0].p_candidate, id: 2, captured_at: "2026-01-02T00:00:00+00:00" }]);
    } });
  const old = rows.find(r => r.id === id);
  const data = parser.parseArchivedReport(f.a, "ن-۳۰", f.archive, 3);
  await parser.insertParsedReport(f.a, "ن-۳۰", data, { baseline: { rows, id, sha256: rowHash(old), version: old.raw.parser_version },
    requestId: "00000000-0000-4000-8000-000000000001", ...overrides });
  if (payloads.length !== 1) throw new Error("expected exactly one synthetic POST");
  return payloads[0];
}
