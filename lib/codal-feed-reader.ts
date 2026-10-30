import "server-only";

import { codalFeedQuery, codalFeedWindow, CODAL_FEED_READ_LIMIT } from "./codal-feed";
import { liaraPublicEnv } from "./liara-public-env";
import { logStoredReadFailure, type StoredReadPhase } from "./stored-read-diagnostics";

const APPROVED_READ_URL = "https://62.60.191.24/liara-preview";
const BODY_LIMIT = 512 * 1024;
const TIMEOUT_MS = 15_000;

type FeedRead =
  | { ok: true; result: ReturnType<typeof codalFeedWindow> }
  | { ok: false; status: 502 | 503; error: string };

function configuration(): { url: string; anon: string } | string {
  // These two runtime settings belong only to this SELECT. Never modify the
  // shared NEXT_PUBLIC pair used by Auth, SDK clients and writers.
  const readUrl = process.env.CODAL_FEED_READ_URL;
  const readAnon = process.env.CODAL_FEED_READ_ANON_KEY;
  const separate = readUrl !== undefined || readAnon !== undefined;
  const url = (separate ? readUrl : process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, "");
  const anon = (separate ? readAnon : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !anon) return separate ? "codal feed read configuration invalid" : "supabase not configured";
  try {
    if (separate && url !== APPROVED_READ_URL) throw new Error();
    // Local privilege/expiry guard only. The destination verifies the signature
    // and URL/key pairing; decoding claims here is not authentication.
    if (anon.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anon)) throw new Error();
    // Reuse the existing pure URL/anon validator with an isolated object. Its
    // return value is not installed in process.env or next.config.js.
    liaraPublicEnv({ NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_LIARA_API_URL: url, NEXT_PUBLIC_LIARA_ANON_KEY: anon });
    return { url, anon };
  } catch {
    return "codal feed read configuration invalid";
  }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > BODY_LIMIT) {
    void response.body?.cancel().catch(() => {});
    throw new Error("body limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new Error("body limit");
      }
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** One anonymous stored-data GET; no SDK, incoming headers, retry or fallback. */
export async function readStoredCodalFeed(symbol: string): Promise<FeedRead> {
  const config = configuration();
  if (typeof config === "string") return { ok: false, status: 503, error: config };
  const startedAt = Date.now();
  let phase: StoredReadPhase = "request";
  let upstreamStatus: number | undefined;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rest/v1/codal_feed?${codalFeedQuery(symbol)}`, {
      method: "GET",
      headers: { apikey: config.anon, Authorization: `Bearer ${config.anon}`, Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
    signal.throwIfAborted();
    phase = "headers";
    upstreamStatus = response.status;
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      logStoredReadFailure({ route: "codal-list", phase, elapsedMs: Date.now() - startedAt, upstreamStatus });
      return { ok: false, status: 502, error: `supabase ${response.status}` };
    }
    phase = "body";
    const rows = await boundedJson(response, signal);
    if (!Array.isArray(rows) || rows.length > CODAL_FEED_READ_LIMIT || rows.some(row =>
      !row || typeof row !== "object" || Array.isArray(row) || typeof row.title !== "string" || !row.title.trim()
    )) throw new Error("invalid rows");
    return { ok: true, result: codalFeedWindow(rows) };
  } catch (error) {
    logStoredReadFailure({ route: "codal-list", phase, elapsedMs: Date.now() - startedAt, upstreamStatus, error });
    // Raw transport messages may contain URLs, tokens or response content.
    return { ok: false, status: 502, error: signal.aborted ? "codal feed read timed out" : phase === "body" ? "invalid codal feed response" : "fetch failed" };
  }
}
