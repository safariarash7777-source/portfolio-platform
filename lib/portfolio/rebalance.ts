/**
 * موتورِ مقایسهٔ داراییِ واقعی با سبدِ هدف — قطعی، خالص، بدونِ I/O.
 *
 * ── چرا اینجا و نه در LLM ───────────────────────────────────────────────────
 * قیمت و محاسبه هرگز به مدلِ زبانی سپرده نمی‌شود. همان ورودی همیشه همان
 * خروجی را می‌دهد و هر عدد قابلِ بازتولید است.
 *
 * ── قاعدهٔ سختِ قیمت ────────────────────────────────────────────────────────
 * قیمتِ بدونِ منبع یا زمان، و قیمتِ کهنه‌تر از آستانه، **ورودیِ محاسبهٔ قطعی
 * نیست**. در آن حالت `valueDelta` برای همهٔ ردیف‌ها `null` می‌ماند و
 * `definitive = false`. عددِ تقریبی تولید نمی‌شود؛ نبودِ داده با صفر یا با
 * «آخرین قیمتِ معلوم» پر نمی‌شود.
 */
import type {
  AssetClassRow,
  CoverageGap,
  HoldingVersion,
  PricePoint,
  RebalanceResult,
  TargetVersion,
} from "./contracts";

export interface RebalanceOptions {
  /** قیمت از چند روز کهنه‌تر، دیگر مبنای عددِ قطعی نیست. */
  maxPriceAgeDays: number;
  /** زمانِ مرجعِ محاسبه. صریح گرفته می‌شود تا تست قطعی بماند. */
  now: Date;
}

export const DEFAULT_REBALANCE_OPTIONS: RebalanceOptions = {
  maxPriceAgeDays: 3,
  now: new Date(0),
};

/** جمعِ وزن‌های هدف باید دقیقاً ۱۰۰ باشد. ۱۱۰٪ رد می‌شود، نرمال نمی‌شود. */
export class InvalidTargetError extends Error {}

const DAY_MS = 86_400_000;
/** تلورانسِ ممیزِ شناور؛ ۷۰+۱۵+۱۵ نباید به‌خاطرِ نمایشِ دودویی رد شود. */
const WEIGHT_EPSILON = 1e-9;

export function assertTargetSumsTo100(target: TargetVersion): void {
  if (target.weights.length === 0) {
    throw new InvalidTargetError("سبد هدف هیچ وزنی ندارد.");
  }
  const seen = new Set<string>();
  for (const w of target.weights) {
    if (seen.has(w.assetClass)) {
      throw new InvalidTargetError(`دستهٔ «${w.assetClass}» دوبار در سبد هدف آمده است.`);
    }
    seen.add(w.assetClass);
    if (!(w.weightPct > 0)) {
      throw new InvalidTargetError(`وزن دستهٔ «${w.assetClass}» باید بزرگ‌تر از صفر باشد.`);
    }
  }
  const sum = target.weights.reduce((s, w) => s + w.weightPct, 0);
  if (Math.abs(sum - 100) > WEIGHT_EPSILON) {
    // ⚠️ اینجا عمداً نرمال‌سازی نمی‌شود. ۷۰/۱۰/۳۰ یعنی کسی اشتباه کرده؛
    // تقسیم بر ۱۱۰ آن اشتباه را پنهان می‌کند و سبدی می‌سازد که هیچ‌کس
    // تأییدش نکرده است.
    throw new InvalidTargetError(
      `مجموع وزن‌های هدف ${sum} درصد است، نه ۱۰۰ درصد. اصلاحش با شماست — خودکار تنظیم نمی‌شود.`
    );
  }
}

function priceAgeDays(price: PricePoint, now: Date): number {
  return (now.getTime() - new Date(price.asOf).getTime()) / DAY_MS;
}

function isUsable(price: PricePoint | undefined): price is PricePoint {
  if (!price) return false;
  if (!Number.isFinite(price.toman)) return false;
  if (price.source.trim() === "") return false;
  if (Number.isNaN(new Date(price.asOf).getTime())) return false;
  return true;
}

