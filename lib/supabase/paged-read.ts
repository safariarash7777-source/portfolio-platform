import { withDeadline, DeadlineError } from "../deadline";
/** Read-only keyset scan. Short pages are NOT proof of completion (PostgREST max-rows). */
export interface ReadCoverage {
  state: "complete" | "stale" | "error";
  completedAt: number | null;
  rows: number;
  pages: number;
  upperId: number | null;
  failure?: { code: string; page: number; status?: number };
}
export interface CompleteRead<T> { data: T; coverage: ReadCoverage }

export class PagedReadError extends Error {
  constructor(public readonly code: string, public readonly page: number, public readonly status?: number) {
    super(`Read coverage failed: ${code} (page ${page})`);
  }
}

interface PagedReadOptions {
  url: string;
  anon: string;
  table: string;
  select: string;
  filters?: Record<string, string>;
  pageSize?: number;
  maxPages?: number;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

/** Fence the append-only scan at the highest visible ID using the SAME filters and RLS. */
export async function readAllPages<T extends { id: number }>(options: PagedReadOptions): Promise<CompleteRead<T[]>> {
  const { url, anon, table, select, filters = {}, fetcher = fetch, pageSize = 1000, maxPages = 1000 } = options;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 || !Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new PagedReadError("invalid_bounds", 0);
  }
  async function request(query: URLSearchParams, page: number): Promise<T[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: { ok: boolean; status: number; body: unknown };
      try {
        response = await withDeadline(async signal => {
          const res = await fetcher(`${url.replace(/\/+$/, "")}/rest/v1/${table}?${query}`, {
          headers: { apikey: anon, Authorization: `Bearer ${anon}` },
          cache: "no-store", signal,
          });
          let body: unknown = null;
          if (res.ok) { try { body = await res.json(); } catch { throw new PagedReadError("invalid_json", page); } }
          return { ok: res.ok, status: res.status, body };
        }, 10000, options.signal);
      } catch (error) {
        if (error instanceof PagedReadError) throw error;
        if (attempt === 0 && !options.signal?.aborted) continue;
        throw new PagedReadError(options.signal?.aborted ? "deadline" : "transport", page);
      }
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        throw new PagedReadError("http", page, response.status);
      }
      const body = response.body;
      if (!Array.isArray(body) || body.some(row => !row || !Number.isSafeInteger(row.id) || row.id <= 0)) {
        throw new PagedReadError("invalid_rows", page);
      }
      return body as T[];
    }
    throw new PagedReadError("transport", page);
  }

  const fence = await request(new URLSearchParams({ ...filters, select: "id", order: "id.desc", limit: "1" }), 0);
  if (fence.length > 1) throw new PagedReadError("invalid_fence", 0);
  const upperId = fence[0]?.id ?? null;
  const rows: T[] = [];
  let cursor = 0;
  let pages = 0;
  while (upperId !== null && cursor < upperId) {
    if (pages >= maxPages) throw new PagedReadError("page_budget", pages + 1);
    const batch = await request(new URLSearchParams({
      ...filters, select, order: "id.asc", limit: String(pageSize),
      and: `(id.gt.${cursor},id.lte.${upperId})`,
    }), ++pages);
    if (batch.length === 0) throw new PagedReadError("missing_page", pages);
    for (const row of batch) {
      if (row.id <= cursor || row.id > upperId) throw new PagedReadError("unstable_order", pages);
      cursor = row.id;
      rows.push(row);
    }
  }
  return { data: rows, coverage: { state: "complete", completedAt: Date.now(), rows: rows.length, pages, upperId } };
}

/** Only a completed scan replaces a good value. Single flight; failed reads cool down for 30s. */
export function createCompleteReader<T>(loader: () => Promise<CompleteRead<T>>, empty: () => T, ttlMs: number, now = Date.now) {
  let last: CompleteRead<T> | null = null;
  let failure: ReadCoverage["failure"] | undefined;
  let retryAt = 0;
  let pending: Promise<CompleteRead<T>> | null = null;
  function fallback(): CompleteRead<T> {
    return {
      data: last?.data ?? empty(),
      coverage: { ...(last?.coverage ?? { completedAt: null, rows: 0, pages: 0, upperId: null }), state: last ? "stale" : "error", failure },
    };
  }
  return async (): Promise<CompleteRead<T>> => {
    if (failure && now() < retryAt) return fallback();
    if (!failure && last && now() - (last.coverage.completedAt ?? 0) < ttlMs) return last;
    if (pending) return pending;
    pending = (async () => {
      try {
        const result = await Promise.resolve().then(loader);
        if (result.coverage.state !== "complete") throw new PagedReadError("incomplete", 0);
        last = result;
        failure = undefined;
        return result;
      } catch (error) {
        const e = error instanceof PagedReadError ? error : new PagedReadError(error instanceof DeadlineError ? "deadline" : "read_failed", 0);
        failure = { code: e.code, page: e.page, ...(e.status ? { status: e.status } : {}) };
        retryAt = now() + 30000;
        return fallback();
      } finally { pending = null; }
    })();
    return pending;
  };
}
