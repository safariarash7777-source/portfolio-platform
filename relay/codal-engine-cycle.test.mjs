// Deterministic integration mocks only: every unmatched fetch fails closed.
import test from "node:test";
import assert from "node:assert/strict";
import { industrial, bank } from "./fixtures/n10-admission-fixtures.mjs";
import { admissionCounts, admissionEvent, ADMISSION_OBSERVATION_BYTES } from "./codal-admission-diagnostics.mjs";

process.env.BRSAPI_KEY = "mock-key";
process.env.BRSAPI_BASE = "https://provider.invalid";
process.env.SUPABASE_URL = "https://storage.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-service-role";
process.env.CODAL_FEED_PAGES = "6";
process.env.CODAL_FEED_DL = "10";
const codal = await import("./codal.mjs");
const originalFetch = globalThis.fetch;
let scenario = 0;
const countersOnly = ({ version, totals, lastCycle }) => ({ version, totals, lastCycle });

const announcement = (n, extra = {}) => ({
  l18: "نمونه", title: "اطلاعیه", link: `https://announcement.invalid/${n}`,
  date_send: "1405/07/01",
  time_send: `00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
  ...extra,
});
const boundary = announcement(0);
const watermark = { key: 14050701000000, links: [boundary.link] };
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const financial = n => announcement(n, { code: "ن-۱۰", link_excel: `https://excel.invalid/${n}`, date_title: "1404/12/29" });
const mockIncomeHtml = industrial({ period: "1404/12/29", months: 12, prior: false });

async function fixture(options = {}) {
  let persisted = structuredClone(options.initialState ?? { watermark, backfillCursor: 0, fails: {} });
  const calls = { pages: [], coverageReads: [], feedWrites: [], reportWrites: [], saves: [], excel: [], existingFilters: [], confirmations: [], archiveSaves: [] };
  const reports = new Map((options.initialReports ?? []).map(r => [r.source_url, r]));
  let rejectFeed = !!options.rejectFeed;
  let rejectSave = !!options.rejectSave;
  codal.setCodalBudgetPorts({ client: { request: async (job) => {
    calls.pages.push(Number(job.params.page));
    if (options.backfillPages && job.params.l18) {
      return { announcement: job.params.category === "1" ? options.backfillPages : [] };
    }
    return options.providerBody ?? { announcement: options.pages?.[Number(job.params.page) - 1] ?? [] };
  } } });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "excel.invalid") {
      calls.excel.push(url.pathname);
      if (options.excelError) throw new Error(options.excelError);
      return new Response(options.excelHtml ?? mockIncomeHtml);
    }
    assert.equal(url.hostname, "storage.invalid", `Unmocked network request: ${url.hostname}`);
    if (url.pathname.endsWith("/codal_feed") && init.method === "POST") {
      const rows = JSON.parse(init.body);
      calls.feedWrites.push({ rows, prefer: init.headers.Prefer });
      if (rejectFeed) return response({ error: "mock failure" }, 503);
      return response(options.feedBody ?? rows);
    }
    if (url.pathname.endsWith("/codal_reports") && init.method === "POST") {
      const rows = JSON.parse(init.body);
      calls.reportWrites.push(rows);
      if (options.reportStatus) return response({ error: options.reportError ?? "mock report failure" }, options.reportStatus);
      const inserted = rows.filter(r => !reports.has(r.source_url));
      for (const r of inserted) reports.set(r.source_url, r);
      return response(options.reportBody ?? inserted);
    }
    if (url.pathname.endsWith("/codal_reports") && !init.method) {
      if (url.searchParams.get("select") === "id,symbol") {
        calls.coverageReads.push(url.searchParams.get("id"));
        if (options.failCoverageAfter === calls.coverageReads.length) return response({}, 503);
        const before = Number(url.searchParams.get("id")?.slice(3) ?? Infinity);
        return response((options.coverageRows ?? []).filter(r => r.id < before).slice(0, 500));
      }
      const dataFilter = url.searchParams.get("data");
      const stored = [...reports.values()].filter(r => dataFilter !== "not.is.null" || r.data != null);
      if (url.searchParams.has("source_url")) {
        const identity = { source_url: url.searchParams.get("source_url"), symbol: url.searchParams.get("symbol"), data: dataFilter };
        calls.confirmations.push(identity);
        const matching = stored.filter(r => identity.source_url === `eq.${r.source_url}` && identity.symbol === `eq.${r.symbol}`);
        return response(matching.map(r => ({ source_url: r.source_url, symbol: r.symbol, data: r.data })));
      }
      if (url.searchParams.get("select") === "symbol") return response(stored.map(r => ({ symbol: r.symbol })));
      calls.existingFilters.push(dataFilter);
      return response(options.existingBody ?? stored.map(r => ({ source_url: r.source_url })));
    }
    if (url.pathname.endsWith("/ir_market_snapshots") && init.method === "POST") {
      const row = JSON.parse(init.body)[0];
      if (row.key === "codal_archive_state") {
        calls.archiveSaves.push(row.payload);
        return response(null);
      }
      calls.saves.push(row.payload);
      if (rejectSave) return response({ error: "mock state failure" }, 503);
      persisted = structuredClone(calls.saves.at(-1));
      return response(null);
    }
    if (url.pathname.endsWith("/ir_market_snapshots") && url.searchParams.get("key") === "eq.codal_engine_state") {
      return response(options.stateBody ?? [{ payload: persisted }]);
    }
    if (url.pathname.endsWith("/ir_market_snapshots") && url.searchParams.get("key") === "eq.codal_archive_state") {
      return response(options.archiveStateBody ?? []);
    }
    if (url.pathname.endsWith("/ir_market_snapshots") && url.searchParams.get("key") === "eq.latest") {
      return response(options.marketBody ?? [], options.marketStatus ?? 200);
    }
    throw new Error(`Unmocked storage request: ${url.pathname}`);
  };
  const engine = await import(`./codal-engine.mjs?mock=${++scenario}`);
  return {
    engine, calls, get persisted() { return persisted; },
    allowFeed: () => { rejectFeed = false; }, allowSave: () => { rejectSave = false; },
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  codal.setCodalBudgetPorts(null);
});

