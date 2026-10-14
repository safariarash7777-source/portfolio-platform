import test from "node:test";
import assert from "node:assert/strict";
import { mapCommodityRow, parseCommodityResponse } from "./commodity.mjs";

const row = (symbol = "TEST", extra = {}) => ({ symbol, name: "Synthetic", price: "12.5", change_percent: null,
  change_value: "0", unit: "source-unit", date: "1405/07/22", time: "12:30", time_unix: 1791968400, ...extra });
const grouped = () => ({ metal_precious: [row()], metal_base: [row("BASE", { price: null })], energy: [] });
let nonce = 0;
async function fresh(env = {}) {
  const names = ["BRSAPI_COMMODITY_KEY", "BRSAPI_COMMODITY_ENABLED", "BRSAPI_KEY", "BRSAPI_COMMODITY_BASE", "BRSAPI_COMMODITY_DAILY_CAP"];
  const saved = names.map(name => [name, process.env[name]]);
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, env);
    return await import(`./commodity.mjs?test=${nonce++}`);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test("commodity missing or nonnumeric provider fields remain null", () => {
  for (const value of [null, undefined, "", "  ", false, true, [], [12], {}, NaN, Infinity, "NaN"]) {
    const row = mapCommodityRow({ symbol: "TEST", price: value, change_percent: value });
    assert.equal(row.price, null, `price ${JSON.stringify(value)}`);
    assert.equal(row.changePercent, null, `change ${JSON.stringify(value)}`);
  }
});

test("commodity legitimate zero, signed changes and decimal strings retain source units", () => {
  for (const [value, expected] of [[0, 0], ["0", 0], [" 123.45 ", 123.45], [-1.2, -1.2]]) {
    const row = mapCommodityRow({ symbol: "TEST", price: value, change_percent: value, unit: "USD/oz" });
    assert.equal(row.price, expected);
    assert.equal(row.changePercent, expected);
    assert.equal(row.unit, "USD/oz");
  }
});

test("documented grouped contract retains categories, nullable fields and all source clocks/units", () => {
  const result = parseCommodityResponse(grouped());
  assert.deepEqual(result[0], { id: "TEST", name: "Synthetic", price: 12.5, changePercent: null,
    changeValue: 0, unit: "source-unit", date: "1405/07/22", time: "12:30", timeUnix: 1791968400, group: "metal_precious" });
  assert.equal(result[1].price, null);
  assert.equal(result[1].group, "metal_base");
  for (const value of [null, "", false, {}, -1, 1.5, Infinity]) assert.equal(mapCommodityRow(row("X", { time_unix: value })).timeUnix, null);
  assert.equal(mapCommodityRow(row("X", { date: null, time: null, unit: null })).unit, null);
});

test("malformed, missing-group, duplicate and empty batches are rejected atomically", () => {
  for (const payload of [null, [], [row()], { data: [row()] }, { metal_precious: [row()] },
    { ...grouped(), energy: {} }, { ...grouped(), energy: [null] }, { ...grouped(), energy: [row(" ")] },
    { ...grouped(), energy: [row()] }, { metal_precious: [], metal_base: [], energy: [] },
    { metal_precious: [row("X", { price: null })], metal_base: [], energy: [] }]) {
    assert.throws(() => parseCommodityResponse(payload), /commodity/);
  }
});

test("existing account key does not implicitly enable the feed", async () => {
  const mod = await fresh({ BRSAPI_KEY: "synthetic-main" });
  let calls = 0;
  await mod.refreshCommodities({}, { client: { request: () => { calls++; throw new Error("must not call"); } } });
  assert.equal(calls, 0);
  assert.equal(mod.commodityStatus().enabled, false);
  assert.equal(mod.commodityStatus().reqToday, 0);
});

test("explicit activation reuses the account key; explicit key and disable remain supported", async () => {
  const reuse = await fresh({ BRSAPI_COMMODITY_ENABLED: "1", BRSAPI_KEY: "synthetic-main" });
  assert.deepEqual(reuse.commodityConfig(), { enabled: true, base: "https://Api.BrsApi.ir", key: "synthetic-main" });
  const explicit = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic-explicit", BRSAPI_KEY: "synthetic-main", BRSAPI_COMMODITY_ENABLED: "1", BRSAPI_COMMODITY_BASE: "https://example.invalid/" });
  assert.deepEqual(explicit.commodityConfig(), { enabled: true, base: "https://example.invalid", key: "synthetic-explicit" });
  const off = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic-explicit", BRSAPI_COMMODITY_ENABLED: "0" });
  assert.equal(off.commodityStatus().enabled, false);
  const missing = await fresh({ BRSAPI_COMMODITY_ENABLED: "1" });
  assert.equal(missing.commodityStatus().enabled, false);
});

