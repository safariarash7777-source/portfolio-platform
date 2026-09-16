import type { Time } from "lightweight-charts";
import { formatJalali, formatJalaliShort } from "@/lib/format";

/** Convert the chart library's time union without guessing a Gregorian label. */
export function chartTimeToDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T12:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day, 12));
}

/** Jalali day/month label used on the chart axis. */
export function chartAxisDateLabel(time: Time): string {
  return formatJalaliShort(chartTimeToDate(time));
}

/** Full numeric Jalali date used in the chart crosshair tooltip. */
export function chartTooltipDateLabel(time: Time): string {
  return formatJalali(chartTimeToDate(time), false);
}
