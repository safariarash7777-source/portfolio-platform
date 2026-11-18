process.env.RELAY_BACKGROUND_WINDOW_ENABLED = "0"; // deterministic existing fixtures; window boundaries tested separately
// Deterministic integration mocks only: every unmatched fetch fails closed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { industrial, bank } from "./fixtures/n10-admission-fixtures.mjs";
import { admissionCounts, admissionEvent } from "./codal-admission-diagnostics.mjs";

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
  const calls = { pages: [], announcementCategories: [], coverageReads: [], feedWrites: [], reportWrites: [], saves: [], excel: [], existingFilters: [], confirmations: [], archiveSaves: [], storedReads: [], storedCategories: [], storedDates: [], storedPublicationFilters: [], storedPageSizes: [] };
  const reports = new Map((options.initialReports ?? []).map(r => [r.source_url, r]));
  let rejectFeed = !!options.rejectFeed;
  let rejectSave = !!options.rejectSave;
  const budgetJobs = [];
  const storedRows=[...(options.storedRows??[])];
  const officialPages=[];
  codal.setCodalBudgetPorts({ client: { request: async (job) => {
    budgetJobs.push({ producer: job.producer, budgetClass: job.budgetClass });
    calls.pages.push(Number(job.params.page));
    calls.announcementCategories.push(job.params.category ?? null);
    if (options.announcementErrorCode) throw Object.assign(new Error(options.announcementErrorCode), { code: options.announcementErrorCode });
    if (!job.params.l18 && Number(job.params.page) === options.deferBudgetOnPage) {
      throw Object.assign(new Error('internal allocation exhausted'), { name: 'LegacyBudgetError' });
    }
    if (options.backfillPages && job.params.l18) {
      return { announcement: job.params.category === "1" ? options.backfillPages : [] };
    }
    return options.providerBody ?? { announcement: options.pages?.[Number(job.params.page) - 1] ?? [] };
  } } });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if(url.hostname==="search.codal.ir"&&options.monthlyOfficialPages){
      assert.equal(url.searchParams.get("Category"),"3");
      officialPages.push(Number(url.searchParams.get("PageNumber")));
      const entries=options.monthlyOfficialPages[officialPages.at(-1)];
      return entries instanceof Array ? response({Total:100,Letters:entries}) : response({},503);
    }
    if (url.hostname === 'codal.ir' && options.monthlyDecision) {
      if (url.pathname === '/Reports/Decision.aspx') return new Response(null,{status:302,
        headers:{Location:`/Reports/MonthlyActivity.aspx?LetterSerial=${options.monthlyDecision.redirectSerial ?? url.searchParams.get('LetterSerial')}`}});
      assert.equal(url.pathname,'/Reports/MonthlyActivity.aspx');
      calls.excel.push('monthly-view');
      return new Response(options.monthlyDecision.html);
    }
    if (url.hostname === 'codal.ir' && options.officialBody !== undefined) return new Response(options.officialBody);
    if (["excel.invalid", "excel.codal.ir"].includes(url.hostname)) {
      calls.excel.push(url.pathname);
      if (options.excelErrorCode) throw Object.assign(new Error(options.excelErrorCode), { code: options.excelErrorCode });
      if (options.excelError) throw new Error(options.excelError);
      const workbook = new Response(options.excelBodies?.[url.pathname] ?? options.excelHtml ?? mockIncomeHtml);
      if (options.exactWorkbookResponse) Object.defineProperty(workbook, "url", { value: url.href });
      return workbook;
    }
    assert.equal(url.hostname, "storage.invalid", `Unmocked network request: ${url.hostname}`);
    if (url.pathname.endsWith("/codal_feed") && init.method === "POST") {
      const rows = JSON.parse(init.body);
      calls.feedWrites.push({ rows, prefer: init.headers.Prefer });
      if (rejectFeed) return response({ error: "mock failure" }, 503);
      if(options.monthlyOfficialPages||options.persistFeedRows){
        for(const row of rows)if(!storedRows.some(old=>old.link===row.link))storedRows.unshift({...row,id:100000+storedRows.length});
      }
      return response(options.feedBody ?? rows);
    }
    if (url.pathname.endsWith("/codal_feed") && !init.method) {
      calls.storedReads.push(url.searchParams.get("id"));
      const category = url.searchParams.get("category");
      const linkFilter=url.searchParams.get('link');
      const requestedLinks=linkFilter ? new Set(JSON.parse('['+linkFilter.slice(4,-1)+']')) : null;
      calls.storedCategories.push(category);
      calls.storedDates.push(url.searchParams.get("created_at"));
      const publicationFilter=url.searchParams.get("or");
      calls.storedPublicationFilters.push(publicationFilter);
      const requestedPageSize=Number(url.searchParams.get('limit') ?? 100);
      calls.storedPageSizes.push(requestedPageSize);
      if(publicationFilter&&(options.rejectMonthlyPublicationRead||
         options.rejectMonthlyHeadRead&&!url.searchParams.has('id')))return response({},503);
      const before = BigInt(url.searchParams.get("id")?.slice(3) ?? "9223372036854775807");
      const pageSize = Math.min(requestedPageSize, options.storedPageSize ?? 100);
      return response(storedRows.filter(r => BigInt(r.id) < before && (!category || category === `eq.${r.category}`)
        && (!requestedLinks||requestedLinks.has(r.link))).slice(0,pageSize));
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
      if (url.searchParams.get("select") === "source_url,symbol,period:data->>period_end") {
        const links = new Set(JSON.parse("[" + url.searchParams.get("source_url").slice(4, -1) + "]"));
        return response(stored.filter(r => links.has(r.source_url)).map(
          r => ({ source_url: r.source_url, symbol: r.symbol, period: r.data.period_end })));
      }
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
      if (options.archiveStateError) throw new Error('mock state network failure');
      return response(options.archiveStateBody ?? [], options.archiveStateStatus ?? 200);
    }
    if (url.pathname.endsWith("/ir_market_snapshots") && url.searchParams.get("key") === "eq.latest") {
      return response(options.marketBody ?? [], options.marketStatus ?? 200);
    }
    throw new Error(`Unmocked storage request: ${url.pathname}`);
  };
  const engine = await import(`./codal-engine.mjs?mock=${++scenario}`);
  return {
    engine, calls, budgetJobs, officialPages, get persisted() { return persisted; },
    allowFeed: () => { rejectFeed = false; }, allowSave: () => { rejectSave = false; },
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  codal.setCodalBudgetPorts(null);
});

test('archive cannot reset progress or spend on failed or malformed state reads', async () => {
  for (const options of [
    { archiveStateStatus: 503 }, { archiveStateError: true },
    { archiveStateBody: {} }, { archiveStateBody: [{ payload: null }] },
    { archiveStateBody: [{ payload: { cursor: 9, budget: { date: '2026-11-14', used: -1 }, perSymbol: {} } }] },
    { archiveStateBody: [{ payload: { cursor: 9, budget: { date: '2026-02-31', used: 198 }, perSymbol: {} } }] },
  ]) {
    const f = await fixture(options);
    const archive = await import(`./codal-archive.mjs?mock=${++scenario}`);
    await archive.runArchiveCycle();
    assert.equal(archive.archiveStatus.ok, false);
    assert.equal(archive.archiveStatus.lastError, 'archive_state_read_failed');
    assert.equal(f.budgetJobs.length, 0);
    assert.equal(f.calls.archiveSaves.length, 0);
  }
});

test('archive retries a failed read and preserves the recovered exhausted budget and cursor', async () => {
  await fixture({ archiveStateStatus: 503 });
  const archive = await import(`./codal-archive.mjs?mock=${++scenario}`);
  await archive.runArchiveCycle();
  const payload = { cursor: 234, budget: { date: new Date().toISOString().slice(0, 10), used: 198 },
    perSymbol: { sample: { p1: 4, p3: 8, done1: false, done3: true } } };
  const f = await fixture({ archiveStateBody: [{ payload }] });
  await archive.runArchiveCycle();
  assert.equal(f.budgetJobs.length, 0);
  assert.deepEqual(f.calls.archiveSaves[0], { ...payload, sourceHoldUntil: 0 });
  assert.equal(archive.archiveStatus.cursor, 234);
  assert.equal(archive.archiveStatus.usedToday, 198);
});

test('archive cannot reset a future-day budget after a backward clock change', async () => {
  const payload={cursor:234,budget:{date:'2999-01-01',used:198},perSymbol:{}};
  const f=await fixture({archiveStateBody:[{payload}]});
  const archive=await import(`./codal-archive.mjs?mock=${++scenario}`);
  await archive.runArchiveCycle();
  assert.equal(f.budgetJobs.length,0);
  assert.equal(archive.archiveStatus.ok,false);
  assert.match(archive.archiveStatus.lastError,/clock moved backwards/);
  assert.deepEqual(f.calls.archiveSaves[0],{...payload,sourceHoldUntil:0});
});

test('unsupported explicit monthly code preserves feed metadata without parsing as N30', async () => {
  const a = announcement(1, { code: "ن-۳۱", title: "گزارش فعالیت ماهانه", link_excel: "https://excel.invalid/1" });
  const f = await fixture({ pages: [[a, boundary], []] });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 0);
  assert.equal(f.calls.reportWrites.length, 0);
  assert.ok(f.calls.feedWrites.some(write => write.rows.some(row => row.link === a.link)));
  assert.equal(f.engine.engineStatus.feed.parseFailed, 0);
});

