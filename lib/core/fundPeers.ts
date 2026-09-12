// مقایسهٔ هم‌گروهِ صندوق‌ها و شاخصِ نقدشوندگی — محاسبهٔ خالص، بدون I/O.
//
// ── قاعدهٔ حاکم بر مقایسه ────────────────────────────────────────────────
// **فقط هم‌نوع با هم‌نوع.** صندوقِ اهرمی با صندوقِ درآمدِ ثابت مقایسه نمی‌شود؛
// حبابِ ۴۰٪ در اولی عادی و در دومی نشانهٔ خطای داده است. گروه‌بندی روی همان
// رشتهٔ `type`ی انجام می‌شود که فید می‌دهد (۱۳ نوعِ متمایز در اسنپ‌شاتِ زنده)
// و هرگز نگاشتِ حدسی ساخته نمی‌شود.
//
// ── چرا میانه، نه میانگین ───────────────────────────────────────────────
// گروه‌ها کوچک‌اند (از ۱ تا ۹۲ عضو) و یک صندوقِ پرت میانگین را جابه‌جا می‌کند.
// میانه و چارک‌ها در برابرِ همان یک عضو مقاوم‌اند.

export interface PeerRow {
  id: string;
  /** نوعِ صندوق همان‌طور که فید می‌دهد — گروه‌بندی روی همین */
  type: string | null;
  /** مقدارِ سنجه (مثلاً حباب٪). null = این صندوق در این سنجه شرکت نمی‌کند */
  value: number | null;
}