/**
 * مقایسه را می‌سازد. `prices` با `positionKey` کلید می‌خورد.
 *
 * نکتهٔ طراحی: وزنِ جاری **فقط** از اقلامِ پوشش‌داده‌شده حساب می‌شود، ولی
 * وقتی پوشش ناقص است آن وزن هم `null` گزارش می‌شود. چون «۶۰٪ طلا از بینِ
 * آنچه قیمت داشت» عددی است که کاربر آن را «۶۰٪ سبدم» می‌خواند — و این
 * گمراه‌کننده است.
 */
export function compareHoldingsToTarget(
  holdings: HoldingVersion,
  target: TargetVersion,
  prices: ReadonlyMap<string, PricePoint>,
  options: RebalanceOptions
): RebalanceResult {
  assertTargetSumsTo100(target);

  const gaps: CoverageGap[] = [];
  const valueByClass = new Map<string, number>();
  let covered = 0;

  for (const pos of holdings.positions) {
    const price = prices.get(pos.positionKey);
    if (!isUsable(price)) {
      gaps.push({
        positionKey: pos.positionKey,
        reason: "no_price",
        detail: "قیمت با منبع و زمانِ معتبر موجود نیست.",
      });
      continue;
    }
    const age = priceAgeDays(price, options.now);
    if (age > options.maxPriceAgeDays) {
      gaps.push({
        positionKey: pos.positionKey,
        reason: "stale_price",
        detail: `قیمت ${Math.floor(age)} روز کهنه است (منبع: ${price.source}).`,
      });
      continue;
    }
    const value = pos.qty * price.toman;
    valueByClass.set(pos.assetClass, (valueByClass.get(pos.assetClass) ?? 0) + value);
    covered += value;
  }

  const fullCoverage = gaps.length === 0;
  const definitive = fullCoverage && holdings.positions.length > 0;
  const totalValue = definitive ? covered : null;

  const classes = new Set<string>([
    ...target.weights.map((w) => w.assetClass),
    ...valueByClass.keys(),
  ]);

  const rows: AssetClassRow[] = [...classes].sort().map((assetClass) => {
    const targetWeightPct = target.weights.find((w) => w.assetClass === assetClass)?.weightPct ?? 0;
    const value = valueByClass.get(assetClass) ?? 0;

    if (!definitive || totalValue === null || totalValue === 0) {
      return {
        assetClass,
        value: definitive ? value : null,
        currentWeightPct: null,
        targetWeightPct,
        deltaPercentagePoints: null,
        valueDelta: null,
      };
    }

    const currentWeightPct = (value / totalValue) * 100;
    return {
      assetClass,
      value,
      currentWeightPct,
      targetWeightPct,
      deltaPercentagePoints: targetWeightPct - currentWeightPct,
      valueDelta: Math.round((targetWeightPct / 100) * totalValue - value),
    };
  });

  const notes: string[] = [];
  if (!definitive) {
    notes.push(
      holdings.positions.length === 0
        ? "هیچ قلمی ثبت نشده، پس مقایسه‌ای انجام نشد."
        : "به‌خاطر پوشش ناقصِ قیمت، مقدار قطعی بازتوازن محاسبه نشد."
    );
  }
  if (target.referenceVersionId === null) {
    notes.push("این سبد هدف به هیچ نسخهٔ مرجعی متصل نیست.");
  }

  return {
    identity: {
      holdingVersionId: holdings.id,
      targetVersionId: target.id,
      pricedAt: options.now.toISOString(),
    },
    rows,
    totalValue,
    fullCoverage,
    gaps,
    definitive,
    notes,
  };
}

/** آیا انحراف از آستانه رد شده — ورودیِ تصمیمِ اعلان، نه خودِ اعلان. */
export function exceedsThreshold(result: RebalanceResult, thresholdPoints: number): boolean {
  if (!result.definitive) return false;
  return result.rows.some(
    (r) => r.deltaPercentagePoints !== null && Math.abs(r.deltaPercentagePoints) >= thresholdPoints
  );
}