test('scheduled global discovery explicitly uses the standard current-feed allocation', async () => {
  const f = await fixture({ pages: [[]] });
  await f.engine.runEngineCycle();
  assert.deepEqual(f.budgetJobs, [{ producer: 'codal-list', budgetClass: 'standard' }]);
});

test('invalid statement retry ledger is never cached as valid state on a later cycle', async () => {
  const f = await fixture({ pages: [[]], initialState: { watermark, fails: {}, decisionStatementV1Attempts: { bad: 2 } } });
  for (let i = 0; i < 2; i++) {
    await f.engine.runEngineCycle();
    assert.equal(f.engine.engineStatus.ok, false);
    assert.equal(f.calls.pages.length, 0);
    assert.equal(f.calls.saves.length, 0);
  }
});
test('local announcement deferral keeps watermark and failure ledger and does not retry', async () => {
  const f = await fixture({ announcementErrorCode: 'brs_transport_queue_full' });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.pages.length, 1); assert.equal(f.engine.engineStatus.feed.parseFailed, 0);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, 'local_deferred');
  assert.deepEqual(f.persisted.watermark, watermark); assert.deepEqual(f.persisted.fails, {});
});
test('local report deferral is not a parse failure or a blocked report', async () => {
  const a = financial(1);
  const f = await fixture({ pages: [[a, boundary], []], excelErrorCode: 'brs_transport_aborted' });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 1); assert.equal(f.engine.engineStatus.feed.parseFailed, 0);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, 'local_deferred');
  assert.deepEqual(f.persisted.watermark, watermark); assert.deepEqual(f.persisted.fails, {});
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

