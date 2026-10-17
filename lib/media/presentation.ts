import type { ContentItem } from "@/lib/content-hub";
import type { SiteLayout } from "@/lib/appearance/site-layout";

export type MediaLayout = SiteLayout;
export interface MediaAppearance { layout: MediaLayout; covers: "editorial" | "source"; featured: string[] }
export interface MediaItem extends ContentItem { dateLabel?: string | null }
export const APPEARANCE_KEY = "arash.media.preview.v1";
export const LAYOUT_LABELS = { 1: "مجله", 2: "مطالعه", 3: "گالری" } as const;
export const defaultAppearance: MediaAppearance = { layout: 1, covers: "editorial", featured: [] };
export function appearanceFrom(value: unknown): MediaAppearance {
  if (!value || typeof value !== "object") return { ...defaultAppearance, featured: [] };
  const v = value as Record<string, unknown>;
  return { layout: v.layout === 2 || v.layout === 3 ? v.layout : 1, covers: v.covers === "source" ? "source" : "editorial", featured: Array.isArray(v.featured) ? [...new Set(v.featured.filter((id): id is string => typeof id === "string" && id.length < 100))].slice(0, 3) : [] };
}
export function readAppearance(): MediaAppearance {
  try { return appearanceFrom(JSON.parse(window.localStorage.getItem(APPEARANCE_KEY) || "null")); } catch { return appearanceFrom(null); }
}
/** Only known public source hosts. Private Telegram invites and arbitrary HTML never render. */
export function sourceUrl(value: string): string | null {
  try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (["twitter.com", "www.twitter.com", "www.x.com"].includes(u.hostname)) u.hostname = "x.com";
    if (!["t.me", "www.instagram.com", "instagram.com", "x.com", "www.youtube.com", "youtube.com", "youtu.be"].includes(u.hostname)) return null;
    if (u.hostname === "t.me" && (/^\/(?:c|joinchat)\//i.test(u.pathname) || u.pathname.startsWith("/+"))) return null;
    u.search = ""; u.hash = ""; return u.toString();
  } catch { return null; }
}
export function uniqueMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const url = sourceUrl(item.content_url);
    if (!url) return false;
    const key = new URL(url);
    key.pathname = key.pathname.replace(/\/+$/, "") || "/";
    // Telegram usernames are case-insensitive. Keep every post identifier and
    // every other service's path case intact (e.g. Instagram shortcodes).
    if (key.hostname === "t.me") {
      const parts = key.pathname.split("/");
      const username = parts[1] === "s" ? 2 : 1;
      if (parts[username]) parts[username] = parts[username].toLowerCase();
      key.pathname = parts.join("/");
    }
    const canonical = key.toString();
    if (seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}
export function editorialCover(item: MediaItem): string {
  const text = (item.title || "") + (item.description || "");
  return text.includes("بدهی") || text.includes("آمریکا") ? "/media-preview/debt.webp" : text.includes("پادکست") || text.includes("گوش") ? "/media-preview/podcast.webp" : "/media-preview/world.webp";
}
