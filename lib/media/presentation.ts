import { isKind, isPlatform, type ContentItem } from "@/lib/content-hub";
import type { SiteLayout } from "@/lib/appearance/site-layout";
import { formatJalali, toLatinDigits } from "@/lib/format";
import { jalaliYmdToGregorian } from "@/lib/core/jalali";

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

/** Archive filters refer only to the legacy stored timestamp, not verified source publication. */
export interface MediaArchiveFilters { network: string; kind: string; query: string; from: string; to: string }
export interface MediaArchiveRange { from: string | null; to: string | null; active: boolean; error: "from" | "to" | "order" | null }

export function mediaArchiveFiltersFromHash(hash: string): MediaArchiveFilters {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const network = p.get("network"), kind = p.get("kind");
  return { network: isPlatform(network) ? network : "all", kind: isKind(kind) ? kind : "all", query: p.get("q") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "" };
}

/** Preserve layout/unrelated state. The literal query or invalid date "all" is not a default. */
export function mediaArchiveHashWithPatch(hash: string, patch: Record<string, string>): string {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  for (const [key, value] of Object.entries(patch)) {
    if (!value || ((key === "network" || key === "kind") && value === "all")) p.delete(key);
    else p.set(key, value);
  }
  return p.toString();
}

export function mediaArchiveBoundary(input: string): string | null {
  const match = toLatinDigits(input).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const day = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const gregorian = jalaliYmdToGregorian(day);
  if (!gregorian) return null;
  // The existing converter accepts day overflow; round-trip with the existing Tehran formatter.
  const roundTrip = toLatinDigits(formatJalali(`${gregorian}T12:00:00Z`, false)).replaceAll("/", "-");
  return roundTrip === day ? day : null;
}

/** Reject absent/ambiguous/invalid clocks; never parse a label, title or source URL as a date. */
export function recordedMediaDay(item: MediaItem): string | null {
  const stamp = item.published_at;
  if (typeof stamp !== "string" || !stamp) return null;
  const parts = stamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return null;
  const date = new Date(stamp), calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.getUTCFullYear() !== Number(parts[1]) || calendar.getUTCMonth() + 1 !== Number(parts[2]) || calendar.getUTCDate() !== Number(parts[3])) return null;
  const day = toLatinDigits(formatJalali(date, false)).replaceAll("/", "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function recordedMediaDateLabel(item: MediaItem): string | null {
  // When a usable clock exists, show the same clock used by the date filter.
  // A legacy text label remains display-only fallback and never supplies that clock.
  return recordedMediaDay(item) ? formatJalali(item.published_at!) : (typeof item.dateLabel === "string" ? item.dateLabel.trim() || null : null);
}

/** Distinguish an old display label from a clock the archive filter can actually compare. */
export function mediaRecordDatePresentation(item: MediaItem) {
  if (recordedMediaDay(item)) return { kind: "recorded" as const, label: "تاریخ ثبت‌شده", value: recordedMediaDateLabel(item)!, note: null };
  const oldText = typeof item.dateLabel === "string" ? item.dateLabel.trim() : "";
  return oldText
    ? { kind: "label-only" as const, label: "متن قدیمی تاریخ", value: oldText, note: "زمان قابل‌بررسی ثبت نشده" }
    : { kind: "unknown" as const, label: "تاریخ ثبت‌شده", value: "نامشخص", note: null };
}

export function mediaArchiveRange(filters: Pick<MediaArchiveFilters, "from" | "to">): MediaArchiveRange {
  const fromInput = filters.from.trim(), toInput = filters.to.trim();
  const from = fromInput ? mediaArchiveBoundary(fromInput) : null, to = toInput ? mediaArchiveBoundary(toInput) : null;
  return { from, to, active: !!(fromInput || toInput), error: fromInput && !from ? "from" : toInput && !to ? "to" : from && to && from > to ? "order" : null };
}

/** AND all filters over the caller's existing bounded public subset; no mutation or new reads. */
export function filterMediaArchive(items: MediaItem[], filters: MediaArchiveFilters) {
  const range = mediaArchiveRange(filters);
  const base = items.filter(item => (filters.network === "all" || item.platform === filters.network) && (filters.kind === "all" || item.kind === filters.kind) && ((item.title || "") + (item.description || "")).includes(filters.query.trim()));
  const dated = base.map(item => ({ item, day: recordedMediaDay(item) }));
  const unknownDateCount = dated.filter(row => row.day === null).length;
  const shown = range.error ? [] : !range.active ? base : dated.filter(row => row.day !== null && (!range.from || row.day >= range.from) && (!range.to || row.day <= range.to)).map(row => row.item);
  return { shown, range, unknownDateCount, matchedBeforeDate: base.length };
}