test("503 feed write keeps the watermark and retries the same announcement", async () => {
  const fresh = announcement(1);
  const f = await fixture({ pages: [[fresh, boundary], []], rejectFeed: true });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.match(f.engine.engineStatus.lastError, /503/);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.engine.engineStatus.feedTable.inserted, 0);
  f.allowFeed();
  await f.engine.runEngineCycle();
  assert.equal(f.calls.feedWrites.length, 2);
  assert.equal(f.calls.feedWrites[1].rows[0].link, fresh.link);
  assert.equal(f.engine.engineStatus.ok, true);
  assert.equal(f.engine.engineStatus.lastError, null);
});

test("140 fresh rows cannot acknowledge a gap after the six-page cap", async () => {
  const all = Array.from({ length: 140 }, (_, i) => announcement(140 - i));
  const pages = Array.from({ length: 7 }, (_, i) => all.slice(i * 20, (i + 1) * 20));
  const f = await fixture({ pages });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.pages.length, 6);
  assert.equal(f.calls.feedWrites[0].rows.length, 120);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.engine.engineStatus.feed.complete, false);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, "page_limit");
  assert.equal(f.engine.engineStatus.ok, false);
  await f.engine.runEngineCycle();
  assert.equal(f.calls.pages.length, 12, "same cap on the next cycle");
  assert.deepEqual(f.persisted.watermark, watermark);
});

test("publication date is independent of financial period and no time column is invented", async () => {
  const fresh = announcement(1, { date_title: "1404/12/29", date_publish: "1405/07/02", time_publish: "09:15:00" });
  const f = await fixture({ pages: [[fresh, boundary], []] });
  await f.engine.runEngineCycle();
  const row = f.calls.feedWrites[0].rows[0];
  assert.equal(row.publish_date, fresh.date_publish);
  assert.equal("publish_time" in row, false);
  assert.equal(f.engine.engineStatus.feedTable.publishTimeStored, false);
});

test("absent publication date stays null instead of using date_title", async () => {
  const f = await fixture({ pages: [[announcement(1, { date_title: "1404/12/29" }), boundary], []] });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.feedWrites[0].rows[0].publish_date, null);
});

test("ignore-duplicates counts returned rows rather than submitted rows", async () => {
  const f = await fixture({ pages: [[announcement(2), announcement(1), boundary], []], feedBody: [] });
  await f.engine.runEngineCycle();
  assert.match(f.calls.feedWrites[0].prefer, /return=representation/);
  assert.equal(f.engine.engineStatus.feedTable.attempted, 2);
  assert.equal(f.engine.engineStatus.feedTable.inserted, 0);
  assert.equal(f.engine.engineStatus.feedTable.duplicates, 2);
  assert.equal(f.engine.engineStatus.ok, true);
});

test("invalid feed insert response fails without advancing watermark", async () => {
  const f = await fixture({ pages: [[announcement(1), boundary], []], feedBody: { error: "invalid schema" } });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.engine.engineStatus.feedTable.inserted, 0);
});

test("invalid announcement schema rejects while a legitimate empty page is accepted", async () => {
  const f = await fixture({ providerBody: { announcement: [] } });
  assert.deepEqual(await codal.fetchAnnouncementsPage(), []);
  for (const body of [{}, { announcement: {} }, { announcement: [null] }]) {
    codal.setCodalBudgetPorts({ client: { request: async () => body } });
    await assert.rejects(codal.fetchAnnouncementsPage(), /schema/i);
  }
  assert.equal(f.calls.feedWrites.length, 0);
});

test("same-time known link cannot hide a new link later in the group", async () => {
  const fresh = { ...boundary, link: "https://announcement.invalid/same-time-new" };
  const older = { ...boundary, date_send: "1405/06/31", link: "https://announcement.invalid/older" };
  const f = await fixture({ pages: [[boundary, fresh, older]] });
  await f.engine.runEngineCycle();
  assert.deepEqual(f.calls.feedWrites[0].rows.map(r => r.link), [fresh.link]);
  assert.deepEqual(new Set(f.persisted.watermark.links), new Set([boundary.link, fresh.link]));
});

test("unorderable or unsorted announcements fail without acknowledging them", async () => {
  for (const items of [[announcement(1, { date_send: "invalid" })], [announcement(1), announcement(2)]]) {
    const f = await fixture({ pages: [items] });
    await f.engine.runEngineCycle();
    assert.equal(f.engine.engineStatus.ok, false);
    assert.deepEqual(f.persisted.watermark, watermark);
  }
});

test("state save failure rolls back the in-memory acknowledgement for retry", async () => {
  const f = await fixture({ pages: [[announcement(1), boundary], []], rejectSave: true });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.match(f.engine.engineStatus.lastError, /state save.*503/);
  assert.deepEqual(f.persisted.watermark, watermark);
  f.allowSave();
  await f.engine.runEngineCycle();
  assert.equal(f.calls.feedWrites.length, 2);
  assert.equal(f.engine.engineStatus.ok, true);
});

