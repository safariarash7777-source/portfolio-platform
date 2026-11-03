import { sourcePublishedAt } from "@/lib/telegram-feed";

export type RecordedPeriod = "all" | "7d" | "30d" | "90d" | "unknown";
const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function recordedPeriodFrom(value: string | null): RecordedPeriod {
  return value === "7d" || value === "30d" || value === "90d" || value === "unknown" ? value : "all";
}

/** Filters only the caller's loaded subset, by its recorded timestamp.
 * A rolling day is 24 hours; both bounds are inclusive, and future records
 * are excluded from a past-period filter. Missing/invalid dates stay unknown.
 */
export function filterMediaByRecordedPeriod<T extends { published_at: string | null }>(
  items: readonly T[], period: RecordedPeriod, now: number,
): T[] {
  if (period === "all") return [...items];
  return items.filter(item => {
    const recorded = sourcePublishedAt(item.published_at);
    if (period === "unknown") return recorded === null;
    if (recorded === null || !Number.isFinite(now)) return false;
    const time = Date.parse(recorded);
    return time >= now - PERIOD_DAYS[period] * DAY_MS && time <= now;
  });
}

/** Amend the existing hash parameter bag without dropping layout/unknown keys.
 * The caller retains pathname and search, including an appearance preview.
 */
export function patchArchiveHash(hash: string, patch: Record<string, string>): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  for (const [key, value] of Object.entries(patch)) {
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}