test('order failure stores only the verified prefix and keeps the resume watermark', async () => {
  const good = announcement(3), bad = announcement(4), after = announcement(2);
  const f = await fixture({ pages: [[good, bad, after]] });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, false);
  assert.equal(f.engine.engineStatus.feed.incompleteReason, 'invalid_order_or_identity');
  assert.deepEqual(f.calls.feedWrites[0].rows.map(r => r.link), [good.link]);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.deepEqual(f.persisted.fails, {});
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

test('legacy mixed statements receive one persisted retry without reopening other failures', async()=>{
  for (const mixed of [true,false]) {
    const a={...financial(1),title:mixed?'صورت‌های مالی تلفیقی':'صورت‌های مالی',link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=fixture'};
    const options={pages:[[a,boundary],[]],excelHtml:'<table></table>',officialBody:'<html></html>'};
    const f=await fixture({...options,initialState:{watermark,backfillCursor:0,fails:{[a.link]:4},decisionStatementV1Attempts:{[a.link]:1}}});
    await f.engine.runEngineCycle();
    assert.equal(f.calls.excel.length,mixed?1:0);
    assert.equal(f.persisted.fails[a.link],mixed?5:4);
    assert.equal(f.persisted.interimStatementV1Attempts[a.link],mixed?1:undefined);
    assert.deepEqual(f.persisted.watermark,watermark);
    const restarted=await fixture({...options,initialState:f.persisted});
    await restarted.engine.runEngineCycle();assert.equal(restarted.calls.excel.length,0);
  }
});
test('invalid legacy retry ledger stops before any source request',async()=>{
  const f=await fixture({pages:[[]],initialState:{watermark,fails:{},interimStatementV1Attempts:{bad:2}}});
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok,false);assert.equal(f.calls.pages.length,0);assert.equal(f.calls.saves.length,0);
});
test('new statement adapter grants one bounded retry to an old official N10 failure and persists its use', async()=>{
  const a={...financial(1),link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=fixture'};
  const options={pages:[[a,boundary],[]],excelHtml:'<table></table>',officialBody:'<html></html>'};
  const f=await fixture({...options,initialState:{watermark,backfillCursor:0,fails:{[a.link]:3}}});
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length,1);assert.equal(f.persisted.fails[a.link],4);
  assert.equal(f.persisted.decisionStatementV1Attempts[a.link],1);
  assert.deepEqual(f.persisted.watermark,watermark);
  await f.engine.runEngineCycle();assert.equal(f.calls.excel.length,1);
  const restarted=await fixture({...options,initialState:f.persisted});
  await restarted.engine.runEngineCycle();assert.equal(restarted.calls.excel.length,0);
  assert.equal(restarted.persisted.fails[a.link],4);
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

test("old stored row counts cannot exclude companies from current reconciliation", async () => {
  const a = financial(1);
  const coverageRows = Array.from({ length: 1008 }, (_, n) => ({ id: 1008 - n, symbol: n < 1000 ? "الف" : "ب" }));
  const f = await fixture({ pages: [[a, boundary], []],
    excelHtml: industrial({ period: "1404/12/29", months: 12, prior: false, unit: "" }),
    marketBody: [{ payload: { stocks: [{ id: "الف", value: 2 }, { id: "ب", value: 1 }] } }],
    coverageRows, backfillPages: [],
  });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.feed.parseFailed, 1);
  assert.equal(f.calls.reportWrites.length, 0);
  assert.deepEqual(f.persisted.watermark, watermark);
  assert.equal(f.persisted.fails[a.link], 1);
  assert.deepEqual(f.calls.coverageReads, []);
  assert.equal(f.engine.engineStatus.backfill.skippedCovered, 0);
  assert.deepEqual(f.engine.engineStatus.backfill.symbols, ["الف", "ب"]);
  assert.deepEqual(f.calls.pages, [1, 2, 1, 1, 1, 1]);
});

test("zero trading value issuers remain in bounded reconciliation without historical count reads", async () => {
  const f = await fixture({ pages: [[]], failCoverageAfter: 1, backfillPages: [],
    marketBody: [{ payload: { stocks: [{ id: "الف", value: 0 }, { id: "ب", value: null }] } }],
  });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.ok, true);
  assert.deepEqual(f.calls.coverageReads, []);
  assert.deepEqual(f.engine.engineStatus.backfill.symbols, ["الف", "ب"]);
  assert.equal(f.engine.engineStatus.backfill.queueSize, 2);
  assert.deepEqual(f.calls.pages, [1, 1, 1, 1, 1]);
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
          assert.deepEqual(f.persisted.admissionDiagnostics, { version: 1, totals: admission, lastCycle: admission });
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
        assert.deepEqual(f.persisted.admissionDiagnostics, { version: 1, totals, lastCycle });
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
        assert.doesNotMatch(JSON.stringify(f.persisted.admissionDiagnostics), /https|اطلاعیه|محصول|1404|scope.*html/i);
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
  assert.deepEqual(f.persisted.admissionDiagnostics, { version: 1, totals, lastCycle });
  assert.equal(f.persisted.fails[a.link], 1);
  assert.equal(f.calls.saves.length, 1);
  assert.doesNotMatch(JSON.stringify(f.persisted.admissionDiagnostics), /SECRET|html|url|title|message|private|raw|secretKind/);
  assert.deepEqual(admissionEvent({ kind: "ن-۱۰", reason: "scope_unknown", html: "SYNTHETIC_SECRET" }, "ن-۱۰"), { kind: "ن-۱۰", reason: "scope_unknown" });
  assert.equal(admissionEvent({ kind: "ن-۳۰", reason: "scope_unknown" }, "ن-۱۰"), null);
  assert.equal(admissionEvent({ kind: "ن-۱۰", reason: "SYNTHETIC_SECRET" }, "ن-۱۰"), null);
  for (const admissionDiagnostics of [undefined, { version: 2, totals }]) {
    const legacy = await fixture({ pages: [[]], initialState: { watermark, backfillCursor: 7, fails: { [a.link]: 2 }, admissionDiagnostics } });
    await legacy.engine.runEngineCycle();
    assert.deepEqual(legacy.persisted.admissionDiagnostics, { version: 1, totals: admissionCounts(), lastCycle: admissionCounts() });
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

const stored = id => ({ id, symbol: "نمونه", company_name: "شرکت نمونه", title: "صورت‌های مالی سال مالی منتهی به 1404/12/29", report_code: "ن-۱۰",
  link: `https://codal.ir/Reports/Decision.aspx?LetterSerial=serial${id}`,
  link_excel: `https://excel.codal.ir/service/Excel/GetAll/serial${id}/0` });

test('stored recovery admits reports even when provider search is locally deferred', async () => {
  const f = await fixture({ announcementErrorCode: 'brs_transport_queue_full', storedRows: [stored(9)] });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.pages.length, 1);
  assert.equal(f.calls.reportWrites.length, 1);
  assert.equal(f.engine.engineStatus.storedRecovery.inserted, 1);
  assert.equal(f.engine.engineStatus.storedRecovery.reachedEnd, true);
  assert.equal(f.persisted.storedFeedCursor, null);
});

test('stored recovery keeps six-download bound and resumes without rediscovery', async () => {
  const f = await fixture({ storedRows: Array.from({length: 8}, (_, i) => stored(10-i)) });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 6);
  assert.equal(f.persisted.storedFeedCursor, '5');
  await f.engine.runEngineCycle();
  assert.equal(f.calls.excel.length, 8);
  assert.equal(f.calls.pages.length, 2);
  assert.equal(f.engine.engineStatus.storedRecovery.reachedEnd, true);
});

test('stored recovery save failure restores scan position for the next attempt', async () => {
  const f = await fixture({ storedRows: [stored(9),stored(8),stored(7)], storedPageSize: 1, rejectSave: true });
  await f.engine.runEngineCycle();
  f.allowSave();
  await f.engine.runEngineCycle();
  assert.equal(f.calls.storedReads[2], null);
  assert.equal(f.engine.engineStatus.storedRecovery.skippedKnown, 2);
  assert.equal(f.calls.excel.length, 2);
});

test('invalid saved recovery cursor stops before any provider request', async () => {
  const f = await fixture({ initialState: { fails: {}, storedFeedCursor: 'NaN' } });
  await f.engine.runEngineCycle();
  assert.equal(f.calls.pages.length, 0);
  assert.equal(f.calls.storedReads.length, 0);
  assert.match(f.engine.engineStatus.lastError, /cursor invalid/);
});

test('stored recovery skips confirmed and blocked rows without retrying downloads', async () => {
  const known=stored(9), blocked=stored(8);
  const f=await fixture({storedRows:[known,blocked], initialReports:[{source_url:known.link+"#pv2",symbol:known.symbol,data:{valid:true}}],
    initialState:{watermark,fails:{[blocked.link]:3},decisionStatementV1Attempts:{[blocked.link]:1}}});
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.storedRecovery.skippedKnown,1);
  assert.equal(f.engine.engineStatus.storedRecovery.blocked,1);
  assert.equal(f.calls.excel.length,0);
});

test('stored report local deferral preserves cursor and does not charge a parse failure', async () => {
  const f=await fixture({storedRows:[stored(9)],excelErrorCode:'brs_transport_aborted'});
  await f.engine.runEngineCycle();
  assert.equal(f.persisted.storedFeedCursor,null);
  assert.deepEqual(f.persisted.fails,{});
  assert.equal(f.engine.engineStatus.storedRecovery.parseFailed,0);
});

test('audited mixed adapter receives one persisted retry with old counts intact',async()=>{
 for(const audited of [true,false]){
  const a={...financial(1),title:`صورت‌های مالی تلفیقی (${audited?'حسابرسی شده':'حسابرسی نشده'})`,link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=audited-fixture'};
  const options={pages:[[a,boundary],[]],excelHtml:'<table></table>',officialBody:'<html></html>'};
  const f=await fixture({...options,initialState:{watermark,backfillCursor:0,fails:{[a.link]:5},decisionStatementV1Attempts:{[a.link]:1},interimStatementV1Attempts:{[a.link]:1}}});
  await f.engine.runEngineCycle();assert.equal(f.calls.excel.length,audited?1:0);
  assert.equal(f.persisted.fails[a.link],audited?6:5);
  assert.equal(f.persisted.auditedStatementV1Attempts[a.link],audited?1:undefined);
  const restarted=await fixture({...options,initialState:f.persisted});
  await restarted.engine.runEngineCycle();assert.equal(restarted.calls.excel.length,0);
 }
});
test('malformed audited attempt ledger stops before any source traffic',async()=>{
 const f=await fixture({pages:[[]],initialState:{watermark,fails:{},auditedStatementV1Attempts:{bad:2}}});
 await f.engine.runEngineCycle();assert.equal(f.engine.engineStatus.ok,false);assert.equal(f.calls.pages.length,0);
});

test('stored recovery does not starve issuer reconciliation and both share the existing download cap', async () => {
  const f = await fixture({ pages:[[]], storedRows:Array.from({length:8},(_,i)=>stored(30-i)),
    backfillPages:Array.from({length:10},(_,i)=>financial(100+i)),
    marketBody:[{payload:{stocks:[{id:'نمونه',value:0}]}}] });
  await f.engine.runEngineCycle();
  assert.equal(f.engine.engineStatus.storedRecovery.downloaded,6);
  assert.deepEqual(f.engine.engineStatus.backfill.symbols,['نمونه']);
  assert.equal(f.calls.excel.length,12);
  assert.equal(f.engine.engineStatus.backfill.queueSize,1);
});

test('stable reconciliation advances across cycles without resetting its durable cursor', async () => {
  const f=await fixture({pages:[[]],backfillPages:[],marketBody:[{payload:{stocks:[{id:'پ',value:10},{id:'ب',value:0},{id:'الف',value:1}]}}]});
  await f.engine.runEngineCycle();
  assert.deepEqual(f.engine.engineStatus.backfill.symbols,['الف','ب']);
  assert.equal(f.persisted.backfillCursor,2);
  await f.engine.runEngineCycle();
  assert.deepEqual(f.engine.engineStatus.backfill.symbols,['پ','الف']);
  assert.equal(f.persisted.backfillCursor,4);
});

test('overnight reconciliation inspects eight issuers without raising the existing download allocation', async () => {
  const originalNow=Date.now;
  process.env.RELAY_BACKGROUND_WINDOW_ENABLED='1';
  Date.now=()=>Date.parse('2026-11-14T21:00:00+03:30');
  try {
    const symbols=['الف','ب','پ','ت','ث','ج','چ','حس'];
    const f=await fixture({pages:[[]],backfillPages:[],marketBody:[{payload:{stocks:symbols.map(id=>({id,value:0}))}}]});
    await f.engine.runEngineCycle();
    assert.equal(f.engine.engineStatus.backfill.symbols.length,8);
    assert.equal(f.engine.engineStatus.backfill.symbolLimit,8);
    assert.equal(f.engine.engineStatus.backfill.workWindow,'overnight');
    assert.equal(f.calls.excel.length,0);
    assert.equal(f.persisted.backfillCursor,8);
  } finally { Date.now=originalNow;process.env.RELAY_BACKGROUND_WINDOW_ENABLED='0'; }
});

test('archive retains a partially downloaded page and resumes its unprocessed reports',async()=>{
 const items=Array.from({length:16},(_,i)=>financial(200+i));
 const f=await fixture({marketBody:[{payload:{stocks:[{id:'نمونه',value:0}]}}]});
 codal.setCodalBudgetPorts({client:{request:async job=>({announcement:job.params.category==='1' && job.params.page==='1'?items:[]})}});
 const archive=await import(`./codal-archive.mjs?mock=${++scenario}`);
 await archive.runArchiveCycle();
 assert.equal(f.calls.excel.length,14);
 assert.equal(f.calls.archiveSaves.at(-1).perSymbol['نمونه'].p1,1);
 assert.equal(f.calls.archiveSaves.at(-1).perSymbol['نمونه'].done1,false);
 await archive.runArchiveCycle();
 assert.equal(f.calls.excel.length,16);
 assert.equal(f.calls.reportWrites.length,16);
 assert.equal(f.calls.archiveSaves.at(-1).perSymbol['نمونه'].done1,true);
});
test('archive rejection does not advance its page or claim a successful cycle',async()=>{
 const a=financial(300);
 const f=await fixture({marketBody:[{payload:{stocks:[{id:'نمونه',value:0}]}}],excelHtml:industrial({period:'1404/12/29',months:12,prior:false,unit:''})});
 codal.setCodalBudgetPorts({client:{request:async job=>({announcement:job.params.category==='1' && job.params.page==='1'?[a]:[]})}});
 const archive=await import(`./codal-archive.mjs?mock=${++scenario}`);
 await archive.runArchiveCycle();
 assert.equal(archive.archiveStatus.ok,false);
 assert.equal(archive.archiveStatus.lastCycle.parseFailed,1);
 assert.equal(f.calls.archiveSaves.at(-1).perSymbol['نمونه'].p1,1);
 assert.equal(f.calls.reportWrites.length,0);
});

test('a budget stop on page two saves verified announcement metadata without advancing checkpoints', async () => {
 const a=financial(2);
 const f=await fixture({pages:[[a]],deferBudgetOnPage:2});
 await f.engine.runEngineCycle({allowBackground:false});
 assert.deepEqual(f.calls.pages,[1,2]);
 assert.deepEqual(f.calls.feedWrites[0].rows.map(row=>row.link),[a.link]);
 assert.equal(f.calls.excel.length,0);
 assert.deepEqual(f.persisted.watermark,watermark);
 assert.equal(f.persisted.metadataWatermark,undefined);
 assert.equal(f.engine.engineStatus.feed.incompleteReason,'local_deferred');
 assert.deepEqual(f.persisted.fails,{});
});

test('monthly-only cycle keeps public announcements and recovers a verified month within the fast cadence', async () => {
 const old = stored(10);
 const month = { ...stored(9), symbol:'فولاد', title:'گزارش فعالیت ماهانه منتهی به 1405/06/31', report_code:'ن-۳۰', category:'ماهانه' };
 const html = readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 const f = await fixture({ pages:[[financial(2),boundary],[]],
   initialState:{watermark,fails:{},storedFeedCursor:'2'},
   storedRows:[{...old,category:'صورت مالی'},month], excelHtml:html });
 await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true});
 assert.equal(f.engine.engineStatus.reportScope,'monthly_only');
 assert.equal(f.calls.feedWrites[0].rows[0].category,'صورت مالی');
 assert.ok(f.calls.storedCategories.every(category=>category==='eq.ماهانه'));
 assert.deepEqual(f.calls.excel,['/service/Excel/GetAll/serial9/0']);
 assert.equal(f.calls.reportWrites.length,1);
 const inserted=f.calls.reportWrites[0][0];
 assert.equal(inserted.report_kind,'ن-۳۰');
 assert.equal(inserted.data.period_end,'1405-06-31');
 assert.equal(inserted.data.unit,'میلیون ریال');
 assert.ok(inserted.data.period_total_amount>0);
 assert.equal(f.persisted.storedFeedCursor,'2');
});

