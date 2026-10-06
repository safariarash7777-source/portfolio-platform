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
export interface FamilyAvailability {
  state: DataQuality | "empty";
  receivedAt: number | null;
  retained: boolean;
  sourceState: RelayFamilyState | null;
  rows: number;
  rejectedRows: number;
  unknownTimeRows: number;
  staleRows: number;
  validAt: number | null;
}
export type IranFamily = "gold" | "currency" | "funds" | "stocks" | "crypto" | "options" | "indices";
export type RelayFamilyState = "received" | "empty" | "stale" | "unavailable";
export interface SnapshotQuality {
  version: 1;
  state: "complete" | "partial" | "error";
  attemptedAt: number | null;
  families: Partial<Record<IranFamily, { state: RelayFamilyState; receivedAt: number | null; retained: boolean }>>;
}
const FAMILY_KEYS: IranFamily[] = ["gold", "currency", "funds", "stocks", "crypto", "options", "indices"];
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Versioned, allowlisted metadata only; undefined means legacy, null means invalid. */
export function parseSnapshotQuality(value: unknown): SnapshotQuality | null | undefined {
  if (value === undefined) return undefined;
  const q = object(value), raw = object(q?.families);
  if (q?.version !== 1 || !["complete", "partial", "error"].includes(String(q.state)) || !raw) return null;
  const families: SnapshotQuality["families"] = {};
  for (const key of FAMILY_KEYS) {
    const f = object(raw[key]);
    if (!f || !["received", "empty", "stale", "unavailable"].includes(String(f.state))) continue;
    families[key] = { state: f.state as RelayFamilyState, receivedAt: validTimestamp(f.receivedAt), retained: f.retained === true || f.state === "stale" };
  }
  return { version: 1, state: q.state as SnapshotQuality["state"], attemptedAt: validTimestamp(q.attemptedAt), families };
}
export interface IranReadQuality {
  state: "ready" | "stale" | "unknown-time" | "partial" | "error" | "empty";
  reason: "empty-source" | "invalid-receipt-time" | "old-receipt" | "rejected-rows" | "missing-price-time" | "old-price-time" | "source-partial" | "source-error" | "invalid-family-metadata" | null;
  snapshotState?: SnapshotQuality["state"] | null;
  receivedAt: number | null;
  validAt: number | null;
  families: Record<IranFamily, FamilyAvailability>;
}
const STALE_MS = 30 * 60_000;
const FUTURE_TOLERANCE_MS = 120_000;

