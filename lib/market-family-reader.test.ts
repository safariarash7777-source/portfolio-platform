import { test } from "node:test";
import assert from "node:assert/strict";
import { iranReadQuality, parseSnapshotQuality } from "./market-quality";
import { toMarket } from "./market-ir";

const start = Date.parse("2026-10-06T08:30:00Z");
const keys = ["gold", "currency", "stocks", "funds", "options", "crypto", "indices"];
const stock = { id: "synthetic-stock", faName: "نمونه", price: 100, unit: "toman", sourceDate: "1405-07-14", sourceTime: "12:00:00" };
const option = { id: "synthetic-option", faName: "اختیار آزمایشی", baseId: "نمونه", type: "call", price: 250, priceUnit: "toman", value: 1000, valueUnit: "rial", sourceDate: "1405-07-14", sourceTime: "12:00:00" };
function payload(at = start) {
  return { gold: [], currency: [], stocks: [stock], funds: [], options: [option], crypto: [], indices: { total: 100, date: stock.sourceDate, time: stock.sourceTime }, fetchedAt: at,
    snapshotQuality: { version: 1, state: "complete", attemptedAt: at, families: Object.fromEntries(keys.map(key => [key, { state: ["stocks", "options", "indices"].includes(key) ? "received" : "empty", receivedAt: at, retained: false }])) } };
}

test("parser allowlists metadata and never exports raw error text or auxiliary credentials", () => {
  const p = payload();
  const parsed = parseSnapshotQuality({ ...p.snapshotQuality, secret: "synthetic", families: { ...p.snapshotQuality.families, stocks: { state: "stale", receivedAt: start, error: "private URL", secret: "synthetic" } } });
  assert.equal(parsed?.families.stocks?.retained, true);
  assert.doesNotMatch(JSON.stringify(parsed), /secret|private URL/);
  for (const value of [null, [], { version: 2 }, { ...p.snapshotQuality, families: [] }]) assert.equal(parseSnapshotQuality(value), null);
});

test("healthy → partial → recovery: retained stocks stay stale and successful options ignore the old global receipt", () => {
  const p = payload();
  assert.equal(iranReadQuality(toMarket(p), start).state, "ready");
  p.fetchedAt = start - 3600000;
  p.snapshotQuality.state = "partial";
  p.snapshotQuality.families.stocks = { state: "stale", receivedAt: start - 3600000, retained: true };
  const parsed = toMarket(p), q = iranReadQuality(parsed, start);
  assert.equal(q.state, "partial"); assert.equal(q.families.stocks.state, "stale");
  assert.equal(q.families.stocks.receivedAt, start - 3600000);
  assert.equal(q.families.options.state, "ready"); assert.equal(q.families.options.receivedAt, start);
  assert.equal(q.families.options.validAt, start);
  assert.equal(parsed.options.length, 1); assert.equal(parsed.options[0].valueUnit, "rial");
  assert.deepEqual(parsed.stocks[0].sourceTime, stock.sourceTime);
  const recovered = iranReadQuality(toMarket(payload(start + 61000)), start + 61000);
  assert.equal(recovered.state, "ready"); assert.equal(recovered.families.stocks.retained, false);
});

test("missing, future and invalid family receipt clocks never borrow a fresh global clock", () => {
  for (const receivedAt of [null, undefined, start + 3600000, "fresh"]) {
    const p = payload(); p.snapshotQuality.families.options.receivedAt = receivedAt as number;
    const q = iranReadQuality(toMarket(p), start);
    assert.equal(q.families.options.receivedAt, null); assert.equal(q.families.options.state, "unknown-time");
  }
  const p = payload(); delete p.snapshotQuality.families.options;
  assert.equal(iranReadQuality(toMarket(p), start).families.options.state, "unknown-time");
});

test("fresh receipt cannot replace an unknown option source clock; stale/unavailable cannot claim ready", () => {
  const p = payload(); p.options = [{ ...option, sourceTime: null as unknown as string }];
  const q = iranReadQuality(toMarket(p), start);
  assert.equal(q.families.options.state, "unknown-time"); assert.equal(q.families.options.validAt, null);
  for (const state of ["stale", "unavailable"]) {
    const raw = payload(); raw.snapshotQuality.families.options.state = state;
    assert.equal(iranReadQuality(toMarket(raw), start).families.options.state, state);
  }
});

test("legacy uses its original clock conservatively; malformed metadata does not enable freshness", () => {
  const p = payload();
  const legacy = { ...p, fetchedAt: start - 3600000, snapshotQuality: undefined };
  assert.equal(iranReadQuality(toMarket(legacy), start).families.options.state, "stale");
  assert.equal(iranReadQuality(toMarket({ ...legacy, fetchedAt: null }), start).families.options.state, "unknown-time");
  const q = iranReadQuality(toMarket({ ...p, snapshotQuality: { version: 9 } }), start);
  assert.equal(q.state, "unknown-time"); assert.equal(q.families.options.receivedAt, null);
});

