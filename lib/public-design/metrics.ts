import type { HeadlineMetric } from "@/lib/core/marketHeadline";

/** Preserve every engine number. A failed source is not evidence of closed trading hours. */
export function publicMetricLabels(
  metrics: readonly HeadlineMetric[],
  hasSnapshot: boolean,
): readonly HeadlineMetric[] {
  return hasSnapshot
    ? metrics
    : metrics.map((metric) =>
        metric.value === null
          ? { ...metric, absentReason: "دادهٔ منبع در دسترس نیست" }
          : metric,
      );
}