/** Counts describe this payload only. Empty families do not prove missing symbols or history. */
export function iranReadQuality(market: IrMarket | null, now = Date.now()): IranReadQuality {
  const hasMetadata = market?.snapshotQuality !== undefined;
  const family = (key: IranFamily, rows: readonly { sourceDate?: string | null; sourceTime?: string | null }[], inputRows = rows.length): FamilyAvailability => {
    const clocks = rows.map(row => sourceTime(row.sourceDate, row.sourceTime));
    const unknownTimeRows = clocks.filter(at => at === null || at > now + FUTURE_TOLERANCE_MS).length;
    const staleRows = clocks.filter(at => at !== null && now - at >= STALE_MS).length;
    const validAt = rows.length && !unknownTimeRows ? Math.min(...clocks as number[]) : null;
    const metadata = market?.snapshotQuality?.families[key];
    const rawReceipt = validTimestamp(hasMetadata ? metadata?.receivedAt : market?.fetchedAt);
    const receivedAt = rawReceipt !== null && rawReceipt <= now + FUTURE_TOLERANCE_MS ? rawReceipt : null;
    let state: FamilyAvailability["state"] = !rows.length ? "unavailable" : unknownTimeRows ? "unknown-time" : staleRows ? "stale" : "ready";
    if (hasMetadata) {
      if (!metadata) state = rows.length ? "unknown-time" : "unavailable";
      else if (metadata.state === "unavailable") state = "unavailable";
      else if (metadata.retained || metadata.state === "stale") state = "stale";
      else if (metadata.state === "empty" && !rows.length && inputRows === 0 && receivedAt !== null) state = now - receivedAt >= STALE_MS ? "stale" : "empty";
      else if (metadata.state === "empty" || receivedAt === null) state = "unknown-time";
      else if (now - receivedAt >= STALE_MS && rows.length) state = "stale";
      if (market?.snapshotQuality?.state === "error" && state !== "unavailable") state = "stale";
    } else if (rows.length && (receivedAt === null || (rawReceipt !== null && rawReceipt > now + FUTURE_TOLERANCE_MS))) state = "unknown-time";
    else if (rows.length && receivedAt !== null && now - receivedAt >= STALE_MS) state = "stale";
    return { rows: rows.length, rejectedRows: Math.max(0, inputRows - rows.length), unknownTimeRows, staleRows, validAt,
      receivedAt, retained: metadata?.retained ?? false, sourceState: metadata?.state ?? null, state };
  };
  const families = Object.fromEntries((["gold", "currency", "funds", "stocks", "crypto"] as const).map(key => [key, family(key, market?.[key] ?? [], market?.inputRows?.[key])])) as Record<IranFamily, FamilyAvailability>;
  // A supplied option clock is independent of index and receipt clocks.
  families.options = family("options", market?.options ?? [], market?.inputRows?.options);
  families.indices = family("indices", market?.indices ? [{ sourceDate: market.indices.date, sourceTime: market.indices.time }] : []);
  const active = Object.values(families).filter(item => item.rows > 0);
  const receivedAt = validTimestamp(market?.fetchedAt);
  const validAt = active.length && active.every(item => item.validAt !== null) ? Math.min(...active.map(item => item.validAt as number)) : null;
  let state: IranReadQuality["state"] = "ready", reason: IranReadQuality["reason"] = null;
  if (hasMetadata) {
    const values = Object.values(families);
    if (!market?.snapshotQuality) { state = "unknown-time"; reason = "invalid-family-metadata"; }
    else if (market.snapshotQuality.state === "error") { state = "error"; reason = "source-error"; }
    else if (market.snapshotQuality.state === "partial") { state = "partial"; reason = "source-partial"; }
    else if (values.some(item => item.rejectedRows > 0)) { state = "partial"; reason = "rejected-rows"; }
    else if (values.some(item => item.state === "unavailable")) { state = "partial"; reason = "source-partial"; }
    else if (values.some(item => item.state === "stale")) { state = "stale"; reason = "old-receipt"; }
    else if (values.some(item => item.state === "unknown-time")) { state = "unknown-time"; reason = "missing-price-time"; }
    else if (values.every(item => item.state === "empty")) state = "empty";
  } else if (!market?.ok || !active.length) { state = "error"; reason = "empty-source"; }
  else if (receivedAt === null || receivedAt > now + FUTURE_TOLERANCE_MS) { state = "unknown-time"; reason = "invalid-receipt-time"; }
  else if (now - receivedAt >= STALE_MS) { state = "stale"; reason = "old-receipt"; }
  else if (Object.values(families).some(item => item.rejectedRows > 0)) { state = "partial"; reason = "rejected-rows"; }
  else if (active.some(item => item.unknownTimeRows > 0)) { state = "unknown-time"; reason = "missing-price-time"; }
  else if (active.some(item => item.staleRows > 0)) { state = "stale"; reason = "old-price-time"; }
  return { state, reason, receivedAt, validAt, families, ...(hasMetadata ? { snapshotState: market?.snapshotQuality?.state ?? null } : {}) };
}

/** A failed bounded read cannot freshen any cached family, even if its receipt is recent. */
export function failedIranReadQuality(market: IrMarket | null, now = Date.now()): IranReadQuality {
  const quality = iranReadQuality(market, now);
  return { ...quality, families: Object.fromEntries(Object.entries(quality.families).map(([key, f]) => [key, {
    ...f, state: f.rows > 0 || f.state === "empty" ? "stale" : "unavailable", retained: f.rows > 0 || f.retained,
  }])) as IranReadQuality["families"] };
}

