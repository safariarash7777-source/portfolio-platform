import type { PriceReturnObservation, ReturnWindowKey } from "./fundReturns";
import { bubblePercent as computeBubblePercent, MAX_PAIRING_GAP_HOURS } from "./fundBubble";
import { sourceTime } from "../market-quality";

/** A source-attested class is required; a symbol/category is never a class mapping. */
export type FundUnitClass = "etf-tradable" | "ordinary-subscription" | "preferred-tradable";
export interface FundClassEvidence {
  unitClass: FundUnitClass;
  source: string;
}

export interface FundComparisonRow {
  id: string;
  type?: string | null;
  unit: "toman" | "usd";
  price: number;
  closingPrice?: number | null;
  sourceDate?: string | null;
  sourceTime?: string | null;
  nav?: number | null;
  navDate?: string | null;
  navTime?: string | null;
  navState?: string;
  navReason?: string | null;
  /** Existing upstream feed does not provide these. Absence stays unknown. */
  classEvidence?: FundClassEvidence | null;
  navClassEvidence?: FundClassEvidence | null;
  /** Legacy display value, never authoritative for the new comparison. */
  bubblePercent?: number | null;
  returnObservations?: Partial<Record<ReturnWindowKey, PriceReturnObservation | null>>;
}

export type ComparisonMetric = "group" | "bubble" | ReturnWindowKey;
export interface ComparisonIssue {
  code: string;
  metric: ComparisonMetric;
  ids: string[];
  message: string;
}
export interface FundComparison {
  issues: ComparisonIssue[];
  /** Only validated, comparable values; retained observations live on input rows. */
  bubbles: (number | null)[];
  returns: Record<ReturnWindowKey, (number | null)[]>;
}

export const MAX_FUND_COMPARISON = 5;

export const UNIT_CLASS_LABELS: Record<FundUnitClass, string> = {
  "etf-tradable": "واحد قابل معامله",
  "ordinary-subscription": "واحد عادی صدور و ابطال",
  "preferred-tradable": "واحد ممتاز قابل معامله",
};

export function evidencedClass(evidence: FundClassEvidence | null | undefined): FundUnitClass | null {
  return evidence?.source?.trim() && Object.hasOwn(UNIT_CLASS_LABELS, evidence.unitClass) ? evidence.unitClass : null;
}

/** Only exact provider type/currency matches are selectable together; no broad-category approximation. */
export function fundSelectionIssue(anchor: FundComparisonRow | undefined, candidate: FundComparisonRow): string | null {
  if (!anchor) return null;
  if (!anchor.type?.trim() || !candidate.type?.trim()) return "نوع صندوق در منبع نامشخص است";
  if (anchor.type.trim() !== candidate.type.trim()) return "نوع صندوق با انتخاب اول یکسان نیست";
  if (anchor.unit !== candidate.unit) return "واحد پول با انتخاب اول یکسان نیست";
  return null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day)
  && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

