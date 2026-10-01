import { sourceTime } from "./market-quality";

/** Publication day is never replaced with a financial reporting period. */
export function publicationDay(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().split(/[ T]/)[0];
  const at = sourceTime(day, "00:00:00");
  if (at == null || at > now) return null;
  return day;
}
