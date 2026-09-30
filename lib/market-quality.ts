import { jalaliYmdToGregorian } from "./core/jalali";
import { navAtIso, liveBubble } from "./core/fundBubble";
import type { IrMarket, IrStockRow } from "./market-ir";
const sourceCalendar = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric" });

/** Source time is independent of transport/cache time. Never replace missing time with now. */
export function validTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || !Number.isFinite(new Date(value).getTime())) return null;
  return value;
}

export function sourceTime(date: string | null | undefined, time: string | null | undefined): number | null {
  const at = navAtIso(date, time, jalaliYmdToGregorian);
  if (!at || at.precision !== "minute") return null;
  const normalized = (date ?? "").replaceAll("/", "-").split("-").map(Number);
  const actual = sourceCalendar.formatToParts(new Date(at.iso));
  const n = (part: string) => Number(actual.find(p => p.type === part)?.value);
  if (n("year") !== normalized[0] || n("month") !== normalized[1] || n("day") !== normalized[2]) return null;
  return Date.parse(at.iso);
}

export type DataQuality = "ready" | "stale" | "unknown-time" | "unavailable";
export type SessionState = "open" | "closed" | "unknown";
export interface MarketProvenance {
  source: "BrsApi → رله → اسنپ‌شات";
  receivedAt: number | null;
  validAt: number | null;
  quality: DataQuality;
  session: SessionState;
  label: string;
}

/** A session label from a stale response is historical, not the current market state. */
export function marketProvenance(market: IrMarket | null, now = Date.now()): MarketProvenance {
  const receivedAt = validTimestamp(market?.fetchedAt);
  const validAt = sourceTime(market?.indices?.date, market?.indices?.time);
  const quality: DataQuality = !market?.ok ? "unavailable" : validAt == null || validAt > now + 120_000 ? "unknown-time" : now - validAt >= 30 * 60_000 ? "stale" : "ready";
  const raw = market?.indices?.state ?? "";
  const session: SessionState = quality !== "ready" ? "unknown" : /بسته|تعطیل/.test(raw) ? "closed" : /باز است|باز می/.test(raw) ? "open" : "unknown";
  const label = quality === "unavailable" ? "دادهٔ بازار در دسترس نیست" : quality === "stale" ? "دادهٔ کهنه؛ آخرین وضعیت ثبت‌شده" : quality === "unknown-time" ? "زمان معتبر منبع نامشخص" : session === "closed" ? "بازار بسته؛ دادهٔ معتبر ثبت‌شده" : "زمان شاخص معتبر است؛ زمان هر قیمت مستقل است";
  return { source: "BrsApi → رله → اسنپ‌شات", receivedAt, validAt, quality, session, label };
}

/** Reuse the core bubble engine; a stale/unsynchronised NAV never becomes a current table ranking. */
export function withValidNav<T extends IrStockRow>(row: T, priceAt: number | null, now: number): T & { bubblePercent: number | null; navState: DataQuality; navReason: string | null } {
  priceAt = sourceTime(row.sourceDate, row.sourceTime);
  const at = navAtIso(row.navDate, row.navTime, jalaliYmdToGregorian);
  const result = liveBubble({ priceToman: row.closingPrice ?? row.price, navToman: row.nav, navAt: at?.iso, navPrecision: at?.precision, priceAt: priceAt == null ? null : new Date(priceAt).toISOString(), now: new Date(now) });
  const missingPriceTime = sourceTime(row.sourceDate, row.sourceTime) == null;
  return { ...row, bubblePercent: result.state === "ready" && !missingPriceTime ? result.bubblePercent : null, navState: missingPriceTime && result.state === "ready" ? "unknown-time" : result.state === "ready" ? "ready" : result.state === "stale" ? "stale" : "unavailable", navReason: row.navStatus === "stale" ? "NAV منبع کهنه است" : row.navStatus === "invalid-time" ? "زمان NAV نامعتبر است" : missingPriceTime && result.state === "ready" ? "زمان قیمت ثبت نشده؛ هم‌زمانی با NAV نامشخص" : result.reason };
}
