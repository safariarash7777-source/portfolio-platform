import "server-only";
import { createClient as createAnonymousClient } from "@supabase/supabase-js";
import { readMediaContent } from "./content-read.server";
import { publicContentId, publicMediaItems } from "./public-media";
import type { HomeMediaRead } from "../public-design/home-media";

/** No cookie/session client, privileged fallback, private table or shared body cache.
 * The existing Preview public read pair is selected by readMediaContent. Without
 * an override use only a validated anonymous key, even when an admin opens home.
 */
export async function readPublicMedia(contentId?: string): Promise<HomeMediaRead> {
  const readAt = new Date().toISOString();
  if (contentId !== undefined && !publicContentId(contentId)) return { state: "empty", items: [], readAt };
  const result = await readMediaContent(async signal => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { data: null, error: true };
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString());
      if (claims.role !== "anon" || claims.iss !== "supabase" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return { data: null, error: true };
      const client = createAnonymousClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      let query = client.from("content_hub").select("id, platform, kind, content_url, title, description, published_at, created_at")
        .is("deleted_at", null).not("published_at", "is", null).order("published_at", { ascending: false });
      if (contentId) query = query.eq("id", contentId);
      const result = await query.limit(contentId ? 1 : 60).abortSignal(signal);
      return { ...result, data: result.data?.map(row => ({ ...row, stored_at: row.created_at })) ?? null };
    } catch { return { data: null, error: true }; }
  }, contentId ? { contentId } : undefined);
  if (result.error || !Array.isArray(result.data)) return { state: "unavailable", items: [], readAt };
  const items = publicMediaItems(result.data);
  const lastStoredAt = items.map(item => item.stored_at).filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return { state: items.length ? "ready" : "empty", items, readAt, lastStoredAt };
}
