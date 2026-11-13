// Conservative unverified-plan policy shared by all provider hosts/keys here.
// This does not coordinate other processes. Unknown prior-window usage requires
// a full cold-start window before the first provider send.
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export function createBrsTransport({ fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => performance.now(), sleep = delay, extraBases = [] } = {}) {
  const hosts = new Set(extraBases.filter(Boolean).map(base => new URL(base).hostname.toLowerCase()));
  let tail = Promise.resolve(), next = 0, pending = 0, sent = 0, last = null, minGap = null;
  let previousClock = null, invalidClock = false;
  const starts = [];
  const failure = code => Object.assign(new Error(code), { code });
  function clock() {
    const value = now();
    if (!Number.isFinite(value) || value < 0 || (previousClock !== null && value < previousClock)) invalidClock = true;
    if (invalidClock) throw failure('brs_transport_clock_invalid');
    previousClock = value;
    return value;
  }
  function checkAbort(signal) {
    if (signal?.aborted) throw failure('brs_transport_aborted');
  }
  const coldStartAt = clock();
  async function waitUntilReady(signal) {
    for (;;) {
      checkAbort(signal);
      const remaining = coldStartAt + 300000 - clock();
      if (remaining <= 0) return;
      try { await sleep(Math.ceil(remaining), undefined, { signal }); }
      catch { checkAbort(signal); throw failure('brs_transport_wait_failed'); }
    }
  }
  function earliestStart(at) {
    while (starts.length && starts[0] <= at - 300000) starts.shift();
    const recent = starts.filter(start => start > at - 1000);
    return Math.max(next, coldStartAt + 300000,
      starts.length >= 300 ? starts[0] + 300000 : at,
      recent.length >= 20 ? recent[0] + 1000 : at);
  }
  function isProvider(input) {
    const host = new URL(input instanceof Request ? input.url : input).hostname.toLowerCase();
    return host === "brsapi.ir" || host.endsWith(".brsapi.ir") || hosts.has(host);
  }
  function fetch(input, init) {
    if (!isProvider(input)) return fetchImpl(input, init);
    if (pending >= 256) return Promise.reject(failure('brs_transport_queue_full'));
    pending++;
    const run = tail.then(async () => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      checkAbort(signal);
      let start;
      for (;;) {
        const at = clock();
        const earliest = earliestStart(at);
        checkAbort(signal);
        if (at >= earliest) { start = at; break; }
        try { await sleep(Math.ceil(earliest - at), undefined, { signal }); }
        catch { checkAbort(signal); throw failure('brs_transport_wait_failed'); }
      }
      // No await between final admission, accounting and actual fetch invocation.
      checkAbort(signal);
      starts.push(start);
      if (last !== null) minGap = Math.min(minGap ?? Infinity, start - last);
      last = start;
      sent++;
      try {
        // Redirects could create unpaced requests inside fetch; reject them.
        return await fetchImpl(input, { ...init, redirect: "error" });
      } finally {
        next = clock() + 300;
      }
    });
    tail = run.then(() => {}, () => {}).finally(() => { pending--; });
    return run;
  }
  return { fetch, waitUntilReady, metrics: () => ({ enabled: true, scope: 'process', spacingMs: 300,
    rollingWindowMs: 300000, rollingLimit: 300, ipWindowMs: 1000, ipLimit: 20,
    policy: 'conservative_unverified_plan', windowScope: 'process_lifetime',
    priorProcessWindow: 'unknown', coldStartPolicy: 'full_window_defer', globalEnforced: false,
    clockValid: !invalidClock, pending, sent, minStartGapMs: minGap }) };
}

const transport = createBrsTransport({ extraBases: [process.env.BRSAPI_BASE, process.env.BRSAPI_COMMODITY_BASE] });
export const brsFetch = transport.fetch;
export const brsTransportMetrics = transport.metrics;
export const waitForBrsReadiness = transport.waitUntilReady;
export { isBrsLocalDeferral } from './brsapi-policy.mjs';