test("parsed-report insert returns its actual insert count and keeps raw publication provenance", async () => {
  const a = announcement(1, { date_title: "1404/12/29", date_publish: "1405/07/02", time_publish: "09:15:00" });
  const f = await fixture({ reportBody: [] });
  assert.equal(await codal.insertParsedReport(a, "ن-۱۰", { unit: null }), 0);
  const row = f.calls.reportWrites[0][0];
  assert.equal(row.raw.date_publish, a.date_publish);
  assert.equal(row.raw.time_publish, a.time_publish);
  assert.equal(row.raw.period_end_jalali, "1404-12-29");
});

test("report download cap keeps retryable work behind the watermark", async () => {
  const items = Array.from({ length: 11 }, (_, i) => financial(11 - i));
  const f = await fixture({ pages: [[...items, boundary], []] });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 10);
  assert.equal(f.engine.engineStatus.feed.inserted, 10);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, "download_limit");
  assert.equal(f.engine.engineStatus.ok, false);
  assert.deepEqual(f.persisted.watermark, watermark);
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 11);
  assert.equal(f.engine.engineStatus.feed.inserted, 1);
  assert.equal(f.engine.engineStatus.ok, true);
  assert.equal(f.persisted.watermark.key, 14050701000011);
});

test("parse or report-write failures remain unhealthy and unacknowledged", async () => {
  for (const options of [{ excelHtml: "<table></table>" }, { reportStatus: 503 }]) {
    const f = await fixture({ pages: [[financial(1), boundary], []], ...options });
    await f.engine.runEngineCycle();
    assert.equal(f.engine.engineStatus.feed.inserted, 0);
    assert.equal(f.engine.engineStatus.feed.parseFailed, 1);
    assert.equal(f.engine.engineStatus.ok, false);
    assert.deepEqual(f.persisted.watermark, watermark);
  }
});

test("invalid persisted state stops before provider or writes", async () => {
  const f = await fixture({ stateBody: { error: "invalid schema" } });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.match(f.engine.engineStatus.lastError, /state load.*schema/);
  assert.equal(f.calls.pages.length, 0);
  assert.equal(f.calls.saves.length, 0);
});

test("market snapshot failure is not reported as a healthy empty queue", async () => {
  const f = await fixture({ pages: [[]], marketStatus: 503 });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.match(f.engine.engineStatus.lastError, /snapshot.*503/);
});

test("invalid announcement schema leaves the cycle unhealthy without retrying schema errors", async () => {
  const f = await fixture({ providerBody: {} });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.calls.pages.length, 1);
});

test("stored report overrides an old blocked ledger without downloading again", async () => {
  const a = financial(1);
  const f = await fixture({
    pages: [[a, boundary], []],
    initialState: { watermark, backfillCursor: 0, fails: { [a.link]: 3 } },
    initialReports: [{ symbol: a.l18, source_url: `${a.link}#pv2`, data: { standalone: { revenue: 100, net_profit: 20 } } }],
  });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, true);
  assert.equal(f.engine.engineStatus.feed.complete, true);
  assert.equal(f.engine.engineStatus.feed.inserted, 0);
  assert.equal(f.persisted.watermark.key, 14050701000001);
  assert.equal(f.persisted.fails[a.link], undefined);
  assert.deepEqual(f.calls.existingFilters, ["not.is.null"]);
  assert.equal(f.calls.excel.length, 0);
  assert.equal(f.calls.reportWrites.length, 0);
  assert.equal(f.calls.pages.length, 2);
});

test("metadata-only report cannot release a blocked ledger or advance watermark", async () => {
  const a = financial(1);
  const f = await fixture({
    pages: [[a, boundary], []],
    initialState: { watermark, backfillCursor: 0, fails: { [a.link]: 3 } },
    initialReports: [{ symbol: a.l18, source_url: `${a.link}#pv2`, data: null }],
  });
  await f.engine.runEngineCycle();
  assert.deepEqual(f.calls.existingFilters, ["not.is.null"]);
  assert.equal(f.engine.engineStatus.ok, false);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, "blocked_report");
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.persisted.fails[a.link], 3);
  assert.equal(f.calls.excel.length, 0);
});

test("archive duplicate response counts zero actual inserts", async () => {
  const a = financial(1);
  const f = await fixture({
    pages: [[a], []],
    marketBody: [{ payload: { stocks: [{ id: a.l18, value: 100 }] } }],
    // Simulate a stale dedup read followed by the DB ignoring an existing URL.
    existingBody: [],
    initialReports: [{ symbol: a.l18, source_url: `${a.link}#pv2`, data: { standalone: { revenue: 100, net_profit: 20 } } }],
  });
  codal.setCodalBudgetPorts({ client: { request: async job => {
    f.calls.pages.push(Number(job.params.page));
    return { announcement: job.params.category === "1" && job.params.page === "1" ? [a] : [] };
  } } });
  const archive = await import(`./codal-archive.mjs?mock=${++scenario}`);
  await archive.runArchiveCycle();
  assert.equal(archive.archiveStatus.lastCycle.downloaded, 1);
  assert.equal(archive.archiveStatus.lastCycle.inserted, 0);
  assert.equal(archive.archiveStatus.lastCycle.parseFailed, 0);
  assert.equal(archive.archiveStatus.lastError, null);
  assert.equal(f.calls.reportWrites.length, 1);
  assert.equal(f.calls.archiveSaves.length, 1);
});

