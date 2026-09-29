// Mandatory transport for both legacy producers and the optional budget client.
// Provider warning 2026-09-29: >=50ms BETWEEN requests, not an average rate.
// Wait 100ms after response headers/failure, so simultaneous producers, retries
// and event-loop stalls cannot bunch scheduled starts together. One process only.
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export function createBrsTransport({ fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => performance.now(), sleep = delay, extraBases = [] } = {}) {
  const hosts = new Set(extraBases.filter(Boolean).map(base => new URL(base).hostname.toLowerCase()));
  let tail = Promise.resolve(), next = 0, pending = 0, sent = 0, last = null, minGap = null;
  function isProvider(input) {
    const host = new URL(input instanceof Request ? input.url : input).hostname.toLowerCase();
    return host === "brsapi.ir" || host.endsWith(".brsapi.ir") || hosts.has(host);
  }
  function fetch(input, init) {
    if (!isProvider(input)) return fetchImpl(input, init);
    if (pending >= 256) return Promise.reject(new Error("BrsApi transport queue full"));
    pending++;
    const run = tail.then(async () => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      signal?.throwIfAborted();
      while (now() < next) {
        await sleep(Math.ceil(next - now()), undefined, { signal });
      }
      signal?.throwIfAborted();
      const start = now();
      if (last !== null) minGap = Math.min(minGap ?? Infinity, start - last);
      last = start;
      sent++;
      try {
        // Redirects could create unpaced requests inside fetch; reject them.
        return await fetchImpl(input, { ...init, redirect: "error" });
      } finally {
        next = now() + 100;
      }
    });
    tail = run.then(() => {}, () => {}).finally(() => { pending--; });
    return run;
  }
  return { fetch, metrics: () => ({ enabled: true, scope: "process", spacingMs: 100, pending, sent, minStartGapMs: minGap }) };
}

const transport = createBrsTransport({ extraBases: [process.env.BRSAPI_BASE, process.env.BRSAPI_COMMODITY_BASE] });
export const brsFetch = transport.fetch;
export const brsTransportMetrics = transport.metrics;
