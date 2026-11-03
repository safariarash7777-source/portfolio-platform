import "server-only";
import { fundamentalReadPair } from "../fundamental/read-config.server";
import { withDeadline } from "../deadline";
import { isKind, isPlatform, type ContentItem } from "../content-hub";

interface ContentReadResult { data: ContentItem[] | null; error: unknown }
type LegacyRead = (signal: AbortSignal) => PromiseLike<ContentReadResult>;
interface ContentReadOptions { environment: Readonly<Record<string, string | undefined>> }
const projection = "id,platform,kind,content_url,title,description,published_at";

function contentRows(value: unknown): ContentItem[] | null {
  if (!Array.isArray(value) || value.length > 60) return null;
  const nullableText = (field: unknown) => field === null || typeof field === "string";
  if (!value.every(row => row !== null && typeof row === "object"
    && typeof row.id === "string" && typeof row.platform === "string" && typeof row.kind === "string"
    && typeof row.content_url === "string" && nullableText(row.title) && nullableText(row.description)
    && typeof row.published_at === "string")) return null;
  // Keep the page's existing platform/kind filter. No inferred dates or content.
  return value.flatMap(row => isPlatform(row.platform) && isKind(row.kind) ? [{
    id: row.id, platform: row.platform, kind: row.kind, content_url: row.content_url,
    title: row.title, description: row.description, published_at: row.published_at,
  }] : []);
}

/** The optional binding affects public content only. With no override, the caller's
 * unchanged session/RLS query retains the same whole-operation four-second bound.
 * An explicitly invalid binding or a failed public read never falls back to it.
 */
export async function readMediaContent(legacyRead: LegacyRead, options?: ContentReadOptions): Promise<ContentReadResult> {
  const failed: ContentReadResult = { data: null, error: true };
  let pair: ReturnType<typeof fundamentalReadPair>;
  try {
    // Direct field access is deliberate: build-time env replacement must see it.
    const environment = options?.environment ?? Object.freeze({
      FUNDAMENTAL_READ_URL: process.env.FUNDAMENTAL_READ_URL,
      FUNDAMENTAL_READ_ANON_KEY: process.env.FUNDAMENTAL_READ_ANON_KEY,
    });
    const captured = Object.freeze({
      FUNDAMENTAL_READ_URL: environment.FUNDAMENTAL_READ_URL,
      FUNDAMENTAL_READ_ANON_KEY: environment.FUNDAMENTAL_READ_ANON_KEY,
    });
    if (captured.FUNDAMENTAL_READ_URL === undefined && captured.FUNDAMENTAL_READ_ANON_KEY === undefined) {
      return await withDeadline(signal => Promise.resolve(legacyRead(signal)), 4000).catch(() => failed);
    }
    pair = fundamentalReadPair(captured);
  } catch { return failed; }
  if (!pair) return failed;
  const selected = Object.freeze({ ...pair });
  return withDeadline(async signal => {
    if (selected.expiresAt <= Date.now() / 1000) return failed;
    const query = new URLSearchParams({
      select: projection, deleted_at: "is.null", published_at: "not.is.null",
      order: "published_at.desc", limit: "60",
    });
    const response = await fetch(`${selected.url}/rest/v1/content_hub?${query}`, {
      method: "GET", headers: { apikey: selected.anon, Authorization: `Bearer ${selected.anon}` },
      cache: "no-store", credentials: "omit", redirect: "error", signal,
    });
    if (!response.ok) return failed;
    const data = contentRows(await response.json());
    return data === null ? failed : { data, error: null };
  }, 4000).catch(() => failed);
}
