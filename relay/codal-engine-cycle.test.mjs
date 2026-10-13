// Deterministic integration mocks only: every unmatched fetch fails closed.
import test from "node:test";
import assert from "node:assert/strict";
import { industrial, bank } from "./fixtures/n10-admission-fixtures.mjs";

process.env.BRSAPI_KEY = "mock-key";
process.env.BRSAPI_BASE = "https://provider.invalid";
process.env.SUPABASE_URL = "https://storage.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-service-role";
process.env.CODAL_FEED_PAGES = "6";
process.env.CODAL_FEED_DL = "10";
const codal = await import("./codal.mjs");
const originalFetch = globalThis.fetch;
let scenario = 0;

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
  const calls = { pages: [], feedWrites: [], reportWrites: [], saves: [], excel: [], existingFilters: [], confirmations: [], archiveSaves: [] };
  const reports = new Map((options.initialReports ?? []).map(r => [r.source_url, r]));
  let rejectFeed = !!options.rejectFeed;
  let rejectSave = !!options.rejectSave;
  codal.setCodalBudgetPorts({ client: { request: async (job) => {
    calls.pages.push(Number(job.params.page));
    return options.providerBody ?? { announcement: options.pages?.[Number(job.params.page) - 1] ?? [] };
  } } });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "excel.invalid") {
      calls.excel.push(url.pathname);
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
      if (options.reportStatus) return response({ error: "mock report failure" }, options.reportStatus);
      const inserted = rows.filter(r => !reports.has(r.source_url));
      for (const r of inserted) reports.set(r.source_url, r);
      return response(options.reportBody ?? inserted);
    }
    if (url.pathname.endsWith("/codal_reports") && !init.method) {
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