export function marketQualityLabel(state: FamilyAvailability["state"] | IranReadQuality["state"]): string {
  return state === "ready" ? "زمان منبع و دریافت معتبر است" : state === "empty" ? "منبع پاسخ معتبر بدون داده داده است" : state === "stale" ? "دادهٔ کهنه؛ آخرین دادهٔ ثبت‌شده" : state === "partial" ? "دریافت ناقص؛ وضعیت هر بخش مستقل است" : state === "error" ? "دریافت تازه ناموفق بود" : state === "unavailable" ? "دادهٔ این بخش در دسترس نیست" : "زمان معتبر منبع یا دریافت نامشخص است";
}

/** Page badge covers both rendered sources; an old index cannot hide behind fresh stocks. */
export function stocksPageQuality(stocks: FamilyAvailability | undefined, indices: FamilyAvailability | undefined, showsIndices: boolean): FamilyAvailability["state"] | "partial" {
  const state = stocks?.state ?? "unavailable";
  return showsIndices && indices?.state !== "ready" && (state === "ready" || state === "empty") ? "partial" : state;
}
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
  const indexQuality = iranReadQuality(market, now).families.indices;
  const quality: DataQuality = indexQuality.state === "empty" ? "unavailable" : indexQuality.state;
  const raw = market?.indices?.state ?? "";
  const session: SessionState = quality !== "ready" ? "unknown" : /بسته|تعطیل/.test(raw) ? "closed" : /باز است|باز می/.test(raw) ? "open" : "unknown";
  const label = quality === "unavailable" ? "دادهٔ بازار در دسترس نیست" : quality === "stale" ? "دادهٔ کهنه؛ آخرین وضعیت ثبت‌شده" : quality === "unknown-time" ? "زمان معتبر منبع نامشخص" : session === "closed" ? "بازار بسته؛ دادهٔ معتبر ثبت‌شده" : "زمان شاخص معتبر است؛ زمان هر قیمت مستقل است";
  return { source: "BrsApi → رله → اسنپ‌شات", receivedAt, validAt, quality, session, label };
}

/** Reuse the core bubble engine; a stale/unsynchronised NAV never becomes a current table ranking. */
export function withValidNav<T extends IrStockRow>(row: T, priceAt: number | null, now: number): T & { bubblePercent: number | null; navState: DataQuality; navReason: string | null } {
  // Source rejection is independent of clock arithmetic. Retain the original
  // NAV/price metadata, but never resurrect a rejected NAV as a live bubble.
  if (row.navStatus != null && row.navStatus !== "ready") {
    const navState: DataQuality = row.navStatus === "stale" ? "stale" : row.navStatus === "invalid-unit" || row.navStatus === "unavailable" ? "unavailable" : "unknown-time";
    const navReason = row.navStatus === "stale" ? "NAV منبع کهنه است" : row.navStatus === "invalid-time" ? "زمان NAV نامعتبر است" : row.navStatus === "invalid-unit" ? "واحد یا نسبت NAV منبع معتبر نیست" : row.navStatus === "unavailable" ? "NAV معتبر در منبع در دسترس نیست" : "وضعیت اعتبار NAV منبع نامشخص است";
    return { ...row, bubblePercent: null, navState, navReason };
  }
  priceAt = sourceTime(row.sourceDate, row.sourceTime);
  const at = navAtIso(row.navDate, row.navTime, jalaliYmdToGregorian);
  const result = liveBubble({ priceToman: row.closingPrice ?? row.price, navToman: row.nav, navAt: at?.iso, navPrecision: at?.precision, priceAt: priceAt == null ? null : new Date(priceAt).toISOString(), now: new Date(now) });
  const missingPriceTime = sourceTime(row.sourceDate, row.sourceTime) == null;
  return { ...row, bubblePercent: result.state === "ready" && !missingPriceTime ? result.bubblePercent : null, navState: missingPriceTime && result.state === "ready" ? "unknown-time" : result.state === "ready" ? "ready" : result.state === "stale" ? "stale" : "unavailable", navReason: missingPriceTime && result.state === "ready" ? "زمان قیمت ثبت نشده؛ هم‌زمانی با NAV نامشخص" : result.reason };
}
