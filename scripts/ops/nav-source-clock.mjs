// Exact pure clock functions selected from PR207; no relay imports or environment reads.
function jalaliToGregorian(jy, jm, jd) {
  jy = Number(jy); jm = Number(jm); jd = Number(jd);
  const jyd = jy + 1595;
  let days = -355668 + 365 * jyd + Math.floor(jyd / 33) * 8 + Math.floor(((jyd % 33) + 3) / 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const gdm = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > gdm[gm]; gm++) gd -= gdm[gm];
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export const jalaliYmdToGregorian = jalaliToGregorian;

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
