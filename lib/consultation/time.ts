import { toLatinDigits } from "@/lib/format";

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
/** Native calendar/time controls represent Tehran wall time, never the device zone. */
export function tehranInputToInstant(input: string): string | null {
  const value = toLatinDigits(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) || !isDate(value.slice(0, 10))) return null;
  const [hour, minute, second = "00"] = value.slice(11).split(":");
  if (+hour > 23 || +minute > 59 || +second > 59) return null;
  return `${value.slice(0, 16)}:${second}+03:30`;
}
export function instantToTehranInput(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Date-only deadlines and session dates must also ignore the device timezone. */
export function formatTehranDate(value: string): string {
  const instant = isDate(value) ? `${value}T12:00:00+03:30` : value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric",
  }).format(new Date(instant));
}
