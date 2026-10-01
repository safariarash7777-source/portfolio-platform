/** Gregorian calendar policy is a configurable proposal (D-034), never an implicit production default. */
const zone = "Asia/Tehran";
function parts(ms: number) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (type: string) => Number(p.find(x => x.type === type)?.value);
  return [get("year"), get("month"), get("day"), get("hour"), get("minute"), get("second")];
}
function wallToUtc(wall: number) {
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const [y,m,d,h,n,s] = parts(guess);
    const shown = Date.UTC(y,m-1,d,h,n,s);
    const next = guess + wall - shown;
    if (next === guess) return next;
    guess = next;
  }
  return guess;
}
export function tehranLocalToUtc(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error("invalid Tehran local time");
  const [y,month,d,h,n] = m.slice(1).map(Number);
  const wall = Date.UTC(y,month-1,d,h,n);
  const check = new Date(wall);
  if (check.getUTCFullYear()!==y || check.getUTCMonth()!==month-1 || check.getUTCDate()!==d || h>23 || n>59) throw new Error("invalid date");
  return new Date(wallToUtc(wall)).toISOString();
}
export function accessEnd(start: string, policy: "gregorian-calendar-months" | "fixed-days", amount: number) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(start) || !Number.isInteger(amount) || amount < 1 || amount > 366) throw new Error("invalid policy/time");
  const ms = Date.parse(start);
  if (!Number.isFinite(ms)) throw new Error("invalid start");
  if (policy === "fixed-days") return new Date(ms + amount * 86400000).toISOString();
  const [y,m,d,h,n,s] = parts(ms);
  const target = new Date(Date.UTC(y,m-1+amount,1));
  const ty = target.getUTCFullYear(), tm = target.getUTCMonth();
  const endDay = Math.min(d, new Date(Date.UTC(ty,tm+1,0)).getUTCDate());
  return new Date(wallToUtc(Date.UTC(ty,tm,endDay,h,n,s)) + ms % 1000).toISOString();
}
export function standing(start: string, end: string, revoked: string | null, now: string) {
  if (revoked) return "revoked";
  const time = Date.parse(now);
  if (time < Date.parse(start)) return "scheduled";
  if (time >= Date.parse(end)) return "expired";
  return "active";
}
