import type { ContentItem } from "@/lib/content-hub";
import type { SiteLayout } from "@/lib/appearance/site-layout";
import { toLatinDigits } from "@/lib/format";

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

export type MediaDateRange =
  | { state: "valid"; from: string | null; to: string | null; active: boolean }
  | { state: "invalid"; reason: "from_invalid" | "to_invalid" | "reversed" };

function isGregorianDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

const recordedDayFormatter = new Intl.DateTimeFormat("en", {
  calendar: "gregory", numberingSystem: "latn", timeZone: "Asia/Tehran",
  year: "numeric", month: "2-digit", day: "2-digit", era: "short",
});

/** Legacy registration day, never a verified source publication timestamp. */
export function recordedMediaDay(value: string | null): string | null {
  if (!value) return null;
  if (isGregorianDay(value)) return value; // A day-only record has no time to shift.
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts || !isGregorianDay(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59 || Number(parts[6] ?? 0) > 23 || Number(parts[7] ?? 0) > 59) return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const formatted = recordedDayFormatter.formatToParts(timestamp);
  const get = (type: string) => formatted.find(part => part.type === type)?.value ?? "";
  const day = `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
  return get("era") === "AD" && isGregorianDay(day) ? day : null;
}

export function mediaDateRange(fromInput: string, toInput: string): MediaDateRange {
  const from = toLatinDigits(fromInput.trim()) || null, to = toLatinDigits(toInput.trim()) || null;
  if (from && !isGregorianDay(from)) return { state: "invalid", reason: "from_invalid" };
  if (to && !isGregorianDay(to)) return { state: "invalid", reason: "to_invalid" };
  if (from && to && from > to) return { state: "invalid", reason: "reversed" };
  return { state: "valid", from, to, active: !!(from || to) };
}

export function filterMediaDates<T extends Pick<MediaItem, "published_at">>(items: T[], from: string, to: string) {
  const range = mediaDateRange(from, to);
  let excludedUnknown = 0;
  const filtered = range.state === "invalid" ? [] : !range.active ? items : items.filter(item => {
    const day = recordedMediaDay(item.published_at);
    if (day === null) { excludedUnknown++; return false; }
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  });
  return { range, items: filtered, excludedUnknown };
}
