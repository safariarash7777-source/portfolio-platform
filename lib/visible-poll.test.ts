import { test } from "node:test";
import assert from "node:assert/strict";
import { startVisiblePoll, type PollEnvironment } from "./visible-poll";

function fixture() {
  let time = 0, visible = true, timer = () => {}, resume = () => {}, removed = 0;
  const environment: PollEnvironment = {
    available: () => visible, now: () => time,
    every: callback => { timer = callback; return () => { removed++; }; },
    onResume: callback => { resume = callback; return () => { removed++; }; },
  };
  return { environment, advance: (ms: number) => { time += ms; timer(); }, resume: () => resume(), hide: () => { visible = false; }, show: () => { visible = true; resume(); }, removed: () => removed };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("visible polling pauses, resumes only when due and cleans up", async () => {
  const f = fixture(); let reads = 0;
  const stop = startVisiblePoll(() => { reads++; }, f.environment);
  await flush(); assert.equal(reads, 0);
  f.advance(60_000); await flush(); assert.equal(reads, 1);
  f.hide(); f.advance(120_000); await flush(); assert.equal(reads, 1);
  f.show(); await flush(); assert.equal(reads, 2);
  f.resume(); await flush(); assert.equal(reads, 2);
  stop(); assert.equal(f.removed(), 2);
  f.advance(60_000); f.resume(); await flush(); assert.equal(reads, 2);
});

test("slow requests do not overlap; unmount aborts an active request", async () => {
  const f = fixture(); let reads = 0; let signal: AbortSignal | undefined;
  const stop = startVisiblePoll(s => { reads++; signal = s; return new Promise(() => {}); }, f.environment, 60_000, true);
  await flush(); f.advance(120_000); f.resume(); await flush();
  assert.equal(reads, 1); assert.equal(signal?.aborted, false);
  stop(); assert.equal(signal?.aborted, true);
});

test("failed reads retry at the next interval, without a retry burst", async () => {
  const f = fixture(); let reads = 0;
  const stop = startVisiblePoll(() => { reads++; throw new Error("synthetic failure"); }, f.environment, 60_000, true);
  await flush(); f.resume(); await flush(); assert.equal(reads, 1);
  f.advance(60_000); await flush(); assert.equal(reads, 2); stop();
});
