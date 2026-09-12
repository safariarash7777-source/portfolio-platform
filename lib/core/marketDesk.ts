/**
 * میزِ بازار — «امروز چه چیزی ارزشِ نگاهِ دوباره دارد».
 *
 * ── چه چیزی هست و چه چیزی نیست ─────────────────────────────────────────────
 * این ماژول **مشاهده** تولید می‌کند، نه نظر. هر مشاهده سه چیز دارد: یک
 * تعریفِ صریح، عددی که آن تعریف را برآورده کرده، و اینکه داده تا کجا دیده شده.
 * هیچ ردیفی بدونِ `driver` ساخته نمی‌شود؛ یعنی کاربر همیشه می‌تواند بپرسد
 * «چرا این اینجاست» و جواب عدد باشد، نه لحن.
 *
 * ── چرا پوشش (`coverage`) بخشی از خروجی است، نه یک یادداشتِ کناری ──────────
 * یک میزِ خالی دو معنیِ کاملاً متفاوت دارد: «امروز چیزی نبود» و «امروز چیزی
 * ندیدیم». اگر این دو را از هم جدا نکنیم، روزی که فید NAV قطع است میز آرام
 * به‌نظر می‌رسد — و آرامش دقیقاً غلط‌ترین پیامِ ممکن است. پس هر قاعده گزارش
 * می‌دهد چند ابزار را **توانست** بسنجد و چند تا را نه.
 *
 * ── مرزها ──────────────────────────────────────────────────────────────────
 * • فقط از اسنپ‌شاتی می‌خواند که همین حالا در Production هست — هیچ migration
 *   و هیچ منبعِ تازه‌ای لازم ندارد.
 * • مقایسهٔ صندوق‌ها **فقط درونِ هم‌نوع** است (`lib/core/fundPeers`).
 * • دادهٔ نبوده `null` می‌ماند و به مشاهده تبدیل نمی‌شود.
 * • خروجی توصیفی است؛ هیچ جهت‌گیری و هیچ اقدامی پیشنهاد نمی‌شود.
 */
import { peerGroupStats, peerPosition, MIN_PEERS_FOR_STATS, type PeerRow } from "./fundPeers";
import { NAV_STALE_HOURS, navAtIso } from "./fundBubble";
import { jalaliYmdToGregorian } from "./jalali";

/** دسته‌های مشاهده. هر کدام یک تعریفِ عددیِ ثابت دارد. */
export type DeskKind =
  | "nav_stale"        // ساعتِ NAV از آستانه کهنه‌تر است
  | "nav_missing"      // صندوق هست، NAV نیست
  | "premium_outlier"  // حبابِ صندوق از میانهٔ هم‌نوع‌هایش دور است
  | "band_edge"        // قیمت به آستانهٔ مجازِ دامنه نزدیک است
  | "board_gap";       // فاصلهٔ قیمتِ آخرین معامله و قیمتِ پایانی

/** باندِ کیفی. عمداً سه‌تایی و بدونِ عددِ ترکیبی — امتیازِ واحد نمی‌سازیم. */
export type DeskBand = "قابل‌توجه" | "متوسط" | "خفیف";

export interface DeskDriver {
  label: string;
  value: string;
}

export interface DeskObservation {
  id: string;
  kind: DeskKind;
  symbol: string;
  faName: string;
  headline: string;
  band: DeskBand;
  drivers: DeskDriver[];
  /** برای مرتب‌سازیِ داخلی — هرگز به‌عنوان «امتیاز» نمایش داده نمی‌شود. */
  magnitude: number;
}

export interface RuleCoverage {
  kind: DeskKind;
  /** چند ابزار نامزدِ این قاعده بودند */
  candidates: number;
  /** از آنها چند تا دادهٔ لازم را داشتند */
  examined: number;
  /** چند تا شرط را برآورده کردند */
  matched: number;
  /** اگر قاعده اصلاً نتوانست اجرا شود، چرا */
  blocked: string | null;
}