async function collisionFixture(route, fails, data) {
  const a = financial(1);
  const f = await fixture({
    pages: [[a, boundary], []],
    initialState: { watermark, backfillCursor: 0, fails: { [a.link]: fails } },
    archiveStateBody: [{ payload: { cursor: 0, budget: { date: null, used: 0 }, perSymbol: {}, fails: { [a.link]: fails } } }],
    marketBody: route === "archive" ? [{ payload: { stocks: [{ id: a.l18, value: 100 }] } }] : [],
    // Force the zero-return branch, including a stale read of a valid stored row.
    existingBody: [],
    initialReports: [{ symbol: a.l18, source_url: `${a.link}#pv2`, data }],
  });
  let archive;
  if (route === "archive") {
    codal.setCodalBudgetPorts({ client: { request: async job => {
      f.calls.pages.push(Number(job.params.page));
      return { announcement: job.params.category === "1" && job.params.page === "1" ? [a] : [] };
    } } });
    archive = await import(`./codal-archive.mjs?mock=${++scenario}`);
    await archive.runArchiveCycle();
  } else {
    await f.engine.runEngineCycle();
  }
  return { a, f, archive };
}

test("null collision is never acknowledged for fails 0/1/2", async t => {
  for (const route of ["engine", "archive"]) {
    for (const fails of [0, 1, 2]) {
      await t.test(`${route}, fails=${fails}`, async () => {
        const { a, f, archive } = await collisionFixture(route, fails, null);
        if (archive) {
          assert.equal(archive.archiveStatus.ok, false);
          assert.equal(archive.archiveStatus.lastCycle.inserted, 0);
          assert.equal(archive.archiveStatus.lastCycle.parseFailed, 1);
          assert.equal(archive.archiveStatus.lastCycle.persistenceUnconfirmed, 1);
          assert.equal(f.calls.archiveSaves.at(-1).fails[a.link], fails + 1);
        } else {
          assert.equal(f.engine.engineStatus.ok, false);
          assert.equal(f.engine.engineStatus.feed.complete, false);
          assert.equal(f.engine.engineStatus.feed.inserted, 0);
          assert.deepEqual(f.persisted.watermark, watermark);
          assert.equal(f.persisted.fails[a.link], fails + 1);
        }
        assert.deepEqual(f.calls.confirmations, [{ source_url: `eq.${a.link}#pv2`, symbol: `eq.${a.l18}`, data: "not.is.null" }]);
        assert.equal(f.calls.reportWrites.length, 1);
      });
    }
  }
});

test("valid collision acknowledges persistence with inserted zero for fails 0/1/2", async t => {
  for (const route of ["engine", "archive"]) {
    for (const fails of [0, 1, 2]) {
      await t.test(`${route}, fails=${fails}`, async () => {
        const { a, f, archive } = await collisionFixture(route, fails, { standalone: { revenue: 100, net_profit: 20 } });
        if (archive) {
          assert.equal(archive.archiveStatus.ok, true);
          assert.equal(archive.archiveStatus.lastCycle.inserted, 0);
          assert.equal(archive.archiveStatus.lastCycle.parseFailed, 0);
          assert.equal(archive.archiveStatus.lastCycle.persistenceUnconfirmed, 0);
          assert.equal(f.calls.archiveSaves.at(-1).fails[a.link], undefined);
        } else {
          assert.equal(f.engine.engineStatus.ok, true);
          assert.equal(f.engine.engineStatus.feed.complete, true);
          assert.equal(f.engine.engineStatus.feed.inserted, 0);
          assert.equal(f.persisted.watermark.key, 14050701000001);
          assert.equal(f.persisted.fails[a.link], undefined);
        }
        assert.deepEqual(f.calls.confirmations, [{ source_url: `eq.${a.link}#pv2`, symbol: `eq.${a.l18}`, data: "not.is.null" }]);
        assert.equal(f.calls.reportWrites.length, 1);
      });
    }
  }
});

test("N10 admission rejection keeps inserted zero, watermark and ledger", async t => {
  const common = { period: "1404/12/29", months: 12, prior: false };
  for (const [name, options, announcementFields] of [
    ["unknown unit", { unit: "" }], ["unknown scope", { scope: "" }],
    ["consolidated", { scope: "تلفیقی" }], ["blank operating", { current: [100, "(60)", 40, "", 20] }],
    ["missing capital", { capital: false }],
    ["bank current EPS zero pv2 blocker", { html: bank({ eps: 0 }) },
      { date_title: "1404/03/31", title: "صورت های مالی دوره 3 ماهه منتهی به 1404/03/31" }],
  ]) {
    await t.test(name, async () => {
      const a = { ...financial(1), ...announcementFields };
      const f = await fixture({ pages: [[a, boundary], []], excelHtml: options.html ?? industrial({ ...common, ...options }),
        initialState: { watermark, backfillCursor: 0, fails: { [a.link]: 1 } } });
      await f.engine.runEngineCycle();
      assert.equal(f.engine.engineStatus.ok, false);
      assert.equal(f.engine.engineStatus.feed.inserted, 0);
      assert.equal(f.engine.engineStatus.feed.parseFailed, 1);
      assert.deepEqual(f.persisted.watermark, watermark);
      assert.equal(f.persisted.fails[a.link], 2);
      assert.equal(f.calls.reportWrites.length, 0);
    });
  }
});

test("prospective N10 rejection preserves full paginated coverage without scheduling redundant backfill", async () => {
  const a = financial(1);
  const coverageRows = Array.from({ length: 1008 }, (_, n) => ({ id: 1008 - n, symbol: n < 1000 ? "الف" : "ب" }));
  const f = await fixture({ pages: [[a, boundary], []],
    excelHtml: industrial({ period: "1404/12/29", months: 12, prior: false, unit: "" }),
    marketBody: [{ payload: { stocks: [{ id: "الف", value: 2 }, { id: "ب", value: 1 }] } }],
    coverageRows,
  });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.feed.parseFailed, 1);
  assert.equal(f.calls.reportWrites.length, 0);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.persisted.fails[a.link], 1);
  assert.deepEqual(f.calls.coverageReads, [null, "lt.509", "lt.9", "lt.1"]);
  assert.equal(f.engine.engineStatus.backfill.skippedCovered, 2);
  assert.deepEqual(f.engine.engineStatus.backfill.symbols, []);
  assert.deepEqual(f.calls.pages, [1, 2]);
});

