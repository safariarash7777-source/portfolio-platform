import test from "node:test";
import assert from "node:assert/strict";
import { loadOfflineCodal } from "./fixtures/codal-offline.mjs";
import { reinterpretationFixture, candidateFor } from "./fixtures/reinterpretation.mjs";
import { persistReinterpretation, readBackReinterpretation, rowHash, restorePayload } from "./codal-reinterpretation.mjs";

test("archive reuses producer, preserves money/old row and does not change global version", async () => {
  const f = reinterpretationFixture(), frozen = structuredClone(f.old);
  const p = await candidateFor([f.old]);
  assert.deepEqual(f.old, frozen);
  assert.equal(p.p_candidate.raw.parser_version, 3);
  assert.equal(p.p_candidate.raw.reinterpretation.original_body_sha256, null);
  assert.equal(p.p_candidate.data.period_total_amount, f.old.data.period_total_amount);
  assert.deepEqual(p.p_candidate.data.products.map(p => p.sales_amount), f.old.data.products.map(p => p.sales_amount));
  assert.equal(loadOfflineCodal().parser.PARSER_VERSION, 2);
  assert.equal(p.p_candidate.raw.quantity_capture.parser_version, 3);
  assert.equal(p.p_candidate.raw.quantity_capture.source_url, p.p_candidate.source_url);
  assert.ok(p.p_candidate.data.products.some(p => p.market === "صادراتی" && p.production_qty === 0));
});

test("archive rejects changed hash, symbol, period, announcement and same/global version", () => {
  const { parser, counts } = loadOfflineCodal();
  for (const mutate of [f => { f.archive.bytes = new Uint8Array([1]); }, f => { f.a.l18 = "فملی"; },
    f => { f.a.date_title = "1405/05/31"; }, f => { f.a.link += "x"; }]) {
    const f = reinterpretationFixture(); mutate(f);
    assert.throws(() => parser.parseArchivedReport(f.a, "ن-۳۰", f.archive, 3));
  }
  const f = reinterpretationFixture();
  assert.throws(() => parser.parseArchivedReport(f.a, "ن-۳۰", f.archive, 2));
  assert.equal(counts.network, 0);
});

test("copied, mutated or default insert cannot mint an archive receipt", async () => {
  const f = reinterpretationFixture(), { parser, counts } = loadOfflineCodal();
  const data = parser.parseArchivedReport(f.a, "ن-۳۰", f.archive, 3);
  await assert.rejects(parser.insertParsedReport(f.a, "ن-۳۰", data), /explicit/);
  await assert.rejects(parser.insertParsedReport(f.a, "ن-۳۰", structuredClone(data), {}), /explicit/);
  data.products[0].sales_amount++;
  await assert.rejects(parser.insertParsedReport(f.a, "ن-۳۰", data, {}), /changed/);
  assert.equal(counts.network, 0);
});

test("stale baseline hash, altered legacy amount and borrowed period fail before POST", async () => {
  const f = reinterpretationFixture();
  await assert.rejects(candidateFor([f.old], 1, { baseline: { rows: [f.old], id: 1, version: 2, sha256: "0".repeat(64) } }), /baseline/);
  const changed = structuredClone(f.old); changed.data.products[0].sales_amount++;
  await assert.rejects(candidateFor([changed]), /baseline/);
  changed.period_end = "2026-08-22";
  await assert.rejects(candidateFor([changed]), /baseline/);
});

test("unknown POST reads exact record once; never replays the POST", async () => {
  const p = await candidateFor([reinterpretationFixture().old]);
  for (const bad of [false, true]) {
    let posts = 0, gets = 0;
    const ports = { url: "https://test.invalid", headers: {}, fetch: async (_url, init) => {
      if (init.method === "POST") { posts++; throw new Error("lost after commit"); }
      gets++;
      const row = { ...p.p_candidate, id: 2, captured_at: "2026-01-02T00:00:00Z" };
      if (bad) row.raw = { ...row.raw, parser_version: 4 };
      return Response.json([row]);
    } };
    if (bad) await assert.rejects(persistReinterpretation(p, ports), /UNKNOWN/);
    else assert.equal((await persistReinterpretation(p, ports)).status, "confirmed");
    assert.equal(posts, 1); assert.equal(gets, 1);
  }
});

test("forward restore preserves old data without borrowing its quantity receipt", async () => {
  const f = reinterpretationFixture(), p = await candidateFor([f.old]);
  const adopted = { ...p.p_candidate, id: 2, captured_at: "2026-01-02T00:00:00Z" };
  const restored = restorePayload({ rows: [f.old, adopted], id: 2, version: 3, sha256: rowHash(adopted) }, 1, 4,
    "00000000-0000-4000-8000-000000000002");
  assert.deepEqual(restored.p_candidate.data, f.old.data);
  assert.equal(restored.p_candidate.raw.quantity_capture, undefined);
  assert.equal(restored.p_candidate.raw.parser_version, 4);
  assert.equal(restored.p_candidate.raw.reinterpretation.restore_id, 1);
});

test("recovery entry point is GET only; missing record stays unknown", async () => {
  const p = await candidateFor([reinterpretationFixture().old]);
  let calls = 0;
  await assert.rejects(readBackReinterpretation(p, { url: "https://test.invalid", headers: {}, fetch: async (_url, init) => {
    calls++; assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); return Response.json([]);
  } }), /UNKNOWN/);
  assert.equal(calls, 1);
});