test("authoritative all-empty is distinct from absence/error and top-level error cannot claim fresh families", () => {
  const p = { ...payload(), stocks: [], options: [], indices: null, snapshotQuality: { version: 1, state: "complete", families: Object.fromEntries(keys.map(k => [k, { state: "empty", receivedAt: start }])) } };
  const m = toMarket(p), q = iranReadQuality(m, start);
  assert.equal(m.ok, true); assert.equal(q.state, "empty"); assert.equal(q.families.options.state, "empty");
  const failed = payload(); failed.snapshotQuality.state = "error";
  assert.equal(iranReadQuality(toMarket(failed), start).families.options.state, "stale");
});

test("empty metadata without an actually empty raw family cannot certify authoritative emptiness", () => {
  for (const options of [undefined, {}, [{ id: "bad-option" }]]) {
    const p = payload(); p.snapshotQuality.families.options.state = "empty";
    const q = iranReadQuality(toMarket({ ...p, options }), start);
    assert.notEqual(q.families.options.state, "empty"); assert.equal(q.families.options.receivedAt, null);
  }
});

test("actual bounded DB reader preserves per-family metadata, accepts empty without fallback, and marks timeout cache stale", async () => {
  const originalFetch = fetch, originalNow = Date.now;
  const envKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "IR_MARKET_RELAY_URL", "IR_MARKET_RELAY_TOKEN"];
  const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  let now = start, raw: Record<string, unknown> = payload(), mode = "ready", requests = 0;
  Date.now = () => now;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
  delete process.env.IR_MARKET_RELAY_URL; delete process.env.IR_MARKET_RELAY_TOKEN;
  globalThis.fetch = (async input => {
    requests++;
    assert.equal(new URL(String(input)).hostname, "synthetic.invalid");
    if (mode === "timeout") return new Promise<Response>(() => {});
    return Response.json([{ payload: raw }]);
  }) as typeof fetch;
  try {
    // The global-market module imports server-only; use Next's test alias, as in existing reader tests.
    const { createRequire, default: Module } = await import("node:module");
    const require = createRequire(import.meta.url);
    const resolver = Module as unknown as { _resolveFilename: (specifier: string, ...args: unknown[]) => string };
    const originalResolve = resolver._resolveFilename;
    resolver._resolveFilename = function(specifier, ...args) { return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : originalResolve.call(this, specifier, ...args); };
    let readIranMarket: typeof import("./market-bounded").readIranMarket;
    try { ({ readIranMarket } = await import("./market-bounded")); } finally { resolver._resolveFilename = originalResolve; }
    assert.equal((await readIranMarket()).availability.families?.stocks.state, "ready");
    now += 61000;
    const partial = payload(now); partial.fetchedAt = start - 3600000; partial.snapshotQuality.state = "partial";
    partial.snapshotQuality.families.stocks = { state: "stale", receivedAt: start - 3600000, retained: true };
    raw = partial;
    const mixed = await readIranMarket();
    assert.equal(mixed.availability.state, "partial"); assert.equal(mixed.availability.families?.options.state, "ready");
    assert.equal(mixed.availability.families?.options.receivedAt, now); assert.equal(mixed.data?.options[0].price, 250);
    now += 61000; raw = payload(now);
    assert.equal((await readIranMarket()).availability.families?.stocks.state, "ready");
    now += 61000;
    const noOptions = payload(now); noOptions.options = [];
    noOptions.snapshotQuality.families.options = { state: "empty", receivedAt: now, retained: false };
    raw = noOptions;
    const empty = await readIranMarket();
    assert.equal(empty.data?.options.length, 0); assert.equal(empty.availability.families?.options.state, "empty");
    now += 61000;
    raw = { gold: [], currency: [], stocks: [], funds: [], crypto: [], options: [], indices: null, fetchedAt: now,
      snapshotQuality: { version: 1, state: "partial", families: Object.fromEntries(keys.map(key => [key, { state: key === "options" ? "empty" : "unavailable", receivedAt: key === "options" ? now : null }])) } };
    const authoritative = await readIranMarket();
    assert.equal(authoritative.data?.stocks.length, 0, "does not resurrect cached stock rows for authoritative partial emptiness");
    assert.equal(authoritative.availability.families?.options.state, "empty"); assert.equal(authoritative.availability.state, "partial");
    now += 61000; raw = { ...payload(now), options: [{ ...option, sourceTime: null }] };
    assert.equal((await readIranMarket()).availability.families?.options.state, "unknown-time");
    now += 61000; mode = "timeout";
    const previous = raw.snapshotQuality as ReturnType<typeof payload>["snapshotQuality"];
    const timedOut = await readIranMarket();
    assert.equal(timedOut.availability.state, "stale"); assert.equal(timedOut.availability.reason, "read-timeout");
    assert.equal(timedOut.availability.families?.options.state, "stale");
    assert.equal(timedOut.availability.families?.options.receivedAt, previous.families.options.receivedAt);
    assert.equal(timedOut.availability.families?.options.validAt, null); assert.equal(timedOut.data?.options.length, 1);
    const before = requests; await readIranMarket(); assert.equal(requests, before, "timeout cooldown prevents retry traffic");
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    for (const k of envKeys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
