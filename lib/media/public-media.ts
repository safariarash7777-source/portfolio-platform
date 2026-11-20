import { detectPlatform, isKind, isPlatform, type ContentItem } from "../content-hub";
import { uniqueMedia, sourceUrl } from "./presentation";
import { sourcePublishedAt } from "../telegram-feed";

export const publicContentId = (value: string) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Defense in depth after the anonymous published/undeleted database read.
 * Never promote drafts, future publication, private invites or a session-only row.
 */
export function publicMediaItems(items: readonly unknown[], now = Date.now()): ContentItem[] {
  const accepted = items.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !isPlatform(row.platform) || !isKind(row.kind) ||
      typeof row.content_url !== "string" || typeof row.published_at !== "string" ||
      !(row.title === null || typeof row.title === "string") || !(row.description === null || typeof row.description === "string")) return [];
    const item = row as unknown as ContentItem;
    const published = sourcePublishedAt(item.published_at);
    const url = sourceUrl(item.content_url);
    const publicSource = url !== null && detectPlatform(url) === item.platform && (item.platform !== "telegram" || /^https:\/\/t\.me\/(?:s\/)?arashsafariiiiiiii\/\d+\/?$/i.test(url));
    const visible = publicContentId(item.id) && published !== null && Date.parse(published) <= now &&
      row.deleted_at == null && row.is_private !== true &&
      (row.visibility === undefined || row.visibility === "public") &&
      (row.audience === undefined || row.audience === "public") && publicSource;
    return visible ? [item] : [];
  });
  return uniqueMedia(accepted).sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!));
}
export const publicArticleHref = (item: Pick<ContentItem, "id">) => `/insights/${encodeURIComponent(item.id)}`;
export function articleText(item: ContentItem): string {
  const title = item.title?.trim() ?? "", description = item.description?.trim() ?? "";
  return description.startsWith(title) && title ? description : [title, description].filter(Boolean).join("\n\n");
}
export function articleTitle(item: ContentItem): string {
  const text = item.title?.trim() || item.description?.trim().split("\n")[0] || "نوشتهٔ منتشرشده";
  return text.length > 110 ? `${text.slice(0, 110).trim()}…` : text;
}
/** Only standalone public prose can lead the reading journey. Captions, short
 * announcements and timestamped podcast notes remain in the public archive. */
export function latestPublicArticle(items: ContentItem[]): ContentItem | null {
  return items.find(item => {
    const url = sourceUrl(item.content_url);
    if (item.platform !== "telegram" || item.kind !== "post" || !url ||
        !/^https:\/\/t\.me\/(?:s\/)?arashsafariiiiiiii\/\d+\/?$/i.test(url)) return false;
    const body = (item.description ?? "").replace(/https?:\/\/\S+|@[\w_]+/g, "").trim();
    const timecodes = body.match(/(?:^|\s)[0-9۰-۹]{1,2}:[0-9۰-۹]{2}(?=\s)/g);
    return body.length >= 200 && (timecodes?.length ?? 0) < 2;
  }) ?? null;
}