test('monthly discovery retains valid rows beyond an out-of-order boundary and holds the checkpoint', async () => {
  const first = announcement(5);
  const older = { ...announcement(1), date_send: "1405/06/30" };
  const reordered = announcement(6);
  const broken = { ...announcement(7), date_send: "bad" };
  const fromNextPage = announcement(4);
  const f = await fixture({pages:[[first, older, reordered, broken, reordered],[fromNextPage],[]]});
  await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true});
  assert.deepEqual(f.calls.feedWrites[0].rows.map(row=>row.link), [first.link,reordered.link,fromNextPage.link]);
  assert.deepEqual(f.persisted.watermark,watermark);
  assert.equal(f.engine.engineStatus.feed.incompleteReason,"invalid_order_or_identity");
});

test('monthly bank profile can retry pre-adapter rejects and verifies publisher table, unit and period', async () => {
  const bankReport = {
    ...stored(9), symbol:"وبملت", title:"گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۷/۳۰",
    report_code:"ن-۳۰", category:"ماهانه",
    link:"https://codal.ir/Reports/Decision.aspx?LetterSerial=serial9&rt=3&let=58",
  };
  const header=["شرح","ابتدای سال","اصلاحات","اصلاح شده",
    "درآمد محقق شده طی دوره یک ماهه منتهی به ۱۴۰۵/۰۷/۳۰",
    "جمع درآمد محقق شده از ابتدای سال مالی تا پایان ۱۴۰۵/۰۷/۳۰"];
  const items=[
    ["درآمد تسهیلات اعطایی",1816866984,0,1816866984,311887001,2128753985],
    ["درآمد سپرده گذاری",185495292,0,185495292,17451513,202946805],
    ["درآمد اوراق بدهی",137910183,0,137910183,24244406,162154589],
    ["درآمد سرمایه گذاری ها",558091,0,558091,10001216,10559307],
    ["درامد کارمزد",352564391,0,352564391,62474312,415038703],
  ];
  const table=[header,...items].map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join("")}</tr>`).join("");
  const excelHtml=`<div>کلیه مبالغ به میلیون ریال است</div><app-table><table>${table}</table></app-table>`;
  const meta={symbol:bankReport.symbol,period_months:1,period_end:"1405-07-30"};
  assert.equal(codal.normalizeSectorN30(excelHtml.replace("میلیون ریال","هزار ریال"),meta,"bank_reported_income"),null);
  assert.equal(codal.normalizeSectorN30(excelHtml,{...meta,period_end:"1405-06-31"},"bank_reported_income"),null);
  const f=await fixture({excelHtml,storedRows:[bankReport],exactWorkbookResponse:true,
    initialState:{watermark,fails:{[bankReport.link]:3}}});
  await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true});
  const report=f.calls.reportWrites[0]?.[0];
  assert.equal(report?.data.monthly_measure,"bank_reported_income");
  assert.equal(report.data.period_total_amount,426058448);
  assert.deepEqual(report.data.products,[]);
  assert.equal(f.persisted.fails[bankReport.link],undefined);
});

test('an industrial report blocked before the parser update receives one bounded automatic reattempt', async () => {
 const a={...stored(9),symbol:"فولاد",title:"گزارش فعالیت ماهانه منتهی به 1405/06/31",report_code:"ن-۳۰",category:"ماهانه",
   link:"https://codal.ir/Reports/Decision.aspx?LetterSerial=serial9&rt=0&let=58"};
 const failKey=`monthly-industrial-v1:${a.link}`;
 const initialState={watermark,fails:{[a.link]:3}};
 const base={pages:[[]],storedRows:[a],initialState,exactWorkbookResponse:true};
 const accepted=await fixture({...base,excelHtml:readFileSync(new URL("./fixtures/folad-n30-primary.html",import.meta.url),"utf8")});
 await accepted.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 assert.equal(accepted.engine.engineStatus.storedRecovery.inserted,1);
 assert.equal(accepted.persisted.fails[a.link],undefined);
 const rejected=await fixture({...base,excelHtml:"<p>No table</p>"});
 await rejected.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 assert.equal(rejected.calls.excel.length,1);
 assert.equal(rejected.persisted.fails[a.link],4);
 assert.equal(rejected.persisted.fails[failKey],1);
 const next=await fixture({...base,initialState:rejected.persisted,excelHtml:"<p>No table</p>"});
 await next.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 assert.equal(next.calls.excel.length,0);
 assert.equal(next.engine.engineStatus.storedRecovery.blocked,1);
});

test('insurance monthly admission checks published totals and reads premium apart from paid claims', () => {
  const date="۱۴۰۵/۰۷/۳۰";
  const top=["شرح","ابتدای سال","اصلاحات","اصلاح شده",`دوره یک ماهه منتهی به ${date}`,`از ابتدای سال مالی تا پایان مورخ ${date}`];
  const groups=Array.from({length:5},()=>["حق بیمه صادره (شامل قبولی اتکایی)","خسارت پرداختی"]).flat();
  const units=Array(19).fill("مبلغ (میلیون ریال)");
  units[0]="رشته بیمه ای";
  const values=[71325758,100,55306523,100,0,0,71325758,100,55306523,100,15463740,100,12955444,100,86789498,100,68261967,100];
  const total=["جمع",...values];
  const report=rows=>`<div>کلیه مبالغ درج شده به میلیون ریال می باشد.</div><app-table><table>${rows.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join("")}</tr>`).join("")}</table></app-table>`;
  const body=[top,groups,units,["زندگی",...values],total];
  const meta={symbol:"بخاور",period_months:1,period_end:"1405-07-30"};
  const d=codal.normalizeSectorN30(report(body),meta,"issued_premium");
  assert.equal(d?.period_total_amount,15463740);
  assert.equal(d?.fy_cumulative_amount,86789498);
  total[11]+=2;
  assert.equal(codal.normalizeSectorN30(report(body),meta,"issued_premium"),null);
});

test('service and leasing monthly income verify the source period, adjustments and published totals', () => {
 const date="۱۴۰۵/۰۷/۳۰";
 const caption="کلیه مبالغ درج شده به میلیون ریال می باشد";
 const report=rows=>`<div>${caption}</div><app-table><table>${rows.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join("")}</tr>`).join("")}</table></app-table>`;
 const service=[["شرح خدمات یا فروش","قرارد دادها","درآمد شناسایی شده","توضیحات"],
   ["تاریخ عقد قرارداد","مدت قرارداد (ماه)","تا ماه قبل","اصلاحات","اصلاح شده",
     `درآمد شناساسی شده طی دوره یک ماهه منتهی به ${date}`,
     `درآمد شناساسی شده از اول سال مالی تا پایان دوره مالی منتهی به ${date}`,"دوره قبل"],
   ["درآمد خدمات","1404/01/01","2","105","(5)","100","7","107","80",""],
   ["جمع","","0","105","(5)","100","7","107","80",""]];
 const leasing=[["شرح","تا ماه قبل","اصلاحات","اصلاح شده",
   `درآمد محقق شده طی دوره یک ماهه منتهی به ${date}`,
   `جمع درآمد محقق شده از ابتدای سال مالی تا پایان مورخ ${date}`],
   ["سود اقساط مربوط به قراردادهای سال جاری","80","0","80","0","80"],
   ["سایر درآمد حاصل از عملیات لیزینگ","20","0","20","0","20"],
   ["جمع","100","0","100","0","100"]];
 const meta={symbol:"نمونه",period_months:1,period_end:"1405-07-30"};
 for (const [profile, body, current, cumulative] of [
   ["service_recognized_income",service,7,107],
   ["leasing_reported_income",leasing,0,100],
 ]) {
   const source=report(body);
   const data=codal.normalizeSectorN30(source,meta,profile);
   assert.equal(data?.period_total_amount,current);
   assert.equal(data.fy_cumulative_amount,cumulative);
   assert.equal(data.monthly_measure,profile);
   assert.deepEqual(data.products,[]);
   assert.equal(codal.normalizeSectorN30(source,{...meta,period_end:"1405-06-31"},profile),null);
   assert.equal(codal.normalizeSectorN30(source.replace("میلیون ریال","هزار ریال"),meta,profile),null);
   const badTotal=structuredClone(body);
   badTotal.at(-1)[profile==="service_recognized_income"?6:4]="";
   assert.equal(codal.normalizeSectorN30(report(badTotal),meta,profile),null);
   const inconsistent=structuredClone(body);
   inconsistent.at(-1)[profile==="service_recognized_income"?7:5]="12345";
   assert.equal(codal.normalizeSectorN30(report(inconsistent),meta,profile),null);
 }
});

test('real estate monthly totals require a reconciled view and matching duplicated headlines', () => {
 const date="۱۴۰۵/۰۷/۳۰";
 const month=`درآمد محقق شده طي دوره يک ماهه منتهي به ${date}`;
 const year=`جمع درآمد محقق شده از ابتداي سال مالي تا ${date}`;
 const ready="فروش واحد هاي ساختماني آماده فروش";
 const progress="فروش واحد هاي ساختماني در جريان ساخت";
 const html=rows=>`<div class="table-description">کليه مبالغ به ميليون ريال است</div><app-table><table>${rows.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join("")}</tr>`).join("")}</table></app-table>`;
 const meta={symbol:"نمونه",period_months:1,period_end:"1405-07-30"};
 const profile="real_estate_recognized_income";
 const plain=[["شرح",month,year],[ready,100,200],[progress,50,70],["جمع",150,270]];
 assert.equal(codal.normalizeSectorN30(html(plain),meta,profile)?.period_total_amount,150);
 const double = [
   ["شرح","قبل","اصلاحات","اصلاح‌شده",month,year],
   [ready,100,0,100,100,200], [progress,20,0,20,50,70], ["جمع",120,0,120,150,270],
 ].map(row=>row.flatMap(value=>[value,value]));
 // One rendered view drops a value. The other sums to the same declared total.
 double[1][8]=0;
 assert.equal(codal.normalizeSectorN30(html(double),meta,profile)?.fy_cumulative_amount,270);
 double.at(-1)[8]=80;
 assert.equal(codal.normalizeSectorN30(html(double),meta,profile),null);
 double.at(-1)[8]=150;
 double[1][9]=0;
 assert.equal(codal.normalizeSectorN30(html(double),meta,profile),null);
 assert.equal(codal.normalizeSectorN30(html(plain),{...meta,period_end:"1405-06-31"},profile),null);
});

