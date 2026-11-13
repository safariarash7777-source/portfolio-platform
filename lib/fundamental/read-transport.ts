/** Read-only reconnect: one deadline covers both attempts and the response body. */
export async function fetchFundamentalRows(
  url: string,
  headers: Record<string, string>,
  read: typeof fetch = fetch,
  timing = { totalMs: 8000, firstHeadersMs: 3000 },
): Promise<Response> {
  const deadline = AbortSignal.timeout(timing.totalMs);
  for (let attempt = 0; attempt < 2; attempt++) {
    const firstHeaders = new AbortController();
    const timer = attempt === 0
      ? setTimeout(() => firstHeaders.abort(new DOMException('Header deadline', 'TimeoutError')), timing.firstHeadersMs)
      : null;
    try {
      return await read(url, {
        method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers,
        signal: AbortSignal.any([deadline, firstHeaders.signal]),
      });
    } catch (error) {
      const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
      const retryable = (firstHeaders.signal.aborted && error === firstHeaders.signal.reason)
        || code === 'UND_ERR_CONNECT_TIMEOUT';
      if (attempt !== 0 || deadline.aborted || !retryable) throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  throw new Error('Fundamental read exhausted');
}
