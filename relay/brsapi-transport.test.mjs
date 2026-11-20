import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBrsTransport } from "./brsapi-transport.mjs";

test("real timers enforce spacing across simultaneous calls without contacting the provider", async () => {
  const starts = [];
  const t = createBrsTransport({ fetchImpl: async () => { starts.push(performance.now()); return {}; } });
  await Promise.all(Array.from({ length: 5 }, () => t.fetch("https://api.brsapi.ir/fixture")));
  assert.equal(starts.length, 5);
  assert.ok(starts.slice(1).every((v, i) => v - starts[i] >= 100));
});

test("parallel sources, retries and event-loop stalls cannot burst", async () => {
  let clock = 0;
  const starts = [];
  const t = createBrsTransport({ now: () => clock,
    sleep: async ms => { clock += ms + 500; },
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "error");
      starts.push(clock);
      clock += 20;
      if (starts.length === 2) throw new Error("network failure");
      return { ok: true };
    } });
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
    t.fetch(`https://api.brsapi.ir/${i}`)));
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  assert.equal(starts.length, 20);
  assert.ok(starts.slice(1).every((v, i) => v - starts[i] >= 120));
  assert.equal(t.metrics().sent, 20);
});

test("early timer wakeups recheck the clock; cancelled requests are never sent", async () => {
  let clock = 0, sends = 0;
  const t = createBrsTransport({ now: () => clock, sleep: async ms => { clock += Math.max(1, ms / 2); },
    fetchImpl: async () => { sends++; return {}; } });
  await t.fetch("https://brsapi.ir/Api/first");
  const abort = new AbortController(); abort.abort();
  await assert.rejects(t.fetch("https://brsapi.ir/Api/cancelled", { signal: abort.signal }));
  await t.fetch("https://brsapi.ir/Api/last");
  assert.equal(sends, 2);
  assert.ok(t.metrics().minStartGapMs >= 100);
});

test("Supabase bypasses a blocked provider queue; configured provider hosts join it", async () => {
  let release;
  const t = createBrsTransport({ extraBases: ["https://provider.example/Api"],
    fetchImpl: async url => url.includes("provider.example") ? new Promise(r => { release = r; }) : "db" });
  const request = t.fetch("https://provider.example/Api/feed");
  await Promise.resolve();
  assert.equal(await t.fetch("https://db.example/rest/v1/data"), "db");
  assert.equal(t.metrics().sent, 1);
  release({}); await request;
});

test("all production BrsApi producers use the shared transport even when client flag is off", () => {
  for (const name of ["server", "options", "commodity", "ime", "codal", "candle-backfill", "symbol-detail"]) {
    assert.match(readFileSync(new URL(`./${name}.mjs`, import.meta.url), "utf8"), /import \{ brsFetch as fetch \} from "\.\/brsapi-transport.mjs"/);
  }
  assert.match(readFileSync(new URL("./brsapi-client.mjs", import.meta.url), "utf8"), /o.fetchImpl \|\| brsFetch/);
});