test('monthly decision admission binds the publisher identity, period and explicit financing service total', async () => {
 const date='1405/07/30';
 const title='گزارش فعالیت ماهانه';
 const report={
  ...stored(23),category:'ماهانه',symbol:'لوتوس',report_code:'ن-۳۰',
  title:`${title} دوره ۱ ماهه منتهی به ${date}`,
  link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=serial23&rt=9&let=58',
 };
 const values=[
  ['شرح','از ابتدای دوره','اصلاحات','اصلاح شده',`درآمد محقق شده طی دوره یک ماهه منتهی به ${date}`,
   `جمع درآمد محقق شده از ابتدای سال مالی تا پایان ${date}`,'سال قبل','توضیحات'],
  ['درآمد تعهد پذیره نویسی',60,-5,55,6,61,0,''],
  ['درآمد بازارگردانی',30,0,30,8,38,0,''],
  ['جمع',90,-5,85,14,99,0,''],
 ];
 const code=2162,sheetCode=1000009;
 const cells=values.flatMap((row,r)=>row.map((value,c)=>({
  address:String.fromCharCode(65+c)+(r+1),rowSequence:r+1,columnSequence:c+1,isVisible:true,
  value,metaTableId:code,metaTableCode:code,
 })));
 const payload={type:58,period:1,periodEndToDate:date,isConsolidated:false,tracingNo:42,
  sheets:[{code:sheetCode,aliasName:'MonthlyActivity',tables:[{code,metaTableId:code,sheetCode,
   aliasName:'RevenuesServiceDeliveryRealized',description:'کلیه مبالغ به میلیون ریال است',cells}]}]};
 const publisher=(data=payload,symbols=`<span id="ctl00_lblDisplaySymbol">${report.symbol}</span>`)=>`<form id="aspnetForm" action="./MonthlyActivity.aspx?LetterSerial=serial23">
  <span id="ctl00_lblReportName">${title}</span>${symbols}
  <span id="ctl00_lblPeriod">1 ماهه</span><span id="ctl00_lblPeriodEndToDate">${date}</span>
  <script>var datasource = ${JSON.stringify(data)};</script></form>`;
 const alternate=`<span id="ctl00_lblDisplaySymbol"></span><span id="ctl00_txbSymbol">${report.symbol}</span>`;
 const failureKey=`monthly-sector-v1:${report.link}`;
 const retryKey=`monthly-decision-symbol-v1:${report.link}`;
 const f=await fixture({storedRows:[report],pages:[[]],monthlyDecision:{html:publisher(payload,alternate)},
  initialState:{watermark,fails:{[failureKey]:3}}});
 await f.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 const result=f.calls.reportWrites[0][0].data;
 assert.equal(result.monthly_measure,'financing_service_income');
 assert.equal(result.period_total_amount,14);
 assert.equal(result.fy_cumulative_amount,99);
 assert.equal(result.monthly_source.table_code,2162);
 assert.match(result.monthly_source.sha256,/^[0-9a-f]{64}$/);
 assert.deepEqual(f.calls.excel,['monthly-view']);
 assert.equal(f.persisted.fails[failureKey],undefined);
 const forged=structuredClone(payload);
 forged.sheets[0].tables[0].cells.push(forged.sheets[0].tables[0].cells.at(-3));
 await fixture({monthlyDecision:{html:publisher(forged)}});
 assert.equal(await codal.downloadAndParse({
  ...report,l18:report.symbol,code:report.report_code,link_excel:report.link_excel,
 },'ن-۳۰'),null);
 const conflict=alternate.replace('ctl00_lblDisplaySymbol"></span>','ctl00_lblDisplaySymbol">نماد دیگر</span>');
 const mismatch=await fixture({storedRows:[report],pages:[[]],monthlyDecision:{html:publisher(payload,conflict)},
  initialState:{watermark,fails:{[failureKey]:3}}});
 await mismatch.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 assert.equal(mismatch.calls.reportWrites.length,0);
 assert.equal(mismatch.persisted.fails[retryKey],1);
 await mismatch.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 await mismatch.engine.runEngineCycle({monthlyOnly:true,allowBackground:false});
 assert.deepEqual(mismatch.calls.excel,['monthly-view']);
 const bad=await fixture({monthlyDecision:{html:publisher(),redirectSerial:'another-report'}});
 await assert.rejects(codal.downloadAndParse({
  ...report,l18:report.symbol,code:report.report_code,link_excel:report.link_excel,
 },'ن-۳۰'),/redirect_unsupported/);
 assert.deepEqual(bad.calls.excel,[]);
});

test('monthly discovery can advance past a rejected workbook once the announcement is durable', async () => {
 const a=announcement(2,{code:'ن-۳۰',title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',link_excel:'https://excel.invalid/2'});
 const f=await fixture({pages:[[a,boundary],[]],excelHtml:'<p>Unsupported worksheet</p>'});
 await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true});
 assert.equal(f.engine.engineStatus.ok,false);
 assert.equal(f.engine.engineStatus.feed.incompleteReason,'report_failure');
 assert.equal(f.calls.feedWrites[0].rows[0].link,a.link);
 assert.equal(f.calls.reportWrites.length,0);
 assert.equal(f.persisted.watermark.key,14050701000002);
 assert.equal(f.persisted.fails[a.link],1);
});

test('monthly background and archive allocation do not request the financial category', async () => {
 const f=await fixture({pages:[[]],backfillPages:[],marketBody:[{payload:{stocks:[{id:'نمونه'}]}}]});
 await f.engine.runEngineCycle({monthlyOnly:true});
 const archive=await import(`./codal-archive.mjs?mock=${++scenario}`);
 await archive.runArchiveCycle({monthlyOnly:true});
 assert.equal(archive.archiveStatus.reportScope,'monthly_only');
 assert.deepEqual(f.calls.announcementCategories,[null,'3','3']);
});

