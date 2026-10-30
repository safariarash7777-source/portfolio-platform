/** DO NOT MERGE: explicit public-announcement integration transport, never a fallback. */
export const PUBLIC_FOOLAD_URL = 'https://portfolio-platform-fawn.vercel.app/api/codal-list?symbol=%D9%81%D9%88%D9%84%D8%A7%D8%AF';
export const MAX_PUBLIC_BODY_BYTES = 256 * 1024;
const TIMEOUT_MS = 15_000;
const SYMBOL = 'فولاد';
const TAG = 'P07-DO-NOT-MERGE';
type Phase = 'admission' | 'request' | 'headers' | 'body';
type Dependencies = { fetcher?: typeof fetch; timeoutMs?: number };
class ReadFailure extends Error {
  constructor(readonly code: string, readonly status: number, readonly phase: Phase) { super(code); }
}
function headers(upstreamStatus?: number) {
  return {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Integration-Only': TAG, 'X-Public-Source-URL': PUBLIC_FOOLAD_URL,
    ...(upstreamStatus === undefined ? {} : { 'X-Upstream-Status': String(upstreamStatus) }),
  };
}
export function integrationError(code: string, status: number, phase: Phase, upstreamStatus?: number) {
  return new Response(JSON.stringify({ error: code, phase, integrationOnly: TAG, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) }), { status, headers: headers(upstreamStatus) });
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const nullableText = (v: unknown, max: number) => v === null || (typeof v === 'string' && v.length <= max);
function searchIsFoolad(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.origin === 'https://codal.ir' && !u.username && !u.password && !u.hash &&
      u.pathname === '/ReportList.aspx' && u.searchParams.getAll('Symbol').length === 1 && u.searchParams.get('Symbol') === SYMBOL;
  } catch { return false; }
}
function officialReference(value: unknown) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 4000) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['codal.ir', 'www.codal.ir'].includes(u.hostname) && !u.port && !u.username && !u.password;
  } catch { return false; }
}
function validPayload(value: unknown) {
  if (!record(value) || !onlyKeys(value, ['data', 'source', 'coverage', 'codalSearchUrl']) ||
    value.source !== 'codal_feed' || value.coverage !== 'stored-announcements' ||
    !searchIsFoolad(value.codalSearchUrl) || !Array.isArray(value.data) || value.data.length > 30) return false;
  return value.data.every(row => record(row) && onlyKeys(row, ['title', 'kind', 'date', 'time', 'dateKind', 'url', 'publishedDate']) &&
    typeof row.title === 'string' && row.title.trim().length > 0 && row.title.length <= 4000 &&
    row.dateKind === 'sent' && nullableText(row.kind, 100) && nullableText(row.date, 80) && nullableText(row.time, 80) &&
    (!Object.hasOwn(row, 'publishedDate') || nullableText(row.publishedDate, 80)) && officialReference(row.url));
}

/** No request headers, env, credentials or caller-controlled origin/path enter this helper. */
export async function readPublicFoolad(symbol: string | null, dependencies: Dependencies = {}): Promise<Response> {
  if (!symbol) return integrationError('symbol_required', 400, 'admission');
  if (symbol !== SYMBOL) return integrationError('این اتصال آزمایشی فقط برای نماد فولاد مجاز است.', 422, 'admission');
  const fetcher = dependencies.fetcher ?? fetch;
  const timeoutMs = Math.min(TIMEOUT_MS, Math.max(1, dependencies.timeoutMs ?? TIMEOUT_MS));
  const controller = new AbortController();
  let phase: Phase = 'request';
  let upstreamStatus: number | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const resources: { body?: ReadableStream<Uint8Array> } = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ReadFailure('public_source_timeout', 504, phase));
      controller.abort();
    }, timeoutMs);
  });
  const operation = async () => {
    const upstream = await fetcher(PUBLIC_FOOLAD_URL, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (upstream.body) resources.body = upstream.body;
    phase = 'headers'; upstreamStatus = upstream.status;
    if (upstream.status >= 300 && upstream.status < 400) throw new ReadFailure('public_source_redirect_rejected', 502, phase);
    const errorStatus = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
    if (upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new ReadFailure('public_source_non_json', errorStatus, phase);
    }
    const length = upstream.headers.get('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > MAX_PUBLIC_BODY_BYTES) throw new ReadFailure('public_source_body_limit', errorStatus, phase);
    phase = 'body';
    if (!upstream.body) throw new ReadFailure('public_source_missing_body', errorStatus, phase);
    reader = upstream.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_PUBLIC_BODY_BYTES) throw new ReadFailure('public_source_body_limit', errorStatus, phase);
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    let text: string; let payload: unknown;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(joined); payload = JSON.parse(text); }
    catch { throw new ReadFailure('public_source_invalid_json', errorStatus, phase); }
    if (!upstream.ok) {
      // Preserve bounded public upstream errors and status; never turn them into an empty success.
      if (!record(payload) || !onlyKeys(payload, ['error', 'codalSearchUrl']) || typeof payload.error !== 'string' ||
        !payload.error.trim() || payload.error.length > 1024 ||
        (Object.hasOwn(payload, 'codalSearchUrl') && !searchIsFoolad(payload.codalSearchUrl))) {
        throw new ReadFailure('public_source_invalid_error_body', errorStatus, phase);
      }
      return new Response(text, { status: upstream.status, headers: headers(upstream.status) });
    }
    if (upstream.status !== 200 || !validPayload(payload)) throw new ReadFailure('public_source_schema_or_symbol_mismatch', 502, phase);
    return new Response(text, { status: 200, headers: headers(200) });
  };
  try { return await Promise.race([operation(), deadline]); }
  catch (error) {
    return error instanceof ReadFailure ? integrationError(error.code, error.status, error.phase, upstreamStatus) :
      integrationError('public_source_transport_or_read_failed', 502, phase, upstreamStatus);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    else if (resources.body) void resources.body.cancel().catch(() => {});
  }
}