test("a failed later coverage page stops backfill requests rather than using partial counts", async () => {
  const coverageRows = Array.from({ length: 508 }, (_, n) => ({ id: 508 - n, symbol: n < 500 ? "الف" : "ب" }));
  const f = await fixture({ pages: [[]], failCoverageAfter: 2, coverageRows,
    marketBody: [{ payload: { stocks: [{ id: "الف", value: 2 }, { id: "ب", value: 1 }] } }],
  });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.match(f.engine.engineStatus.lastError, /covered reports HTTP 503/);
  assert.deepEqual(f.engine.engineStatus.backfill.symbols, []);
  assert.deepEqual(f.calls.pages, [1]);
});

const zeroFailureCounts = () => ({ download: { exception: 0 }, admission: { rejected: 0, exception: 0 }, persistence: { exception: 0 } });

test("content-free diagnostics distinguish report failure stages in feed and backfill without changing attempts", async t => {
  for (const route of ["feed", "backfill"]) {
    for (const [stage, reason, options, downloads, writes] of [
      ["download", "exception", { excelError: "SYNTHETIC_SECRET https://private.invalid/?token=mock" }, 3, 0],
      ["admission", "rejected", { excelHtml: "<html>unsupported synthetic layout</html>" }, 1, 0],
      ["persistence", "exception", { reportStatus: 503, reportError: "SYNTHETIC_SECRET private report body" }, 1, 1],
    ]) {
      await t.test(`${route}: ${stage}/${reason}`, async () => {
        const a = financial(1);
        const logged = [];
        const log = t.mock.method(console, "error", (...args) => logged.push(args.join(" ")));
        const f = await fixture({ ...options,
          pages: route === "feed" ? [[a, boundary], []] : [[]],
          ...(route === "backfill" ? { backfillPages: [a], marketBody: [{ payload: { stocks: [{ id: a.l18, value: 1 }] } }] } : {}),
        });
        try {
          await f.engine.runEngineCycle();
          const expected = zeroFailureCounts();
          expected[stage][reason] = 1;
          assert.deepEqual(f.persisted.failureDiagnostics, { version: 1, totals: expected, lastCycle: expected });
          assert.deepEqual(f.engine.engineStatus.failureDiagnostics, f.persisted.failureDiagnostics);
          const admission = admissionCounts();
          if (stage === "admission") admission["ن-۱۰"].scope_unsupported = 1;
          assert.deepEqual(countersOnly(f.persisted.admissionDiagnostics), { version: 1, totals: admission, lastCycle: admission });
          assert.equal(f.persisted.fails[a.link], 1, "one ledger attempt, including the existing three download tries");
          assert.equal(f.engine.engineStatus[route].parseFailed, 1);
          assert.equal(f.calls.excel.length, downloads);
          assert.equal(f.calls.reportWrites.length, writes);
          assert.equal(f.calls.saves.length, 1, "diagnostics reuse the existing state write");
          assert.doesNotMatch(JSON.stringify(f.persisted.failureDiagnostics), /SECRET|private|https|token|sample/i);
          assert.doesNotMatch(logged.join("\n"), /SYNTHETIC_SECRET|private\.invalid|private report body/);
        } finally { log.mock.restore(); }
      });
    }
  }
});

test("diagnostics survive persisted restart; legacy state upgrades and successful cycles reset only lastCycle", async () => {
  const a = financial(1);
  const first = await fixture({ pages: [[a, boundary], []], excelHtml: "unsupported" });
  await first.engine.runEngineCycle();
  const saved = JSON.parse(JSON.stringify(first.persisted));
  const restarted = await fixture({ pages: [[]], initialState: saved });
  await restarted.engine.runEngineCycle();
  assert.deepEqual(restarted.persisted.failureDiagnostics.totals, saved.failureDiagnostics.totals);
  assert.deepEqual(restarted.persisted.failureDiagnostics.lastCycle, zeroFailureCounts());
  assert.deepEqual(restarted.persisted.fails, saved.fails);
  assert.deepEqual(restarted.persisted.watermark, saved.watermark);
  assert.equal(restarted.calls.excel.length, 0);
  assert.equal(restarted.engine.engineStatus.ok, true);
  const legacy = await fixture({ pages: [[]], initialState: { watermark, backfillCursor: 7, fails: { [a.link]: 2 } } });
  await legacy.engine.runEngineCycle();
  assert.deepEqual(legacy.persisted.failureDiagnostics, { version: 1, totals: zeroFailureCounts(), lastCycle: zeroFailureCounts() });
  assert.equal(legacy.persisted.fails[a.link], 2);
  assert.equal(legacy.persisted.backfillCursor, 7);
});