test('saturated monthly feed preserves recovery progress and durable deferred notices within the total cap', async t => {
 t.mock.method(Date,'now',()=>Date.parse('2026-11-15T16:30:00Z'));
 const month=(id,publish_date)=>({...stored(id),symbol:'فولاد',title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',
   report_code:'ن-۳۰',category:'ماهانه',publish_date});
 const fresh=base=>Array.from({length:10},(_,i)=>{
   const row=month(base-i,'۱۴۰۵/۰۸/۲۴');
   return announcement(base-i,{l18:row.symbol,l30:row.company_name,title:row.title,code:row.report_code,
     link:row.link,link_excel:row.link_excel,date_publish:row.publish_date});
 });
 const first=fresh(110),second=fresh(210);
 const options={pages:[[...first,boundary],[]],persistFeedRows:true,
   storedRows:[month(90,'۱۴۰۵/۰۸/۲۴'),month(89,'۱۴۰۵/۰۸/۲۴'),month(70,'۱۴۰۵/۰۶/۳۱'),month(69,'۱۴۰۵/۰۶/۳۱')],
   initialState:{watermark,fails:{},recentMonthlyRecoveryCursor:'91',monthlyRecoveryCursor:'71'},
   excelHtml:readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8')};
 const f=await fixture(options);
 const run={monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true};
 await f.engine.runEngineCycle(run);
 assert.equal(f.engine.engineStatus.feed.downloaded,7);
 assert.equal(f.engine.engineStatus.feed.complete,false);
 assert.equal(f.engine.engineStatus.feed.incompleteReason,'download_limit');
 assert.equal(f.calls.excel.length,10);
 assert.equal(f.persisted.recentMonthlyRecoveryCursor,'90');
 assert.equal(f.persisted.monthlyRecoveryCursor,'70');
 assert.equal(f.calls.feedWrites[0].rows.filter(r=>first.some(a=>a.link===r.link)).length,10);
 assert.equal(f.persisted.watermark.key,14050701000150);
 options.pages=[[...second,first[0],boundary],[]];
 await f.engine.runEngineCycle(run);
 assert.equal(f.engine.engineStatus.feed.downloaded,7);
 assert.equal(f.engine.engineStatus.feed.complete,false);
 assert.equal(f.calls.excel.length,20);
 assert.equal(f.persisted.recentMonthlyRecoveryCursor,null,'recent sweep reached the end');
 assert.equal(f.persisted.monthlyRecoveryCursor,null,'historical sweep reached the end');
 for(const id of [89,69])assert.ok(f.calls.reportWrites.flat().some(r=>r.source_url===month(id,'').link+'#pv2'));
 // A discovery checkpoint may advance after durable metadata. Deferred files
 // must still be recovered from that ledger after the burst has ended.
 options.pages=[[]];
 await f.engine.runEngineCycle(run);
 await f.engine.runEngineCycle(run);
 const written=new Set(f.calls.reportWrites.flat().map(r=>r.source_url));
 for(const a of [...first,...second])assert.ok(written.has(a.link+'#pv2'));
 assert.equal(f.calls.excel.length,new Set(f.calls.excel).size,'no successful workbook downloaded twice');
});

test('feed allocation reserves recovery in mixed mode and is unchanged outside recent monthly recovery', async () => {
 const entries=Array.from({length:10},(_,i)=>announcement(20-i,{code:'ن-۳۰',
   title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',link_excel:`https://excel.invalid/${20-i}`}));
 const excelHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 for(const [run,expected] of [[{monthlyOnly:true},10],[{prioritizeRecentMonthly:true},10],
   [{monthlyOnly:true,prioritizeRecentMonthly:true,recentInterimReports:true},5]]){
   const f=await fixture({pages:[[...entries,boundary],[]],excelHtml,marketBody:[{payload:{stocks:[{id:'نمونه'}]}}]});
   await f.engine.runEngineCycle({...run,allowBackground:false});
   assert.equal(f.engine.engineStatus.feed.downloaded,expected);
   assert.equal(f.calls.excel.length,expected);
   assert.equal(f.engine.engineStatus.feed.complete,expected===10);
 }
});

test('opted-in mixed cycles recover recent monthly and interim reports during a saturated monthly feed', async t => {
 t.mock.method(Date,'now',()=>Date.parse('2026-11-15T15:30:00Z'));
 const prior=process.env.CODAL_RECENT_INTERIM_ENABLED;
 process.env.CODAL_RECENT_INTERIM_ENABLED='1';
 try {
  const monthlyHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
  const feed=Array.from({length:10},(_,i)=>announcement(100-i,{code:'ن-۳۰',l18:'فولاد',
   title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',date_send:'1405/08/24',link_excel:`https://excel.invalid/${100-i}`}));
  const month=id=>({...stored(id),symbol:'فولاد',category:'ماهانه',report_code:'ن-۳۰',publish_date:'1405/08/24',
   title:'گزارش فعالیت ماهانه منتهی به 1405/06/31'});
  const interim=id=>({...stored(id),category:'صورت مالی',sent_date:'1405/08/24',
   title:'اطلاعات و صورت‌های مالی دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱'});
  const f=await fixture({pages:[[...feed,boundary],[]],storedRows:[month(30),month(29),month(28),interim(20),interim(19)],
   marketBody:[{payload:{stocks:[{id:'فولاد'},{id:'نمونه'}]}}],excelHtml:monthlyHtml,
   excelBodies:Object.fromEntries([20,19].map(id=>[`/service/Excel/GetAll/serial${id}/0`,industrial({period:'1405/06/31',months:6,prior:false})])),
   initialState:{watermark,fails:{}}});
  await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true,prioritizeRecentMonthly:true});
  assert.equal(f.engine.engineStatus.reportScope,'monthly_and_recent_interim');
  assert.equal(f.engine.engineStatus.feed.downloaded,5);
  assert.equal(f.engine.engineStatus.interimRecovery.inserted,2);
  assert.ok(f.engine.engineStatus.recentMonthlyRecovery.inserted>=2);
  assert.equal(f.calls.excel.length,10,'all families share the same existing file allocation');
  assert.ok(f.calls.reportWrites.flat().some(row=>row.report_kind==='ن-۱۰'));
  assert.ok(f.calls.reportWrites.flat().some(row=>row.report_kind==='ن-۳۰'));
  assert.equal(f.calls.feedWrites[0].rows.length,10,'deferred feed metadata remains durable');
 } finally { if(prior===undefined)delete process.env.CODAL_RECENT_INTERIM_ENABLED;else process.env.CODAL_RECENT_INTERIM_ENABLED=prior; }
});

test('recent interim environment opt-in rejects ambiguous values and respects explicit false', async t => {
 t.mock.method(Date,'now',()=>Date.parse('2026-11-15T15:30:00Z'));
 const prior=process.env.CODAL_RECENT_INTERIM_ENABLED;
 try {
  for(const [value,override] of [[undefined,{}],['0',{}],['true',{}],['1',{recentInterimReports:false}]]){
   if(value===undefined)delete process.env.CODAL_RECENT_INTERIM_ENABLED;else process.env.CODAL_RECENT_INTERIM_ENABLED=value;
   const f=await fixture({pages:[[{...financial(9),date_send:'1405/08/24',title:'صورت‌های مالی دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱'},boundary],[]]});
   await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true,prioritizeRecentMonthly:true,...override});
   assert.equal(f.engine.engineStatus.reportScope,'monthly_only');
   assert.deepEqual(f.calls.excel,[]);
  }
 } finally { if(prior===undefined)delete process.env.CODAL_RECENT_INTERIM_ENABLED;else process.env.CODAL_RECENT_INTERIM_ENABLED=prior; }
});

test('recent monthly recovery uses the verified publication date and shares the previous workbook cap', async t => {
 t.mock.method(Date,'now',()=>Date.parse("2026-11-15T16:30:00Z"));
 const month=(id,publish_date)=>({...stored(id),symbol:'فولاد',title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',
   report_code:'ن-۳۰',category:'ماهانه',publish_date});
 const recent=Array.from({length:8},(_,i)=>month(40-i,"۱۴۰۵/۰۸/۲۴"));
 const old=Array.from({length:9},(_,i)=>month(30-i,"۱۴۰۵/۰۶/۳۱"));
 const excelHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 const f=await fixture({pages:[[]],storedRows:[month(41,"۱۴۰۵/۰۸/۲۵"),...recent,...old],
   initialState:{watermark,fails:{},monthlyRecoveryCursor:'31'},excelHtml});
 await f.engine.runEngineCycle({monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true});
 assert.deepEqual(f.calls.excel,[40,39,38,37,36,35,34,30].map(id=>`/service/Excel/GetAll/serial${id}/0`));
 assert.equal(f.calls.pages.length,1);
 assert.equal(f.engine.engineStatus.recentMonthlyRecovery.inserted,7);
 assert.equal(f.engine.engineStatus.recentMonthlyRecovery.metadataSkipped,1);
 assert.equal(f.persisted.recentMonthlyRecoveryCursor,'34');
 assert.equal(f.persisted.monthlyRecoveryCursor,'30');
 const fallback=await fixture({pages:[[]],storedRows:old,initialState:{watermark,fails:{},monthlyRecoveryCursor:'31'},
   excelHtml,rejectMonthlyPublicationRead:true});
 await fallback.engine.runEngineCycle({monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true});
 assert.equal(fallback.engine.engineStatus.recentMonthlyRecovery.readFailed,true);
 assert.equal(fallback.engine.engineStatus.storedRecovery.inserted,8);
 assert.equal(fallback.calls.excel.length,8);
});

test('recent monthly recovery serves the head and resumes the saved sweep without a new notice', async t => {
 t.mock.method(Date,'now',()=>Date.parse('2026-11-15T16:30:00Z'));
 const month=(id,publish_date)=>({...stored(id),symbol:'فولاد',title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',
   report_code:'ن-۳۰',category:'ماهانه',publish_date});
 const recent=[50,49,37,36,35,34,33,32,31,30].map(id=>month(id,'۱۴۰۵/۰۸/۲۴'));
 const older=[25,24].map(id=>month(id,'۱۴۰۵/۰۶/۳۱'));
 const excelHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 const options={pages:[[]],storedRows:[...recent,...older],excelHtml,
  initialState:{watermark,fails:{},recentMonthlyRecoveryCursor:'38',monthlyRecoveryCursor:'26'}};
 const run={monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true};
 const f=await fixture(options);
 await f.engine.runEngineCycle(run);
 assert.deepEqual(f.calls.excel,[50,37,36,35,34,33,32,25].map(id=>`/service/Excel/GetAll/serial${id}/0`));
 assert.deepEqual(f.calls.storedPageSizes,[20,100,100]);
 assert.equal(f.engine.engineStatus.recentMonthlyRecovery.inserted,7);
 assert.equal(f.persisted.recentMonthlyRecoveryCursor,'32');
 assert.equal(f.persisted.monthlyRecoveryCursor,'25');
 const noHead=await fixture({...options,rejectMonthlyHeadRead:true});
 await noHead.engine.runEngineCycle(run);
 assert.equal(noHead.engine.engineStatus.recentMonthlyRecovery.readFailed,true);
 assert.deepEqual(noHead.calls.excel,[37,36,35,34,33,32,31,25].map(id=>`/service/Excel/GetAll/serial${id}/0`));
 assert.equal(noHead.persisted.recentMonthlyRecoveryCursor,'31');
});

test('recovery replays one previously rejected monthly file per corrected reader without rewinding the sweep',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-11-15T16:30:00Z'));
 const month=(id,fields={})=>({...stored(id),symbol:'فولاد',title:'گزارش فعالیت ماهانه منتهی به 1405/06/31',
  report_code:'ن-۳۰',category:'ماهانه',publish_date:'۱۴۰۵/۰۸/۲۴',...fields});
 const report=(id)=>month(id,{link:`https://codal.ir/Reports/Decision.aspx?LetterSerial=serial${id}&let=58&rt=0`});
 const repaired=report(70),rejected=report(69);
 const marker=`monthly-industrial-v1:${rejected.link}`;
 const excelPath=id=>`/service/Excel/GetAll/serial${id}/0`;
 const storedRows=[month(80),month(79),month(78),repaired,rejected,
  ...Array.from({length:16},(_,i)=>month(37-i)),...Array.from({length:5},(_,i)=>month(20-i,{publish_date:'۱۴۰۵/۰۶/۳۱'}))];
 const excelHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 const f=await fixture({pages:[[]],storedRows,excelHtml,exactWorkbookResponse:true,excelBodies:{[excelPath(69)]:'<h1>Unsupported</h1>'},
  initialState:{watermark,recentMonthlyRecoveryCursor:'38',monthlyRecoveryCursor:'21',fails:{[repaired.link]:1,[rejected.link]:1}}});
 const run={monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true};
 await f.engine.runEngineCycle(run);
 assert.deepEqual(f.calls.excel,[80,70,37,36,35,34,33,20].map(excelPath));
 assert.equal(f.persisted.recentMonthlyRecoveryCursor,'33');
 assert.equal(f.persisted.fails[repaired.link],undefined);
 await f.engine.runEngineCycle(run);
 assert.deepEqual(f.calls.excel.slice(8),[79,69,32,31,30,29,28,19].map(excelPath));
 assert.equal(f.persisted.fails[rejected.link],2);
 assert.equal(f.persisted.fails[marker],1);
 await f.engine.runEngineCycle(run);
 assert.equal(f.calls.excel.filter(path=>path===excelPath(69)).length,1);
 // The corrected decision reader uses an existing recovery slot instead of
 // rerequesting the rejected workbook or adding an extra file to the cycle.
 assert.deepEqual(f.calls.excel.slice(16),[78,27,26,25,24,23,18].map(excelPath));
 const decisionMarker='monthly-industrial-decision-v1:'+rejected.link;
 assert.equal(f.persisted.fails[decisionMarker],1);
 const failures=f.persisted.fails[rejected.link];
 await f.engine.runEngineCycle(run);
 assert.equal(f.persisted.fails[rejected.link],failures);
});

test('official monthly reconciliation fills a missing listed report through the existing recovery, preserving page and download bounds',async t=>{
 t.mock.method(Date,'now',()=>Date.parse("2026-11-15T16:30:00Z"));
 const title="گزارش فعالیت ماهانه منتهی به 1405/06/31";
 const official=(id,changes={})=>({TracingNo:id,Symbol:"فولاد",Title:title,CompanyName:"فولاد مبارکه",LetterCode:"ن-۳۰",
  Url:`/Reports/Decision.aspx?LetterSerial=official${id}&rt=0&let=58`,
  ExcelUrl:`https://excel.codal.ir/service/Excel/GetAll/official${id}/0`,
  SentDateTime:"1405/08/24 10:00:00",PublishDateTime:"1405/08/24 11:00:00",...changes});
 const expected=[official(3),official(2)];
 const excelHtml=readFileSync(new URL('./fixtures/folad-n30-primary.html',import.meta.url),'utf8');
 const f=await fixture({pages:[[]],marketBody:[{payload:{stocks:[{id:"فولاد"}]}}],excelHtml,exactWorkbookResponse:true,
   initialState:{watermark,fails:{},officialMonthlyNextPage:5,recentMonthlyRecoveryCursor:"10"},
   monthlyOfficialPages:{
     1:[expected[0],official(4,{Symbol:"خارج بازار"}),official(5,{LetterCode:"ن-۱۰"}),official(6,{ExcelUrl:null})],
     5:[expected[1]],
    ...Object.fromEntries([6,7,8,9,10,11].map(page=>[page,[official(20+page,{Symbol:'خارج بازار'})]])),
   }});
 await f.engine.runEngineCycle({monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true,officialMonthlyReconciliation:true});
 assert.deepEqual(f.officialPages,[1,5,6,7,8,9,10,11]);
 assert.deepEqual(f.calls.pages,[1]);
 assert.deepEqual(f.calls.feedWrites.flatMap(write=>write.rows.map(row=>row.link)),expected.map(x=>"https://codal.ir"+x.Url));
 assert.deepEqual(f.calls.excel,["/service/Excel/GetAll/official2/0","/service/Excel/GetAll/official3/0"]);
 assert.equal(f.calls.reportWrites.length,2);
 assert.deepEqual(f.engine.engineStatus.officialMonthlyDiscovery,{pages:8,matched:2,inserted:2,nextPage:12,failed:false});
 assert.equal(f.persisted.officialMonthlyNextPage,12);
 await f.engine.runEngineCycle({monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true,officialMonthlyReconciliation:true});
 assert.equal(f.officialPages.at(-1),12);
 assert.equal(f.persisted.officialMonthlyNextPage,12);
 assert.equal(f.engine.engineStatus.officialMonthlyDiscovery.failed,true);
});

test('the fast discovery cycle includes recent interim statements within the shared download allocation', async t => {
 t.mock.method(Date,'now',()=>Date.parse("2026-11-15T15:30:00Z"));
 const recent = (id, months) => ({
   ...financial(id), title:`اطلاعات و صورت‌های مالی دوره ${months} ماهه منتهی به ۱۴۰۵/۰۶/۳۱`,
   date_title:'1405/06/31', date_send:'1405/08/24',
 });
 const fund = {...recent(8,6),l18:'صندوق نمونه'};
 const options = {pages:[[fund,recent(7,12),recent(6,6),recent(5,6),recent(4,6),boundary],[]],
   marketBody:[{payload:{stocks:[{id:'نمونه'}],funds:[{id:fund.l18}]}}],
   excelHtml:industrial({period:'1405/06/31',months:6,prior:false})};
 const f = await fixture(options);
 await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true,recentInterimReports:true});
 assert.equal(f.engine.engineStatus.reportScope,"monthly_and_recent_interim");
 assert.deepEqual(f.calls.pages,[1,2]);
 assert.deepEqual(f.calls.excel,["/6","/5"]);
 assert.deepEqual(f.calls.reportWrites.map(rows=>rows[0].report_kind),["ن-۱۰","ن-۱۰"]);
 assert.equal(f.engine.engineStatus.feed.interimDownloads,2);
 assert.equal(f.calls.feedWrites[0].rows.length,5);
 assert.equal(f.calls.feedWrites[0].rows[0].symbol,fund.l18);
});

