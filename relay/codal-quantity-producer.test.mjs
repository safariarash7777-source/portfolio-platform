// Actual producer/parser/insert code, archived bytes, synthetic transport only.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { foladQuantityFixture, loadOfflineCodal } from "./fixtures/codal-offline.mjs";

function fixture({ responseUrl, bytes, textOnly = false, failFirstBody = false } = {}) {
  const archived = foladQuantityFixture();
  const announcement = { l18: "فولاد", link: "https://codal.ir/Reports/quantity-offline-test",
    link_excel: archived.origin.sourceId, date_title: "1405/06/31", title: "گزارش فعالیت ماهانه دوره ۱ ماهه" };
  const calls = { requests: [], writes: [], bytes: 0, text: 0 };
  const { parser, counts } = loadOfflineCodal({
    environment: { SUPABASE_URL: "https://quantity-store.invalid", SUPABASE_SERVICE_ROLE_KEY: "dummy-quantity-test-only" },
    fetchFixture: async (url, options) => {
      calls.requests.push({ url, method: options.method ?? "GET" });
      if (url === announcement.link_excel) {
        assert.equal(options.headers.Accept, "*/*");assert.ok(options.signal instanceof AbortSignal);
        const response = new Response(bytes ?? archived.bytes);
        Object.defineProperty(response, "url", { value: responseUrl ?? announcement.link_excel });
        const arrayBuffer = response.arrayBuffer.bind(response), text = response.text.bind(response);
        response.arrayBuffer = () => {
          calls.bytes++;assert.equal(textOnly, false, "N10 must keep its old text path");
          return failFirstBody && calls.bytes === 1 ? Promise.reject(new Error("synthetic-body-failure")) : arrayBuffer();
        };
        response.text = () => { calls.text++;return text(); };
        return response;
      }
      if (url === "https://quantity-store.invalid/rest/v1/codal_reports?on_conflict=source_url&select=source_url") {
        assert.equal(options.method, "POST");
        const rows = JSON.parse(options.body);assert.equal(rows.length, 1);calls.writes.push(rows[0]);
        return Response.json([{ source_url: rows[0].source_url }]);
      }
      throw new Error("Unexpected offline fixture request");
    },
  });
  return { parser, counts, calls, announcement, archived };
}

test("N30 producer hashes actual response bytes and carries their receipt into the existing insert payload", async () => {
  const f = fixture(), stages = [];
  const data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰", (...args) => stages.push(args));
  assert.deepEqual(stages, [[]], "Diagnostics receive no HTML or parsed data");
  assert.equal(f.calls.bytes, 1);assert.equal(f.calls.text, 0);assert.equal(f.calls.requests.length, 1);
  assert.equal(data.quantity_source.htmlSha256, f.archived.origin.htmlSha256);
  assert.equal(data.quantity_source.sourceId, f.announcement.link_excel);
  assert.equal(data.products[0].sales_qty, 138);assert.equal(data.products[0].sales_rate, 1084861500000);
  assert.equal(data.period_total_amount, 639418160);assert.equal(data.fy_cumulative_amount, 2509422184);
  assert.equal(await f.parser.insertParsedReport(f.announcement, "ن-۳۰", data), 1);
  const row = f.calls.writes[0], capture = row.raw.quantity_capture;
  assert.deepEqual(capture, { version: 1, symbol: "فولاد", report_kind: "ن-۳۰",
    announcement_link: f.announcement.link, source_url: `${f.announcement.link}#pv2`,
    link_excel: f.announcement.link_excel, response_url: f.announcement.link_excel,
    period_end_jalali: "1405-06-31", parser_version: 2, html_sha256: f.archived.origin.htmlSha256,
    source: data.quantity_source });
  assert.deepEqual(row.data, data);assert.equal(row.raw.parser_version, 2);
  assert.equal(row.raw.link_excel, f.announcement.link_excel);
  assert.equal("id" in row, false, "A database row ID cannot be invented before insertion");
  assert.ok(!JSON.stringify(row).includes("htmlBytes"));assert.equal(f.counts.network, 0);
});

test("a UTF8 BOM is retained in the byte hash while decoded table values match the original text behavior", async () => {
  const raw = foladQuantityFixture().bytes, bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw]);
  const f = fixture({ bytes }), data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰");
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(data.quantity_source.htmlSha256, hash);assert.notEqual(hash, f.archived.origin.htmlSha256);
  assert.equal(data.products[0].sales_qty, 138);assert.equal(data.period_total_amount, 639418160);
});

test("a redirected, absent or different response reference cannot create a new quantity witness", async () => {
  for (const responseUrl of ["", "https://untrusted.invalid/source", "https://excel.codal.ir/another-report", "http://excel.codal.ir/another-report"]) {
    const f = fixture({ responseUrl }), data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰");
    assert.equal(data.quantity_source, null);assert.equal(data.products[0].sales_qty, 138);
    assert.ok(data.products.every(p => p.quantity_witness === undefined));
    await f.parser.insertParsedReport(f.announcement, "ن-۳۰", data);
    assert.equal(f.calls.writes[0].raw.quantity_capture, undefined);
    assert.equal(f.counts.network, 0);
  }
});