test("untrusted diagnostic fields are discarded and counters saturate without blocking collection", async () => {
  const a = financial(1);
  const f = await fixture({ pages: [[a, boundary], []], excelHtml: "unsupported",
    initialState: { watermark, backfillCursor: 0, fails: {}, failureDiagnostics: {
      version: 1, secret: "SYNTHETIC_SECRET", totals: {
        download: { exception: -1, body: "SYNTHETIC_SECRET" },
        admission: { rejected: Number.MAX_SAFE_INTEGER, exception: "7" },
        persistence: { exception: 1.2 }, arbitrary: { raw: "SYNTHETIC_SECRET" },
      }, lastCycle: "SYNTHETIC_SECRET",
    } },
  });
  await f.engine.runEngineCycle();
  const expected = zeroFailureCounts();
  expected.admission.rejected = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(f.persisted.failureDiagnostics.totals, expected);
  assert.equal(f.persisted.failureDiagnostics.lastCycle.admission.rejected, 1);
  assert.equal(f.persisted.fails[a.link], 1);
  assert.doesNotMatch(JSON.stringify(f.persisted.failureDiagnostics), /SECRET|body|arbitrary|raw/);
  const unknownVersion = await fixture({ pages: [[]], initialState: { ...f.persisted, failureDiagnostics: { version: 2, totals: expected } } });
  await unknownVersion.engine.runEngineCycle();
  assert.deepEqual(unknownVersion.persisted.failureDiagnostics.totals, zeroFailureCounts());
});

test("reason diagnostics preserve retry/block, requests, ledger, state writes and watermark in feed and backfill", async t => {
  // Accelerate only the existing mock-only delays; no collector/runtime is started.
  const realTimeout = globalThis.setTimeout;
  const delay = t.mock.method(globalThis, "setTimeout", (fn, _ms, ...args) => realTimeout(fn, 0, ...args));
  const shortMonthly = '<table><tr><td>دوره یک ماهه</td></tr><tr><td>نام محصول</td></tr><tr><td>محصول</td><td>تن</td></tr></table>';
  try {
    for (const route of ["feed", "backfill"]) for (const [kind, reason, html] of [
      ["ن-۱۰", "scope_unknown", industrial({ period: "1404/12/29", months: 12, prior: false, scope: "" })],
      ["ن-۱۰", "unit_unverified", industrial({ period: "1404/12/29", months: 12, prior: false, unit: "" })],
      ["ن-۳۰", "short_rows", shortMonthly],
    ]) await t.test(`${route}: ${kind}/${reason}`, async () => {
      const a = { ...financial(1), code: kind };
      const f = await fixture({ excelHtml: html,
        pages: route === "feed" ? [[a, boundary], []] : [[]],
        ...(route === "backfill" ? { backfillPages: [a], marketBody: [{ payload: { stocks: [{ id: a.l18, value: 1 }] } }] } : {}),
      });
      const requestCount = route === "feed" ? 2 : 3;
      for (let attempt = 1; attempt <= 4; attempt++) {
        await f.engine.runEngineCycle();
        const rejected = Math.min(attempt, 3);
        const totals = admissionCounts(), lastCycle = admissionCounts();
        totals[kind][reason] = rejected;
        lastCycle[kind][reason] = attempt <= 3 ? 1 : 0;
        assert.deepEqual(countersOnly(f.persisted.admissionDiagnostics), { version: 1, totals, lastCycle });
        assert.deepEqual(f.engine.engineStatus.admissionDiagnostics, f.persisted.admissionDiagnostics);
        assert.equal(f.persisted.failureDiagnostics.totals.admission.rejected, rejected);
        assert.equal(f.calls.excel.length, rejected, "one existing download per rejected attempt; none after blocking");
        assert.equal(f.calls.pages.length, attempt * requestCount, "no extra provider page requests");
        assert.equal(f.calls.saves.length, attempt, "one existing state write per cycle");
        assert.equal(f.calls.reportWrites.length, 0);
        assert.equal(f.persisted.fails[a.link], rejected, "unchanged three-attempt blocking ledger");
        assert.deepEqual(f.persisted.watermark, watermark);
        assert.equal(f.engine.engineStatus[route].inserted, 0);
        assert.equal(f.engine.engineStatus[route].parseFailed, attempt <= 3 ? 1 : 0);
        assert.equal(f.persisted.backfillCursor, route === "feed" ? 0 : attempt);
        if (route === "feed") assert.equal(f.engine.engineStatus.feed.incompleteReason, attempt <= 3 ? "report_failure" : "blocked_report");
        assert.doesNotMatch(JSON.stringify(countersOnly(f.persisted.admissionDiagnostics)), /https|اطلاعیه|محصول|1404|scope.*html/i);
        assert.equal(f.persisted.admissionDiagnostics.observations.events.length, attempt <= 3 ? 1 : 0);
        assert.equal(f.persisted.admissionDiagnostics.observations.omittedCount, 0);
      }
      const saved = structuredClone(f.persisted);
      // A new module instance with persisted mock state, not a service restart.
      const restarted = await fixture({ pages: [[]], initialState: saved });
      await restarted.engine.runEngineCycle();
      assert.deepEqual(restarted.persisted.admissionDiagnostics.totals, saved.admissionDiagnostics.totals);
      assert.deepEqual(restarted.persisted.admissionDiagnostics.lastCycle, admissionCounts());
      assert.deepEqual(restarted.persisted.failureDiagnostics.totals, saved.failureDiagnostics.totals);
      assert.deepEqual(restarted.persisted.watermark, saved.watermark);
      assert.deepEqual(restarted.persisted.fails, saved.fails);
      assert.equal(restarted.calls.saves.length, 1);
      assert.equal(restarted.calls.excel.length, 0);
      assert.equal(restarted.calls.reportWrites.length, 0);
    });
  } finally { delay.mock.restore(); }
});

