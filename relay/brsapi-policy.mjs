// Pure receipt validation. Local process evidence is not global ownership proof.
const LOCAL_DEFERRALS = new Set(['brs_transport_aborted', 'brs_transport_queue_full', 'brs_transport_wait_failed', 'brs_transport_clock_invalid']);
export const isBrsLocalDeferral = error => LOCAL_DEFERRALS.has(error?.code);
export function observedBrsTransportPolicy(t) {
  return t?.enabled === true && t.scope === 'process' && t.spacingMs === 300 &&
    t.rollingWindowMs === 300000 && t.rollingLimit === 300 && t.ipWindowMs === 1000 && t.ipLimit === 20 &&
    t.policy === 'conservative_unverified_plan' && t.windowScope === 'process_lifetime' &&
    t.priorProcessWindow === 'unknown' && t.coldStartPolicy === 'full_window_defer' &&
    t.globalEnforced === false && t.clockValid === true && Number.isSafeInteger(t.sent) && t.sent >= 2 &&
    Number.isFinite(t.minStartGapMs) && t.minStartGapMs >= 300;
}