test('the official sweep repairs a conflicting industrial period once using only the validated publisher grid', async () => {
 const date = "1405/07/30";
 const today = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
   timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",
 }).format(new Date());
 const url = "/Reports/Decision.aspx?LetterSerial=repair1&rt=0&let=58";
 const link = "https://codal.ir" + url;
 const official = {TracingNo:1,Symbol:"نمونه",Title:`گزارش فعالیت ماهانه منتهی به ${date}`,
   CompanyName:"نمونه",LetterCode:"ن-۳۰",Url:url,ExcelUrl:"https://excel.codal.ir/service/Excel/GetAll/repair1/0",
   SentDateTime:`${today} 10:00:00`,PublishDateTime:`${today} 11:00:00`};
 const groups = {0:"شرح",13:`دوره یک ماهه منتهی به ${date}`,17:`از ابتدای سال مالی تا تاریخ ${date}`};
 const cols = {0:"نام محصول",1:"واحد",13:"تعداد تولید",14:"تعداد فروش",
   15:"نرخ فروش (ریال)",16:"مبلغ فروش (میلیون ریال)",20:"مبلغ فروش (میلیون ریال)"};
 const rows = [groups,cols,{0:"فروش داخلی:"},{0:"محصول",1:"دست",13:4,14:4,15:3000000,16:12,20:32},{0:"جمع",16:12,20:32}];
 const cells = rows.flatMap((row,index) => Object.entries(row).map(([column,value]) => ({
   address:String.fromCharCode(65+Number(column))+(index+1),rowSequence:index+1,columnSequence:Number(column)+1,
   isVisible:true,value,metaTableId:18,metaTableCode:1197,
 })));
 const table = {code:1197,metaTableId:18,sheetCode:1000000,aliasName:"ProductionAndSales",
   description:"کلیه مبالغ به میلیون ریال است",cells};
 const source = {type:58,period:1,periodEndToDate:date,tracingNo:1,isConsolidated:false,
   sheets:[{code:1000000,aliasName:"MonthlyActivity",tables:[table]}]};
 const html = `<form id="aspnetForm" action="">
   <span id="ctl00_lblReportName">گزارش فعالیت ماهانه</span>
   <span id="ctl00_lblPeriod">1 ماهه</span><span id="ctl00_txbSymbol">نمونه</span>
   <span id="ctl00_lblPeriodEndToDate">${date}</span><script>var datasource = ${JSON.stringify(source)};</script>
   </form>`;
 const old = {symbol:"نمونه",source_url:link+"#pv2",data:{period_end:"1405-07-01"}};
 const f = await fixture({pages:[[]],marketBody:[{payload:{stocks:[{id:"نمونه"}]}}],officialBody:html,
   initialReports:[old],monthlyOfficialPages:{1:[official],2:[]},initialState:{watermark,fails:{}}});
 const options = {monthlyOnly:true,allowBackground:false,prioritizeRecentMonthly:true,officialMonthlyReconciliation:true};
 await f.engine.runEngineCycle(options);
 assert.deepEqual(f.engine.engineStatus.officialMonthlyRepair,{attempted:1,inserted:1,failed:false});
 const repaired = f.calls.reportWrites[0][0];
 assert.equal(repaired.source_url,link+"#pv3");
 assert.equal(repaired.raw.parser_version,3);
 assert.equal(repaired.data.period_end,"1405-07-30");
 assert.equal(repaired.data.period_total_amount,12);
 assert.equal(repaired.data.fy_cumulative_amount,32);
 assert.equal(repaired.data.monthly_source.tracing_no,1);
 assert.deepEqual(f.calls.excel,[]);
 await f.engine.runEngineCycle(options);
 assert.deepEqual(f.engine.engineStatus.officialMonthlyRepair,{attempted:0,inserted:0,failed:false});
 assert.equal(f.calls.reportWrites.length,1);
});

