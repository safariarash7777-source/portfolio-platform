import type { SourceAvailability } from "../market-bounded";
import { marketQualityLabel } from "../market-quality";

export function marketOverviewLabel(availability: SourceAvailability): string {
  if (availability.reason === "read-error" || availability.reason === "read-timeout")
    return "خواندن تازهٔ بازار ناموفق بود";
  if (availability.state === "stale" && availability.families)
    return "بخشی از داده‌های بازار کهنه است";
  return marketQualityLabel(availability.state === "timeout" ? "error" : availability.state);
}
