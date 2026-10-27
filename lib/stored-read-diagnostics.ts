/** Failure-only telemetry; never serialize an Error, URL, symbol or headers. */
export type StoredReadPhase = 'request' | 'headers' | 'body';
const routes = ['codal-list', 'symbol-detail'];
const names = ['Error', 'TypeError', 'TimeoutError', 'AbortError', 'SyntaxError', 'AggregateError'];
const codes = ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'];
const allowed = (value: unknown, list: string[]) => typeof value === 'string' && list.includes(value) ? value : 'unknown';
export function logStoredReadFailure(input: {
  route: 'codal-list' | 'symbol-detail'; phase: StoredReadPhase;
  elapsedMs: number; upstreamStatus?: number; error?: unknown;
}, emit: (event: string, fields: Record<string, unknown>) => void = console.warn): void {
  try {
    const error = input.error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
    emit('stored_read_failed', {
      route: allowed(input.route, routes), phase: allowed(input.phase, ['request', 'headers', 'body']),
      elapsedMs: Number.isFinite(input.elapsedMs) && input.elapsedMs >= 0 ? Math.round(input.elapsedMs) : null,
      upstreamStatus: Number.isInteger(input.upstreamStatus) && input.upstreamStatus! >= 100 && input.upstreamStatus! <= 599 ? input.upstreamStatus : null,
      errorName: allowed(error?.name, names), causeCode: allowed(error?.cause?.code ?? error?.code, codes),
    });
  } catch { /* Telemetry must not change the existing response on any failure. */ }
}
