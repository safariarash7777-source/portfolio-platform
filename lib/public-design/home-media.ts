import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isKind, isPlatform, type ContentItem } from "@/lib/content-hub";
import { uniqueMedia } from "@/lib/media/presentation";

export interface HomeMediaRead {
  state: "ready" | "empty" | "unavailable";
  items: ContentItem[];
  readAt: string;
}

/** Same existing published-content projection and current session/RLS as home.
 * No description, private chat, engagement, source media or sync-time inference.
 */
export async function readHomeMedia(
  client: Awaited<ReturnType<typeof createClient>>,
): Promise<HomeMediaRead> {
  const readAt = new Date().toISOString();
  try {
    const { data, error } = await client
      .from("content_hub")
      .select("id, platform, kind, content_url, title, published_at")
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(60);
    if (error) return { state: "unavailable", items: [], readAt };
    const items = uniqueMedia(
      (data ?? [])
        .filter((row) => isPlatform(row.platform) && isKind(row.kind))
        .map((row) => ({
          id: String(row.id),
          platform: row.platform,
          kind: row.kind,
          content_url: row.content_url,
          title: row.title,
          published_at: row.published_at,
          description: null,
        })),
    ).slice(0, 4);
    return { state: items.length ? "ready" : "empty", items, readAt };
  } catch {
    return { state: "unavailable", items: [], readAt };
  }
}