test("legacy fetch uses documented endpoint and shared transport with one metered attempt", async t => {
  const mod = await fresh({ BRSAPI_KEY: "synthetic/key?", BRSAPI_COMMODITY_ENABLED: "1" });
  let calls = 0, metered = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.brsapi.ir");
    assert.equal(parsed.pathname, "/Market/Commodity.php");
    assert.equal(parsed.searchParams.get("key"), "synthetic/key?");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["User-Agent"], "synthetic-browser");
    return { ok: true, json: async () => grouped() };
  });
  await mod.refreshCommodities({ "User-Agent": "synthetic-browser" }, { countLegacy: async () => { metered++; } });
  assert.equal(calls, 1); assert.equal(metered, 1);
  assert.equal(mod.commodityStatus().reqToday, 1);
  assert.equal(mod.commodityStatus().rows, 2);
  assert.equal(mod.commodityStatus().lastError, null);
});

test("singleflight shares an in-progress request and quota reservation", async () => {
  const mod = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic" });
  let resolve, calls = 0;
  const client = { request: () => { calls++; return new Promise(done => { resolve = done; }); } };
  const a = mod.refreshCommodities({}, { client }), b = mod.refreshCommodities({}, { client });
  assert.equal(a, b); assert.equal(calls, 1); assert.equal(mod.commodityStatus().reqToday, 1);
  resolve(grouped()); await a;
  assert.equal(mod.commodityStatus().rows, 2);
});

test("invalid/source-failed cycles preserve good rows and original receipt without leaking keys", async () => {
  const mod = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic-secret" });
  await mod.refreshCommodities({}, { client: { request: async () => grouped() } });
  const previous = structuredClone(mod.commoditiesForPayload()), receipt = mod.commodityStatus().lastFetchAt;
  for (const payload of [{ error: "provider" }, { ...grouped(), energy: [null] }, { metal_precious: [], metal_base: [], energy: [] }]) {
    await mod.refreshCommodities({}, { client: { request: async () => payload } });
    assert.deepEqual(mod.commoditiesForPayload(), previous);
    assert.equal(mod.commodityStatus().lastFetchAt, receipt);
    assert.ok(mod.commodityStatus().lastError);
  }
  await mod.refreshCommodities({}, { client: { request: async () => { throw new Error("https://example.invalid?key=synthetic-secret"); } } });
  assert.deepEqual(mod.commoditiesForPayload(), previous);
  assert.equal(mod.commodityStatus().lastFetchAt, receipt);
  assert.equal(mod.commodityStatus().lastError, "commodity request failed");
  assert.equal(JSON.stringify(mod.commodityStatus()).includes("synthetic-secret"), false);
});

test("local daily cap stops calls and cannot be configured above 300", async () => {
  for (const [configured, cap] of [[undefined, 300], ["9999", 300], ["2", 2], ["0", 0], ["bad", 0]]) {
    const mod = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic", ...(configured === undefined ? {} : { BRSAPI_COMMODITY_DAILY_CAP: configured }) });
    let calls = 0;
    const client = { request: async () => { calls++; return grouped(); } };
    for (let i = 0; i < cap + 2; i++) await mod.refreshCommodities({}, { client });
    assert.equal(calls, cap); assert.equal(mod.commodityStatus().reqToday, cap);
    assert.equal(mod.commodityStatus().dailyCap, cap); assert.equal(mod.commodityStatus().remaining, 0);
    assert.equal(mod.commodityStatus().lastError, "commodity daily cap reached");
  }
});

test("local allowance resets only for the next Tehran calendar day", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T20:29:00Z") });
  const mod = await fresh({ BRSAPI_COMMODITY_KEY: "synthetic", BRSAPI_COMMODITY_DAILY_CAP: "1" });
  let calls = 0;
  const client = { request: async () => { calls++; return grouped(); } };
  await mod.refreshCommodities({}, { client }); await mod.refreshCommodities({}, { client });
  assert.equal(calls, 1);
  t.mock.timers.tick(60_001);
  await mod.refreshCommodities({}, { client });
  assert.equal(calls, 2); assert.equal(mod.commodityStatus().reqToday, 1);
  assert.equal(mod.commodityStatus().dayKey, "2026-10-14");
});