test("announcement claims cannot replace the response bytes or the source document's monthly period", async () => {
  const f = fixture();
  const a = { ...f.announcement, date_title: "1405/05/31", quantity_source: { htmlSha256: "0".repeat(64) } };
  const data = await f.parser.downloadAndParse(a, "ن-۳۰");
  assert.equal(data.quantity_source, null);
  await f.parser.insertParsedReport(a, "ن-۳۰", data);
  assert.equal(f.calls.writes[0].raw.quantity_capture, undefined);
  assert.equal(f.calls.writes[0].raw.parser_version, 2);
});

test("quantity proof requires the existing official download route while legacy parsing still preserves money", async () => {
  for (const sourceRef of ["https://excel.codal.ir/not-a-download", "https://excel.codal.ir/service/Excel/GetAll/test/1",
    "http://excel.codal.ir/service/Excel/GetAll/test/0", "https://elsewhere.invalid/service/Excel/GetAll/test/0",
    "https://excel.codal.ir/service/Excel/GetAll/test/0#fragment"]) {
    const f = fixture();f.announcement.link_excel = sourceRef;
    const data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰");
    assert.equal(data.quantity_source, null);assert.equal(data.period_total_amount, 639418160);
    assert.equal(data.products[0].sales_qty, 138);assert.equal(f.calls.requests.length, 1);
  }
});

test("a failed body read follows the existing retry path and cannot create a partial capture", async () => {
  const f = fixture({ failFirstBody: true }), stages = [];
  const data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰", (...args) => stages.push(args));
  assert.equal(f.calls.requests.length, 2);assert.equal(f.calls.bytes, 2);assert.deepEqual(stages, [[]]);
  assert.ok(f.calls.requests.every(call => call.url === f.announcement.link_excel && call.method === "GET"));
  assert.equal(data.quantity_source.htmlSha256, f.archived.origin.htmlSha256);
  await f.parser.insertParsedReport(f.announcement, "ن-۳۰", data);
  assert.equal(f.calls.writes[0].raw.quantity_capture.html_sha256, f.archived.origin.htmlSha256);
  assert.equal(f.counts.network, 0);
});

test("copied, directly parsed or modified data cannot mint a capture receipt", async () => {
  const mutations = [
    ["copy", d => structuredClone(d)],
    ["quantity", d => { d.products[0].sales_qty++;return d; }],
    ["rate", d => { d.products[0].sales_rate++;return d; }],
    ["hash", d => { d.quantity_source.htmlSha256 = "0".repeat(64);return d; }],
    ["source rows", d => { d.quantity_source.rows[0].salesQty++;return d; }],
    ["money", d => { d.period_total_amount++;return d; }],
  ];
  for (const [name, mutate] of mutations) {
    const f = fixture(), data = mutate(await f.parser.downloadAndParse(f.announcement, "ن-۳۰"));
    await f.parser.insertParsedReport(f.announcement, "ن-۳۰", data);
    assert.equal(f.calls.writes[0].raw.quantity_capture, undefined, name);
  }
  const f = fixture();
  await f.parser.insertParsedReport(f.announcement, "ن-۳۰", f.archived.report);
  assert.equal(f.calls.writes[0].raw.quantity_capture, undefined, "A pure parser call is not a response capture");
});

test("an intact parsed object cannot donate its receipt to another announcement, period, symbol or kind", async () => {
  for (const [overrides, kind] of [
    [{ link: "https://codal.ir/Reports/another-offline-test" }, "ن-۳۰"],
    [{ link_excel: "https://excel.codal.ir/another-offline-test" }, "ن-۳۰"],
    [{ date_title: "1405/05/31" }, "ن-۳۰"], [{ l18: "دیگر" }, "ن-۳۰"], [{}, "ن-۱۰"],
  ]) {
    const f = fixture(), data = await f.parser.downloadAndParse(f.announcement, "ن-۳۰");
    await f.parser.insertParsedReport({ ...f.announcement, ...overrides }, kind, data);
    assert.equal(f.calls.writes[0].raw.quantity_capture, undefined);
  }
});

test("N10 keeps the original text decoder, admission path and payload without monthly capture metadata", async () => {
  const f = fixture({ textOnly: true }), stages = [];
  // The archived monthly table is not a valid N10; its old admission remains null.
  const data = await f.parser.downloadAndParse(f.announcement, "ن-۱۰", (...args) => stages.push(args));
  assert.equal(data, null);assert.deepEqual(stages, [[]]);assert.equal(f.calls.text, 1);assert.equal(f.calls.bytes, 0);
  await f.parser.insertParsedReport(f.announcement, "ن-۱۰", { unit: null });
  assert.equal(f.calls.writes[0].raw.quantity_capture, undefined);assert.equal(f.counts.network, 0);
});
