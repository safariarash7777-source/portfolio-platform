// Test process only. Never imported by a production module or exposed via env.
import { performance } from 'node:perf_hooks';
import timers from 'node:timers/promises';
import { syncBuiltinESMExports } from 'node:module';
let clock = performance.now();
Object.defineProperty(performance, 'now', { value: () => clock });
timers.setTimeout = async (ms, value, options = {}) => {
  options.signal?.throwIfAborted();
  if (!Number.isFinite(ms) || ms < 0) throw Error('invalid offline transport delay');
  clock += ms;
  options.signal?.throwIfAborted();
  return value;
};
syncBuiltinESMExports();