export interface PeerGroupStats {
  type: string;
  /** کلِ اعضای گروه، شاملِ اعضای بدونِ مقدار */
  members: number;
  /** اعضایی که مقدار دارند — مبنای همهٔ آمارهای زیر */
  withValue: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

/** چندکِ خطی روی آرایهٔ **مرتب‌شده**. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** حداقلِ اعضای دارای مقدار تا یک گروه آمار بگیرد.
 *  با ۲ عضو «میانه» و «چارک» معنای آماری ندارند و فقط توهمِ دقت می‌سازند. */
export const MIN_PEERS_FOR_STATS = 3;

/**
 * آمارِ هر گروه. گروهِ بدونِ `type` یا کم‌جمعیت‌تر از `MIN_PEERS_FOR_STATS`
 * **در خروجی نمی‌آید** — نه با عددِ ضعیف، نه با صفر.
 */
export function peerGroupStats(rows: readonly PeerRow[]): Map<string, PeerGroupStats> {
  const byType = new Map<string, PeerRow[]>();
  for (const r of rows) {
    const t = (r.type ?? "").trim();
    if (!t) continue;
    const arr = byType.get(t);
    if (arr) arr.push(r); else byType.set(t, [r]);
  }

  const out = new Map<string, PeerGroupStats>();
  for (const [type, members] of byType) {
    const vals = members
      .map((m) => m.value)
      .filter((v): v is number => typeof v === "number" && isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length < MIN_PEERS_FOR_STATS) continue;
    out.set(type, {
      type,
      members: members.length,
      withValue: vals.length,
      min: vals[0],
      p25: quantile(vals, 0.25),
      median: quantile(vals, 0.5),
      p75: quantile(vals, 0.75),
      max: vals[vals.length - 1],
    });
  }
  return out;
}

export interface PeerPosition {
  type: string;
  value: number;
  /** رتبه از ۱ (کمترین مقدار) تا `of` */
  rank: number;
  of: number;
  median: number;
  /** مقدار منهای میانهٔ گروه — واحدش همان واحدِ سنجه است */
  vsMedian: number;
  /** در کدام چارکِ گروه: 1..4 */
  quartile: 1 | 2 | 3 | 4;
}

/** جایگاهِ یک صندوق در گروهِ خودش. بدونِ مقدار یا بدونِ گروهِ آماری → null. */
export function peerPosition(row: PeerRow, stats: Map<string, PeerGroupStats>, all: readonly PeerRow[]): PeerPosition | null {
  const t = (row.type ?? "").trim();
  if (!t) return null;
  const value = row.value;
  if (typeof value !== "number" || !isFinite(value)) return null;
  const g = stats.get(t);
  if (!g) return null;

  const vals = all
    .filter((r) => (r.type ?? "").trim() === t)
    .map((r) => r.value)
    .filter((v): v is number => typeof v === "number" && isFinite(v))
    .sort((a, b) => a - b);

  const rank = vals.findIndex((v) => v >= value) + 1;
  const quartile: 1 | 2 | 3 | 4 =
    value <= g.p25 ? 1 : value <= g.median ? 2 : value <= g.p75 ? 3 : 4;

  return {
    type: t,
    value,
    rank: rank > 0 ? rank : vals.length,
    of: vals.length,
    median: g.median,
    vsMedian: value - g.median,
    quartile,
  };
}

/* ── نقدشوندگی ─────────────────────────────────────────────────────────────
 *
 * ── تعریفِ صریح ──────────────────────────────────────────────────────────
 * «نقدشوندگی» یک کلمهٔ کش‌دار است؛ اینجا دقیقاً یعنی:
 *   ۱) `medianDailyValueMTom` — **میانهٔ ارزشِ معاملاتِ روزانه** در پنجرهٔ
 *      خواسته‌شده، بر حسبِ **میلیون تومان**.
 *   ۲) `zeroVolumeDays` — تعدادِ روزهایی که در آن‌ها اصلاً معامله‌ای نشده.
 *   ۳) `tradedDayRatio` — نسبتِ روزهای دارای معامله به کلِ روزهای مشاهده‌شده.
 *
 * ── ورودی و واحد ────────────────────────────────────────────────────────
 * `value_traded` در `symbol_history` بر حسبِ **ریال** است (منبع TSETMC).
 * تبدیل یک‌بار همین‌جا: ریال ÷ ۱۰ = تومان ÷ ۱e6 = میلیون تومان ⇒ ÷ 1e7.
 *
 * ── آنچه این سنجه **نمی‌گوید** (محدودیت‌ها، صریح) ────────────────────────
 * • **اندازهٔ صندوق را در نظر نمی‌گیرد.** گردشِ ۱۰۰ م.ت در صندوقی با دارایی
 *   ۱۰۰ میلیارد با همان گردش در صندوقی با دارایی ۱ میلیارد یکی نیست. `assetB` در
 *   فیدِ زنده برای **هر ۳۲۶ صندوق `null` است**، پس نسبتِ گردش ساخته نمی‌شود.
 * • **اثرِ سفارش (market impact) را نمی‌سنجد.** برای آن به عمقِ تاریخیِ دفتر
 *   نیاز است؛ `bestBid/bestAsk` فقط لحظه‌ای است و ذخیره نمی‌شود.
 * • **شکافِ عرضه/تقاضا را نمی‌سنجد** — به همان دلیل.
 * • میانه است، نه بدترین حالت؛ روزِ بحرانی را نشان نمی‌دهد. */

export interface LiquidityDay {
  trade_date: string;
  /** ارزشِ معاملات (ریال) — null یعنی ثبت نشده، که با صفر یکی نیست */
  value_traded: number | null;
  volume: number | null;
}

export interface LiquidityStats {
  observedDays: number;
  /** میانهٔ ارزشِ معاملاتِ روزانه (میلیون تومان) */
  medianDailyValueMTom: number;
  /** کمینهٔ همان (میلیون تومان) */
  minDailyValueMTom: number;
  zeroVolumeDays: number;
  tradedDayRatio: number;
  /** روزهایی که `value_traded` اصلاً ثبت نشده — با «صفر معامله» فرق دارد */
  daysWithoutRecord: number;
}

const RIAL_TO_MILLION_TOMAN = 1e7;

/** حداقلِ روزهای مشاهده‌شده تا میانه معنا داشته باشد. */
export const MIN_DAYS_FOR_LIQUIDITY = 10;

/**
 * آمارِ نقدشوندگی. کمتر از `MIN_DAYS_FOR_LIQUIDITY` روزِ **دارای رکورد** → null.
 * روزِ بدونِ رکورد صفر گرفته نمی‌شود؛ شمرده می‌شود و کنار می‌رود.
 */
export function liquidityStats(days: readonly LiquidityDay[]): LiquidityStats | null {
  let daysWithoutRecord = 0;
  const values: number[] = [];
  let zeroVolumeDays = 0;

  for (const d of days) {
    const v = d.value_traded;
    if (typeof v !== "number" || !isFinite(v) || v < 0) { daysWithoutRecord += 1; continue; }
    values.push(v / RIAL_TO_MILLION_TOMAN);
    const vol = d.volume;
    if (typeof vol === "number" && isFinite(vol) && vol === 0) zeroVolumeDays += 1;
  }

  if (values.length < MIN_DAYS_FOR_LIQUIDITY) return null;

  const sorted = [...values].sort((a, b) => a - b);
  return {
    observedDays: values.length,
    medianDailyValueMTom: quantile(sorted, 0.5),
    minDailyValueMTom: sorted[0],
    zeroVolumeDays,
    tradedDayRatio: (values.length - zeroVolumeDays) / values.length,
    daysWithoutRecord,
  };
}