test("reason diagnostics whitelist persisted enums and safe bounded counters; legacy and unknown versions reset", async () => {
  const a = financial(1);
  const f = await fixture({ pages: [[a, boundary], []], excelHtml: "unsupported",
    initialState: { watermark, backfillCursor: 0, fails: {}, admissionDiagnostics: {
      version: 1, title: "SYNTHETIC_SECRET", totals: {
        "ن-۱۰": { scope_unsupported: Number.MAX_SAFE_INTEGER, context_invalid: -1, scope_unknown: "7", eps_unverified: 1.2,
          unit_unverified: Number.MAX_SAFE_INTEGER + 1, html: "SYNTHETIC_SECRET" },
        "ن-۳۰": { short_rows: 2, url: "https://private.invalid" }, secretKind: { message: "SYNTHETIC_SECRET" },
      }, lastCycle: { "ن-۱۰": { capital_unverified: 9 }, raw: "SYNTHETIC_SECRET" },
    } },
  });
  await f.engine.runEngineCycle();
  const totals = admissionCounts(), lastCycle = admissionCounts();
  totals["ن-۱۰"].scope_unsupported = Number.MAX_SAFE_INTEGER;
  totals["ن-۳۰"].short_rows = 2;
  lastCycle["ن-۱۰"].scope_unsupported = 1;
  assert.deepEqual(countersOnly(f.persisted.admissionDiagnostics), { version: 1, totals, lastCycle });
  assert.equal(f.persisted.fails[a.link], 1);
  assert.equal(f.calls.saves.length, 1);
  assert.doesNotMatch(JSON.stringify(f.persisted.admissionDiagnostics), /SECRET|html|url|title|message|private|raw|secretKind/);
  assert.deepEqual(admissionEvent({ kind: "ن-۱۰", reason: "scope_unknown", html: "SYNTHETIC_SECRET" }, "ن-۱۰"), { kind: "ن-۱۰", reason: "scope_unknown" });
  assert.equal(admissionEvent({ kind: "ن-۳۰", reason: "scope_unknown" }, "ن-۱۰"), null);
  assert.equal(admissionEvent({ kind: "ن-۱۰", reason: "SYNTHETIC_SECRET" }, "ن-۱۰"), null);
  for (const admissionDiagnostics of [undefined, { version: 2, totals }]) {
    const legacy = await fixture({ pages: [[]], initialState: { watermark, backfillCursor: 7, fails: { [a.link]: 2 }, admissionDiagnostics } });
    await legacy.engine.runEngineCycle();
    assert.deepEqual(countersOnly(legacy.persisted.admissionDiagnostics), { version: 1, totals: admissionCounts(), lastCycle: admissionCounts() });
    assert.equal(legacy.persisted.backfillCursor, 7);
    assert.equal(legacy.persisted.fails[a.link], 2);
    assert.deepEqual(legacy.persisted.watermark, watermark);
  }
});

test("observed equity title with در retains engine write identity and request limits", async t => {
  const common = { period: "1404/12/29", months: 12, prior: false };
  for (const [name, options, accepted] of [
    ["qualified local capital proof", common, true],
    ["unknown capital scope stays rejected", { ...common, capitalScope: "" }, false],
  ]) await t.test(name, async () => {
    const a = financial(1);
    const canonical = industrial(options);
    const html = canonical.replace("صورت تغییرات حقوق مالکانه", "صورت تغییرات در حقوق مالکانه");
    const f = await fixture({ pages: [[a, boundary], []], excelHtml: html });
    await f.engine.runEngineCycle();
    assert.equal(f.calls.pages.length, 2);
    assert.equal(f.calls.excel.length, 1);
    assert.equal(f.calls.saves.length, 1);
    assert.equal(f.engine.engineStatus.feed.inserted, accepted ? 1 : 0);
    assert.equal(f.engine.engineStatus.feed.parseFailed, accepted ? 0 : 1);
    assert.equal(f.engine.engineStatus.feed.complete, accepted);
    assert.equal(f.engine.engineStatus.ok, accepted);
    if (accepted) {
      assert.equal(f.calls.reportWrites.length, 1);
      assert.equal(f.persisted.fails[a.link], undefined);
      assert.equal(f.persisted.watermark.key, 14050701000001);
      const written = f.calls.reportWrites[0][0];
      assert.equal(written.source_url, `${a.link}#pv2`);
      assert.equal(written.symbol, a.l18);
      assert.deepEqual(written.data, codal.admitN10Html(canonical, {
        symbol: a.l18, company_name: a.name || a.l18, period_end: "1404-12-29", period_months: 12, audited: false,
      }));
      const qs = new URLSearchParams({ select: "source_url,symbol,data", source_url: `eq.${written.source_url}`, symbol: `eq.${a.l18}`, data: "not.is.null" });
      const stored = await (await globalThis.fetch(`https://storage.invalid/rest/v1/codal_reports?${qs}`)).json();
      assert.deepEqual(stored, [{ source_url: written.source_url, symbol: a.l18, data: written.data }]);
      assert.deepEqual(f.persisted.admissionDiagnostics.totals, admissionCounts());
    } else {
      assert.equal(f.calls.reportWrites.length, 0);
      assert.equal(f.persisted.fails[a.link], 1);
      assert.deepEqual(f.persisted.watermark, watermark);
      assert.equal(f.persisted.admissionDiagnostics.lastCycle["ن-۱۰"].capital_unverified, 1);
    }
  });
});