/** No I/O, ranking, new time policy, or repair of missing source metadata. */
export function compareFunds(rows: readonly FundComparisonRow[]): FundComparison {
  const issues: ComparisonIssue[] = [];
  const add = (metric: ComparisonMetric, code: string, message: string, affected = rows) => {
    issues.push({ metric, code, message, ids: affected.map(row => row.id) });
  };
  if (rows.length < 2 || rows.length > MAX_FUND_COMPARISON) add("group", "selection-size", "برای مقایسه دو تا پنج صندوق انتخاب کنید");
  if (new Set(rows.map(row => row.id)).size !== rows.length) add("group", "duplicate", "یک صندوق چند بار انتخاب شده است");
  const different = rows.filter(row => fundSelectionIssue(rows[0], row));
  if (different.length) add("group", "type-or-unit", "نوع منبع و واحد پول صندوق‌ها باید یکسان باشد", different);
  const unknown = rows.filter(row => !evidencedClass(row.classEvidence));
  if (unknown.length) add("group", "unknown-class", "طبقه واحد با منبع مستند مشخص نشده است", unknown);
  const classes = new Set(rows.map(row => evidencedClass(row.classEvidence)).filter(Boolean));
  if (classes.size > 1) add("group", "class-mismatch", "واحد عادی صدور و ابطال با واحد قابل معامله قابل مقایسه نیست");

  const navClass = rows.filter(row => !evidencedClass(row.navClassEvidence)
    || evidencedClass(row.navClassEvidence) !== evidencedClass(row.classEvidence));
  if (navClass.length) add("bubble", "nav-class", "تطبیق طبقه واحد NAV با طبقه قیمت مستند نیست", navClass);
  const notTraded = rows.filter(row => evidencedClass(row.classEvidence) === "ordinary-subscription");
  if (notTraded.length) add("bubble", "not-traded", "واحد عادی صدور و ابطال قیمت بازار قابل معامله ندارد", notTraded);
  const differentCurrency = rows.filter(row => row.unit !== "toman");
  if (differentCurrency.length) add("bubble", "nav-currency", "NAV موجود تومان است؛ تطبیق ارز قیمت و NAV تأیید نشده است", differentCurrency);
  const noBubble = rows.filter(row => row.navState !== "ready"
    || !finite(row.nav) || row.nav <= 0 || !finite(row.closingPrice) || row.closingPrice <= 0
    || computeBubblePercent(row.closingPrice, row.nav) === null);
  if (noBubble.length) add("bubble", "nav-quality", "حباب معتبر با زمان قیمت و NAV قابل تطبیق در دسترس نیست", noBubble);
  // Existing per-row NAV quality owns freshness/pairing. Between funds require
  // the same source day; comparing different market days is not a cross-section.
  const clocks = rows.filter(row => sourceTime(row.sourceDate, row.sourceTime) === null
    || sourceTime(row.navDate, row.navTime) === null);
  if (clocks.length) add("bubble", "missing-clock", "تاریخ یا ساعت مستقل قیمت و NAV ناقص است", clocks);
  const unpaired = rows.filter(row => {
    const priceAt = sourceTime(row.sourceDate, row.sourceTime);
    const navAt = sourceTime(row.navDate, row.navTime);
    return priceAt !== null && navAt !== null && Math.abs(priceAt - navAt) > MAX_PAIRING_GAP_HOURS * 3_600_000;
  });
  if (unpaired.length) add("bubble", "unpaired-clock", "فاصله زمان قیمت و NAV از قاعده تطبیق موجود بیشتر است", unpaired);
  if (new Set(rows.map(row => row.sourceDate)).size > 1 || new Set(rows.map(row => row.navDate)).size > 1) {
    add("bubble", "different-day", "تاریخ مشاهدات قیمت یا NAV بین صندوق‌ها یکسان نیست");
  }

  for (const window of ["w1", "m1", "m3"] as const) {
    const invalid = rows.filter(row => {
      const obs = row.returnObservations?.[window];
      return !obs || !finite(obs.value) || obs.source !== "symbol_history" || obs.method !== "unadjusted-price"
        || !validDay(obs.periodStart) || !validDay(obs.periodEnd) || obs.periodStart >= obs.periodEnd;
    });
    if (invalid.length) add(window, "missing-return", "بازده با تاریخ واقعی ابتدا و انتها و روش مشخص موجود نیست", invalid);
    const observations = rows.map(row => row.returnObservations?.[window]).filter((v): v is PriceReturnObservation => !!v);
    if (observations.some(obs => obs.startField !== "close" || obs.endField !== "close")) {
      add(window, "mixed-price-basis", "بازده از قیمت پایانی یکسان در هر دو سر دوره ساخته نشده است");
    }
    if (new Set(observations.map(obs => `${obs.periodStart}/${obs.periodEnd}/${obs.method}`)).size > 1) {
      add(window, "different-period", "ابتدا و انتهای واقعی بازده صندوق‌ها یکسان نیست");
    }
  }

  const blocked = (metric: ComparisonMetric) => issues.some(issue => issue.metric === "group" || issue.metric === metric);
  return {
    issues,
    // Only after all class/unit/date/quality gates. No source-reported sign or
    // rounded legacy bubble is reused as our calculation.
    bubbles: rows.map(row => blocked("bubble") ? null : computeBubblePercent(row.closingPrice, row.nav)),
    returns: Object.fromEntries((["w1", "m1", "m3"] as const).map(window => [window,
      rows.map(row => blocked(window) ? null : row.returnObservations?.[window]?.value ?? null),
    ])) as FundComparison["returns"],
  };
}
