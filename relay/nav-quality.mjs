import { jalaliYmdToGregorian } from "./codal.mjs";

export function finiteNumber(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Validate the source NAV clock, independently of a newly fetched cache entry. */
export function navSourceAt(date, time) {
  const m = String(date ?? "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const t = String(time ?? "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !t || Number(m[2]) > 12 || Number(m[2]) < 1 || Number(m[3]) < 1 || Number(m[3]) > 31 || Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3] ?? 0) > 59) return null;
  const gregorian = jalaliYmdToGregorian(m[1], m[2], m[3]);
  const iso = `${gregorian}T${t[1].padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}+03:30`;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const p = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(at));
  const n = part => Number(p.find(x => x.type === part)?.value);
  return n("year") === Number(m[1]) && n("month") === Number(m[2]) && n("day") === Number(m[3]) ? at : null;
}

export function navValidity(entry, priceToman, now) {
  const sourceAt = navSourceAt(entry?.navDate, entry?.navTime);
  if (sourceAt == null) return { state: "unavailable", sourceAt };
  if (sourceAt > now + 15 * 60_000) return { state: "invalid-time", sourceAt };
  if (now - sourceAt > 24 * 3600_000) return { state: "stale", sourceAt };
  const navToman = finiteNumber(entry?.nav) == null ? null : entry.nav / 10;
  const ratio = navToman > 0 ? priceToman / navToman : null;
  if (ratio == null || !Number.isFinite(ratio) || ratio < 0.5 || ratio > 2) return { state: "invalid-unit", sourceAt };
  return { state: "ready", sourceAt };
}