// All identifiers below are synthetic. Codal URLs are never fetched: only the
// existing mocked Excel/storage transports run, with unmatched fetch denied.
test("natural feed/backfill rejection is attributed once without adding requests or report writes", async t => {
  const realTimeout = globalThis.setTimeout;
  const delay = t.mock.method(globalThis, "setTimeout", (fn, _ms, ...args) => realTimeout(fn, 0, ...args));
  const id = Buffer.from("synthetic-announcement-metadata").toString("base64");
  try {
    for (const lane of ["feed", "backfill"]) await t.test(lane, async () => {
      const a = { ...financial(1), link: `https://codal.ir/Reports/Decision.aspx?LetterSerial=${encodeURIComponent(id)}&rt=0&let=6&ct=0&ft=-1`,
        title: "PRIVATE_TITLE_DO_NOT_COPY", private: "PRIVATE_PAYLOAD", date_publish: "1405/07/01", time_publish: "10:00:00" };
      const f = await fixture({ excelHtml: industrial({ period: "1404/12/29", months: 12, prior: false, scope: "" }),
        pages: lane === "feed" ? [[a, boundary], []] : [[]],
        ...(lane === "backfill" ? { backfillPages: [a], marketBody: [{ payload: { stocks: [{ id: a.l18, value: 1 }] } }] } : {}),
      });
      await f.engine.runEngineCycle();
      const d = f.persisted.admissionDiagnostics, w = d.observations;
      assert.equal(d.lastCycle["ن-۱۰"].scope_unknown, 1);
      assert.equal(w.coverage, "observed"); assert.equal(w.limit, 22); assert.equal(w.events.length, 1); assert.equal(w.omittedCount, 0);
      const e = w.events[0];
      assert.equal(e.kind, "ن-۱۰"); assert.equal(e.reason, "scope_unknown"); assert.equal(e.lane, lane);
      assert.equal(e.announcementRef, a.link); assert.equal(e.sourceAnnouncementId, id); assert.equal(e.reportId, null);
      assert.equal(e.periodDeclaredText, "1404/12/29"); assert.equal(e.periodVerified, null); assert.equal(e.scopeVerified, null);
      assert.equal(e.clocks.sourcePublishedAt, null); assert.equal(e.clocks.sourceSentAt, null);
      assert.ok(e.clocks.attemptStartedAt >= w.cycleStartedAt && e.clocks.rejectedAt >= e.clocks.attemptStartedAt);
      assert.equal(w.cycleStartedAt, new Date(f.engine.engineStatus.lastRun).toISOString());
      assert.equal(f.calls.pages.length, lane === "feed" ? 2 : 3); assert.equal(f.calls.excel.length, 1);
      assert.equal(f.calls.saves.length, 1); assert.equal(f.calls.reportWrites.length, 0);
      assert.equal(f.persisted.fails[a.link], 1); assert.deepEqual(f.persisted.watermark, watermark);
      assert.equal(f.persisted.backfillCursor, lane === "feed" ? 0 : 1);
      assert.ok(Buffer.byteLength(JSON.stringify(w)) <= ADMISSION_OBSERVATION_BYTES);
      assert.doesNotMatch(JSON.stringify(d), /PRIVATE|1405\/07\/01|10:00:00|lastSuccess/);
    });
  } finally { delay.mock.restore(); }
});

test("accepted, download exception, persistence exception and already blocked reports create no rejection metadata", async t => {
  const realTimeout = globalThis.setTimeout;
  const delay = t.mock.method(globalThis, "setTimeout", (fn, _ms, ...args) => realTimeout(fn, 0, ...args));
  try {
  for (const [name, options] of [
    ["accepted", {}], ["download", { excelError: "synthetic transport" }],
    ["persistence", { reportStatus: 503 }], ["blocked", { initialState: { watermark, backfillCursor: 0, fails: { [financial(1).link]: 3 } } }],
  ]) await t.test(name, async () => {
    const a = financial(1), f = await fixture({ pages: [[a, boundary], []], ...options });
    await f.engine.runEngineCycle();
    assert.equal(f.persisted.admissionDiagnostics.observations.events.length, 0);
    assert.equal(f.persisted.admissionDiagnostics.observations.coverage, "observed");
    assert.equal(f.persisted.admissionDiagnostics.observations.omittedCount, 0);
    assert.deepEqual(f.persisted.admissionDiagnostics.lastCycle, admissionCounts());
    assert.equal(f.calls.saves.length, 1);
    assert.equal(f.calls.excel.length, name === "blocked" ? 0 : name === "download" ? 3 : 1, "existing download retries stay unchanged");
    assert.equal(f.calls.reportWrites.length, ["accepted", "persistence"].includes(name) ? 1 : 0);
  });
  } finally { delay.mock.restore(); }
});

test("same announcement rejected in both existing lanes retains two attempts without inventing IDs or deduplicating counts", async t => {
  const realTimeout = globalThis.setTimeout;
  const delay = t.mock.method(globalThis, "setTimeout", (fn, _ms, ...args) => realTimeout(fn, 0, ...args));
  try {
    const id = Buffer.from("synthetic-two-natural-lanes").toString("base64");
    const a = { ...financial(1), link: `https://codal.ir/Reports/Decision.aspx?LetterSerial=${encodeURIComponent(id)}` };
    const f = await fixture({ pages: [[a, boundary], []], backfillPages: [a],
      marketBody: [{ payload: { stocks: [{ id: a.l18, value: 1 }] } }],
      excelHtml: industrial({ period: "1404/12/29", months: 12, prior: false, scope: "" }),
    });
    await f.engine.runEngineCycle();
    const w = f.persisted.admissionDiagnostics.observations;
    assert.deepEqual(w.events.map(e => e.lane), ["feed", "backfill"]);
    assert.ok(w.events.every(e => e.sourceAnnouncementId === id && e.reportId === null && e.periodVerified === null && e.scopeVerified === null));
    assert.equal(f.persisted.admissionDiagnostics.lastCycle["ن-۱۰"].scope_unknown, 2);
    assert.equal(f.persisted.fails[a.link], 2);
    assert.equal(f.calls.pages.length, 4); assert.equal(f.calls.excel.length, 2);
    assert.equal(f.calls.saves.length, 1); assert.equal(f.calls.reportWrites.length, 0);
    assert.equal(w.coverage, "observed"); assert.equal(w.omittedCount, 0);
  } finally { delay.mock.restore(); }
});