test('interim recovery uses stored fresh announcements, with its own cursor and without annual or old downloads', async t => {
 t.mock.method(Date,'now',()=>Date.parse("2026-11-15T15:30:00Z"));
 const row = (id, months, sent_date) => ({
   ...stored(id), category:'صورت مالی', sent_date,
   title:`اطلاعات و صورت‌های مالی دوره ${months} ماهه منتهی به ۱۴۰۵/۰۶/۳۱`,
 });
 const f = await fixture({pages:[[]],storedPageSize:3,
   storedRows:[{...row(10,6,"1405/08/24"),symbol:'خارج از بازار'},row(9,12,"1405/08/24"),row(8,6,"1405/06/31"),row(7,6,"1405/08/24"),row(6,6,"1405/08/25")],
   marketBody:[{payload:{stocks:[{id:'نمونه'}]}}],
   excelHtml:industrial({period:'1405/06/31',months:6,prior:false}),
   initialState:{watermark,fails:{},storedFeedCursor:'2',monthlyRecoveryCursor:'5'}});
 await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true,recentInterimReports:true});
 assert.deepEqual(f.calls.excel,["/service/Excel/GetAll/serial7/0"]);
 assert.deepEqual(f.calls.storedCategories,["eq.ماهانه","eq.صورت مالی","eq.صورت مالی"]);
 assert.deepEqual(f.calls.storedDates,[null,"gte.2026-10-11T15:30:00.000Z","gte.2026-10-11T15:30:00.000Z"]);
 assert.equal(f.persisted.storedFeedCursor,'2');
 assert.equal(f.persisted.interimRecoveryCursor,'6');
 assert.equal(f.engine.engineStatus.interimRecovery.inserted,1);
});

test('an unavailable stock roster defers interim recovery and leaves announcements available', async t => {
 t.mock.method(Date,'now',()=>Date.parse("2026-11-15T15:30:00Z"));
 const recent={...financial(5),title:'اطلاعات و صورت‌های مالی دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱',date_send:'1405/08/24'};
 const f=await fixture({pages:[[recent,boundary]],marketStatus:503,
   initialState:{watermark,fails:{},interimRecoveryCursor:'16'}});
 await f.engine.runEngineCycle({allowBackground:false,monthlyOnly:true,recentInterimReports:true});
 assert.deepEqual(f.calls.feedWrites[0].rows.map(row=>row.link),[recent.link]);
 assert.deepEqual(f.calls.excel,[]);
 assert.equal(f.persisted.interimRecoveryCursor,'16');
 assert.match(f.engine.engineStatus.lastError,/stock roster unavailable/);
});

test('publisher challenge keeps discovery available while file reads and archive remain paused', async () => {
 const a=financial(2);
 const f=await fixture({pages:[[a,boundary],[]],excelHtml:'<h1>تأیید کاربر</h1><img id="captchaImage"><input id="captchaCode">کد امنیتی'});
 await f.engine.runEngineCycle();
 assert.equal(f.calls.excel.length,1);
 assert.equal(f.engine.engineStatus.ok,false);
 assert.match(f.engine.engineStatus.lastError,/codal_source_challenge/);
 assert.deepEqual(f.persisted.fails,{});
 assert.deepEqual(f.persisted.watermark,watermark);
 assert.ok(f.persisted.sourceHoldUntil>Date.now());
 const newer=financial(3);
 const resumed=await fixture({initialState:f.persisted,pages:[[newer,a,boundary],[]]});
 await resumed.engine.runEngineCycle();
 assert.equal(resumed.budgetJobs.length,1);
 assert.deepEqual(resumed.calls.feedWrites[0].rows.map(row=>row.link),[newer.link]);
 assert.equal(resumed.calls.excel.length,0);
 assert.deepEqual(resumed.persisted.watermark,watermark);
 assert.deepEqual(resumed.persisted.metadataWatermark.links,[newer.link]);
 await resumed.engine.runEngineCycle();
 assert.equal(resumed.calls.feedWrites.length,1);
 assert.equal(resumed.calls.excel.length,0);
 const beforeArchive=resumed.budgetJobs.length;
 const archive=await import(`./codal-archive.mjs?mock=${++scenario}`);
 await archive.runArchiveCycle();
 assert.equal(resumed.budgetJobs.length,beforeArchive);
 assert.equal(archive.archiveStatus.lastError,'codal_source_challenge');
 assert.equal(resumed.calls.archiveSaves.at(-1).sourceHoldUntil,f.persisted.sourceHoldUntil);
});

test('published service decision checks both declared columns and their totals', async () => {
 const {readServiceDecisionRows}=await import('./codal.mjs');
 const date='1405/07/30';
 const cells=(columns)=>Object.assign(Array(10).fill(''),columns);
 const rows=[cells({0:'شرح خدمات یا فروش',3:'درآمد شناسایی شده'}),
  cells({6:'درآمد شناساسی شده طی دوره یک ماهه منتهی به '+date,7:'درآمد شناساسی شده از اول سال مالی تا پایان دوره مالی منتهی به '+date}),
  cells({0:'خدمات',6:'۸',7:'۱۲'}),cells({6:'0',7:'0'}),cells({0:'جمع',6:'8',7:'12'})];
 assert.deepEqual(readServiceDecisionRows(rows,'1405-07-30'),{amount:8,cumulative:12});
 assert.equal(readServiceDecisionRows(rows,'1405-06-31'),null);
 for(const invalid of ['', '9.9','19']){
  const bad=structuredClone(rows);bad[2][6]=invalid;
  assert.equal(readServiceDecisionRows(bad,'1405-07-30'),null);
 }
 const unnamed=structuredClone(rows);unnamed[2][0]='';assert.equal(readServiceDecisionRows(unnamed,'1405-07-30'),null);
});

test('decision income and premiums require exact period, measure, unit and arithmetic',async()=>{
 const {readEstateDecision,readInsuranceDecision}=await import('./codal.mjs');
 const cells=(values)=>Object.assign(Array(19).fill(''),values);
 const date='1405/07/30',end='1405-07-30',premium='حق بیمه صادره (شامل قبولی اتکایی)',unit='مبلغ (میلیون ریال)';
 const estate=[cells({0:'شرح',4:'درآمد محقق شده طی دوره یک ماهه منتهی به '+date,5:'جمع درآمد محقق شده از ابتدای سال مالی تا '+date}),
  cells({0:'فروش',4:'12',5:'20'}),cells({0:'جمع',4:'12',5:'20'})];
 assert.deepEqual(readEstateDecision(estate,end),{amount:12,cumulative:20});
 estate[1][4]='';assert.equal(readEstateDecision(estate,end),null);
 const insurance=[cells({11:'دوره یک ماهه منتهی به '+date,15:'از ابتدای سال مالی تا پایان مورخ '+date}),
  cells({11:premium,15:premium}),cells({11:unit,15:unit}),cells({0:'آتش سوزی',11:'7',15:'11'}),cells({0:'جمع',11:'7',15:'11'})];
 assert.deepEqual(readInsuranceDecision(insurance,end),{amount:7,cumulative:11});
 assert.equal(readInsuranceDecision(insurance,'1405-06-31'),null);
 for(const [i,j,value] of [[1,11,'خسارت پرداختی'],[2,15,'درصد'],[4,15,'20']]){
  const bad=structuredClone(insurance);bad[i][j]=value;assert.equal(readInsuranceDecision(bad,end),null);
 }
});