export interface DeskResult {
  observations: DeskObservation[];
  coverage: RuleCoverage[];
  /** ابزارهایی که اصلاً وارد هیچ قاعده‌ای نشدند چون دادهٔ پایه نداشتند */
  unusable: number;
  generatedAt: number;
}

/* ── آستانه‌ها ───────────────────────────────────────────────────────────── */

/** فاصله تا آستانهٔ دامنه، برحسبِ درصدِ خودِ قیمت. */
export const BAND_EDGE_PCT = 1.5;
/** فاصلهٔ آخرین معامله و پایانی که ارزشِ نگاه دارد. */
export const BOARD_GAP_PCT = 2;
/** حباب چند واحدِ درصد دورتر از میانهٔ هم‌نوع‌ها «دور» است. */
export const PREMIUM_GAP_PP = 5;

/** ورودیِ حداقلی — عمداً زیرمجموعهٔ `IrStockRow` تا این ماژول به UI وابسته نشود. */
export interface DeskFund {
  id: string;
  faName: string;
  price: number | null;
  type?: string | null;
  nav?: number | null;
  bubblePercent?: number | null;
  navDate?: string | null;
  navTime?: string | null;
}

export interface DeskStock {
  id: string;
  faName: string;
  price: number | null;
  closingPrice?: number | null;
  bandHigh?: number | null;
  bandLow?: number | null;
  volume?: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function bandOf(magnitude: number, mid: number, high: number): DeskBand {
  if (magnitude >= high) return "قابل‌توجه";
  if (magnitude >= mid) return "متوسط";
  return "خفیف";
}

function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}٪`;
}

/* ── قاعده‌ها ────────────────────────────────────────────────────────────── */

/**
 * ساعتِ NAV. «کهنه» و «نبود» دو حالتِ متفاوت‌اند و **جدا** گزارش می‌شوند:
 * اولی یعنی فید کار می‌کند ولی عقب است، دومی یعنی برای این صندوق چیزی نیامده.
 * یکی‌کردنشان یعنی روزی که فید قطع است، «همه‌چیز کمی کهنه» به‌نظر برسد.
 */
function navRules(funds: readonly DeskFund[], now: number): {
  obs: DeskObservation[]; stale: RuleCoverage; missing: RuleCoverage;
} {
  const obs: DeskObservation[] = [];
  let examined = 0, staleN = 0, missing = 0;

  for (const f of funds) {
    const at = navAtIso(f.navDate, f.navTime, jalaliYmdToGregorian);
    if (!at) {
      missing += 1;
      obs.push({
        id: `nav_missing:${f.id}`,
        kind: "nav_missing",
        symbol: f.id,
        faName: f.faName,
        headline: "ساعتِ معتبری برای NAV نیامده",
        band: "متوسط",
        drivers: [
          { label: "تاریخِ NAV", value: f.navDate ? String(f.navDate) : "نیامده" },
          { label: "ساعتِ NAV", value: f.navTime ? String(f.navTime) : "نیامده" },
        ],
        magnitude: 0,
      });
      continue;
    }
    examined += 1;
    const ageH = (now - Date.parse(at.iso)) / 3_600_000;
    if (ageH <= NAV_STALE_HOURS) continue;
    staleN += 1;
    obs.push({
      id: `nav_stale:${f.id}`,
      kind: "nav_stale",
      symbol: f.id,
      faName: f.faName,
      headline: "NAV از آستانهٔ کهنگی گذشته",
      band: bandOf(ageH, NAV_STALE_HOURS * 2, NAV_STALE_HOURS * 4),
      drivers: [
        { label: "سنِ NAV", value: `${Math.round(ageH)} ساعت` },
        { label: "آستانه", value: `${NAV_STALE_HOURS} ساعت` },
        { label: "دقتِ زمان", value: at.precision === "minute" ? "دقیقه" : "فقط روز" },
      ],
      magnitude: ageH,
    });
  }

  return {
    obs,
    stale: { kind: "nav_stale", candidates: funds.length, examined, matched: staleN, blocked: null },
    missing: {
      kind: "nav_missing", candidates: funds.length, examined: funds.length, matched: missing,
      blocked: null,
    },
  };
}

/**
 * حبابِ دور از میانهٔ **هم‌نوع**. گروهِ کم‌جمعیت‌تر از `MIN_PEERS_FOR_STATS`
 * اصلاً آمار نمی‌گیرد — نه با میانهٔ دو-عضوی که فقط توهمِ دقت است.
 */
function premiumRule(funds: readonly DeskFund[]): { obs: DeskObservation[]; cov: RuleCoverage } {
  const rows: PeerRow[] = funds.map((f) => ({
    id: f.id, type: f.type ?? null, value: num(f.bubblePercent),
  }));
  const withValue = rows.filter((r) => r.value !== null).length;
  const stats = peerGroupStats(rows);

  if (stats.size === 0) {
    return {
      obs: [],
      cov: {
        kind: "premium_outlier", candidates: funds.length, examined: withValue, matched: 0,
        blocked: `هیچ گروهِ هم‌نوعی با دستِ‌کم ${MIN_PEERS_FOR_STATS} عضوِ دارای حباب نبود`,
      },
    };
  }

  const byId = new Map(funds.map((f) => [f.id, f]));
  const obs: DeskObservation[] = [];
  let examined = 0;

  for (const r of rows) {
    const pos = peerPosition(r, stats, rows);
    if (!pos) continue;
    examined += 1;
    const gap = pos.vsMedian;
    if (Math.abs(gap) < PREMIUM_GAP_PP) continue;
    const f = byId.get(r.id);
    if (!f) continue;
    obs.push({
      id: `premium:${r.id}`,
      kind: "premium_outlier",
      symbol: r.id,
      faName: f.faName,
      headline: `حباب نسبت به میانهٔ «${pos.type}» فاصله دارد`,
      band: bandOf(Math.abs(gap), PREMIUM_GAP_PP * 2, PREMIUM_GAP_PP * 4),
      drivers: [
        { label: "حبابِ این صندوق", value: pct(pos.value) },
        { label: `میانهٔ ${pos.type}`, value: pct(pos.median) },
        { label: "فاصله", value: `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)} واحدِ درصد` },
        { label: "جایگاه در گروه", value: `${pos.rank} از ${pos.of}` },
      ],
      magnitude: Math.abs(gap),
    });
  }

  return {
    obs,
    cov: { kind: "premium_outlier", candidates: funds.length, examined, matched: obs.length, blocked: null },
  };
}

/** نزدیکیِ قیمت به آستانهٔ مجازِ دامنه — یک واقعیتِ تابلو، بدونِ تفسیر. */
function bandEdgeRule(stocks: readonly DeskStock[]): { obs: DeskObservation[]; cov: RuleCoverage } {
  const obs: DeskObservation[] = [];
  let examined = 0;

  for (const s of stocks) {
    const p = num(s.price);
    const hi = num(s.bandHigh);
    const lo = num(s.bandLow);
    if (p === null || p <= 0 || (hi === null && lo === null)) continue;
    examined += 1;

    const dHi = hi !== null ? ((hi - p) / p) * 100 : null;
    const dLo = lo !== null ? ((p - lo) / p) * 100 : null;
    const near = [
      dHi !== null && dHi >= 0 && dHi <= BAND_EDGE_PCT ? { side: "سقفِ دامنه", d: dHi, ref: hi as number } : null,
      dLo !== null && dLo >= 0 && dLo <= BAND_EDGE_PCT ? { side: "کفِ دامنه", d: dLo, ref: lo as number } : null,
    ].filter(Boolean) as { side: string; d: number; ref: number }[];
    if (near.length === 0) continue;
    const n = near.sort((a, b) => a.d - b.d)[0];

    obs.push({
      id: `band:${s.id}`,
      kind: "band_edge",
      symbol: s.id,
      faName: s.faName,
      headline: `قیمت به ${n.side} نزدیک است`,
      band: bandOf(BAND_EDGE_PCT - n.d, BAND_EDGE_PCT * 0.5, BAND_EDGE_PCT * 0.85),
      drivers: [
        { label: "قیمت", value: String(Math.round(p)) },
        { label: n.side, value: String(Math.round(n.ref)) },
        { label: "فاصله", value: pct(n.d, 2) },
      ],
      magnitude: BAND_EDGE_PCT - n.d,
    });
  }

  return { obs, cov: { kind: "band_edge", candidates: stocks.length, examined, matched: obs.length, blocked: null } };
}

/** فاصلهٔ قیمتِ آخرین معامله و قیمتِ پایانی. */
function boardGapRule(stocks: readonly DeskStock[]): { obs: DeskObservation[]; cov: RuleCoverage } {
  const obs: DeskObservation[] = [];
  let examined = 0;

  for (const s of stocks) {
    const last = num(s.price);
    const close = num(s.closingPrice);
    if (last === null || close === null || close <= 0) continue;
    examined += 1;
    const gap = ((last - close) / close) * 100;
    if (Math.abs(gap) < BOARD_GAP_PCT) continue;
    obs.push({
      id: `gap:${s.id}`,
      kind: "board_gap",
      symbol: s.id,
      faName: s.faName,
      headline: "آخرین معامله و قیمتِ پایانی از هم فاصله دارند",
      band: bandOf(Math.abs(gap), BOARD_GAP_PCT * 2, BOARD_GAP_PCT * 3.5),
      drivers: [
        { label: "آخرین معامله", value: String(Math.round(last)) },
        { label: "قیمتِ پایانی", value: String(Math.round(close)) },
        { label: "فاصله", value: `${gap >= 0 ? "+" : "−"}${pct(Math.abs(gap))}` },
      ],
      magnitude: Math.abs(gap),
    });
  }

  return { obs, cov: { kind: "board_gap", candidates: stocks.length, examined, matched: obs.length, blocked: null } };
}

/* ── ترکیب ──────────────────────────────────────────────────────────────── */

/**
 * میز را می‌سازد.
 *
 * `limit` فقط **نمایش** را کوتاه می‌کند؛ `coverage` همیشه عددِ کاملِ قبل از
 * برش را می‌گوید، وگرنه «۵ مورد» با «فقط ۵ مورد بود» اشتباه گرفته می‌شود.
 */
export function buildDesk(
  input: { funds?: readonly DeskFund[]; stocks?: readonly DeskStock[] },
  opts: { now?: number; limit?: number } = {},
): DeskResult {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 12;
  const funds = input.funds ?? [];
  const stocks = input.stocks ?? [];

  const nav = navRules(funds, now);
  const prem = premiumRule(funds);
  const band = bandEdgeRule(stocks);
  const gap = boardGapRule(stocks);

  const all = [...nav.obs, ...prem.obs, ...band.obs, ...gap.obs];

  // مرتب‌سازی: اول باندِ کیفی، بعد بزرگیِ درونِ همان باند. باندها با هم جمع
  // نمی‌شوند و به یک عدد تبدیل نمی‌شوند.
  const rank: Record<DeskBand, number> = { "قابل‌توجه": 0, "متوسط": 1, "خفیف": 2 };
  all.sort((a, b) => rank[a.band] - rank[b.band] || b.magnitude - a.magnitude || a.symbol.localeCompare(b.symbol));

  const unusable =
    funds.filter((f) => num(f.price) === null).length +
    stocks.filter((s) => num(s.price) === null).length;

  return {
    observations: all.slice(0, limit),
    coverage: [nav.stale, nav.missing, prem.cov, band.cov, gap.cov],
    unusable,
    generatedAt: now,
  };
}
