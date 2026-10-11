/** Read announcement metadata only; parsed financial reports are a separate dataset. */
export const CODAL_FEED_SELECT = "id,title,report_code,sent_date,sent_time,link";
export const CODAL_FEED_ORDER = "sent_date.desc.nullslast,sent_time.desc.nullslast,id.desc";

export function codalFeedQuery(symbol: string): URLSearchParams {
  return new URLSearchParams({
    select: CODAL_FEED_SELECT,
    symbol: `eq.${symbol}`,
    order: CODAL_FEED_ORDER,
    limit: "60",
  });
}

export interface CodalFeedItem {
  title: string;
  kind: string | null;
  date: string | null;
  time: string | null;
  dateKind: "sent";
  url: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function codalFeedItems(input: unknown): CodalFeedItem[] {
  if (!Array.isArray(input)) throw new Error("invalid codal feed response");
  const seen = new Set<string>();
  const items: CodalFeedItem[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const title = text(row.title);
    if (!title) continue;
    const url = text(row.link);
    const date = text(row.sent_date);
    const time = text(row.sent_time);
    const key = url ?? `${title}|${date ?? ""}|${time ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, kind: text(row.report_code), date, time, dateKind: "sent", url });
    if (items.length >= 30) break;
  }
  return items;
}

/** A permission, timeout or column error does not establish that the feed is absent. */
export function codalFeedFailure(error: { code?: string | null } | null): "missing" | "unavailable" | null {
  if (!error) return null;
  return error.code === "42P01" || error.code === "PGRST205" ? "missing" : "unavailable";
}
