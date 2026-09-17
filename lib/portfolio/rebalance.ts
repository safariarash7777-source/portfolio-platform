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
import { conversionFactor, describeUnitProblem } from "./units";

export interface RebalanceOptions {
  /** قیمت از چند روز کهنه‌تر، دیگر مبنای عددِ قطعی نیست. */
  maxPriceAgeDays: number;
  /**
   * چقدر «جلوتر از حالا» بودنِ مهرِ قیمت تحمل می‌شود. صفر نیست، چون اختلافِ
   * ساعتِ سرورها واقعی است؛ ولی بی‌نهایت هم نیست.
   */
  maxPriceFutureDays: number;
  /** زمانِ مرجعِ محاسبه. صریح گرفته می‌شود تا تست قطعی بماند. */
  now: Date;
}

export const DEFAULT_REBALANCE_OPTIONS: RebalanceOptions = {
  maxPriceAgeDays: 3,
  maxPriceFutureDays: 1,
  now: new Date(0),
};

/** جمعِ وزن‌های هدف باید دقیقاً ۱۰۰ باشد. ۱۱۰٪ رد می‌شود، نرمال نمی‌شود. */
export class InvalidTargetError extends Error {}

const DAY_MS = 86_400_000;
/** برچسب‌هایی که «منبع» نیستند و نباید قیمت را معتبر کنند. */
const UNSOURCED = new Set(["نامشخص", "unknown", "-", "—"]);
/** تلورانسِ ممیزِ شناور؛ ۷۰+۱۵+۱۵ نباید به‌خاطرِ نمایشِ دودویی رد شود. */
const WEIGHT_EPSILON = 1e-9;

export function assertTargetSumsTo100(target: TargetVersion): void {
  // ⚠️ اول از همه: هدفی که خودش مشکل دارد اصلاً نباید به مرحلهٔ جمعِ وزن‌ها
  // برسد. اگر قلمی شناخته نشده باشد و کنار گذاشته شود، بقیه ممکن است
  // اتفاقاً ۱۰۰ جمع بزنند و یک عددِ قطعیِ کاملاً اشتباه بسازند — همان
  // ورودیِ `[{طلا,۱۰۰},{dsf,۲۰}]` که مبلغ بازتوازن می‌داد.
  if (target.problems.length > 0) {
    throw new InvalidTargetError(target.problems.join(" "));
  }
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

/**
 * قیمت «قابلِ استفاده» یعنی چه — سخت‌گیرانه، چون خروجیِ این تابع تعیین
 * می‌کند که عددِ قطعیِ ریبالانس تولید بشود یا نه.
 *
 * ⚠️ نسخهٔ اول فقط `Number.isFinite` را می‌سنجید. یعنی **قیمتِ منفی** و
 * **تاریخِ آینده** هر دو قبول می‌شدند: سنِ منفی هرگز از `maxPriceAgeDays`
 * بیشتر نمی‌شود، پس مهرِ سالِ ۲۱۰۰ «تازه» به حساب می‌آمد و یک عددِ قطعیِ
 * کاملاً بی‌معنا می‌ساخت. هر دو حالا رد می‌شوند.
 *
 * قرارداد صفر: قیمتِ صفر رد می‌شود. «ارزشِ صفر» و «قیمتِ نامعلوم» در عمل
 * قابلِ تفکیک نیستند و صفرِ اشتباه، وزنِ بقیه را متورم می‌کند. اگر قلمی
 * واقعاً بی‌ارزش است، جایش در سبد نیست.
 */
function isUsable(price: PricePoint | undefined, options: RebalanceOptions): price is PricePoint {
  if (!price) return false;
  if (typeof price.toman !== "number" || !Number.isFinite(price.toman)) return false;
  if (price.toman <= 0) return false;
  if (typeof price.source !== "string" || price.source.trim() === "") return false;
  // ⚠️ «نامشخص» منبع نیست. یک برچسبِ جانشین که فقط خالی‌نبودن را راضی کند،
  // همان قاعدهٔ «قیمت باید منبع داشته باشد» را توخالی می‌کند.
  if (UNSOURCED.has(price.source.trim())) return false;
  if (typeof price.unit !== "string" || price.unit.trim() === "") return false;

  const t = new Date(price.asOf).getTime();
  if (Number.isNaN(t)) return false;

  const ageDays = (options.now.getTime() - t) / DAY_MS;
  if (ageDays < -options.maxPriceFutureDays) return false;
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
    // ⚠️ نقشه با `positionKey` کلید می‌خورد، نه با نماد. قیمت‌ها از
    // `symbol_history` با نماد می‌آیند و نگاشتشان به قلم **صریح** و بیرون از
    // این تابع انجام می‌شود (`resolvePricesByPosition`). قبلاً همین‌جا با
    // `positionKey` در نقشه‌ای که کلیدش نماد بود جست‌وجو می‌شد، پس قلمی که
    // کلیدش با نمادش فرق داشت بی‌صدا «بدونِ قیمت» می‌شد.
    const price = prices.get(pos.positionKey);
    if (!isUsable(price, options)) {
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
    // ⚠️ واحدِ مقدار باید با واحدِ قیمت سازگار باشد. «۱ هزار سهم» با قیمتِ
    // «هر سهم» یعنی ضربِ ۱۰۰۰ — نه ضربِ ۱. ضریبِ ناشناخته حدس زده نمی‌شود.
    const conv = conversionFactor(pos.unit, price.unit);
    if (!conv.ok) {
      gaps.push({
        positionKey: pos.positionKey,
        reason: "unit_mismatch",
        detail: `${describeUnitProblem(conv.reason)} (مقدار: «${pos.unit}» · قیمت: «${price.unit}»)`,
      });
      continue;
    }

    // مقدار هم باید معتبر باشد؛ `qty` از دیتابیس می‌آید ولی حاصل‌ضرب می‌تواند
    // سرریز کند یا `NaN` شود و عددِ قطعیِ بی‌معنا بسازد.
    const value = pos.qty * conv.factor * price.toman;
    if (!Number.isFinite(value) || value <= 0) {
      gaps.push({
        positionKey: pos.positionKey,
        reason: "no_price",
        detail: "حاصل‌ضربِ مقدار در قیمت معتبر نیست.",
      });
      continue;
    }
    valueByClass.set(pos.assetClass, (valueByClass.get(pos.assetClass) ?? 0) + value);
    covered += value;
  }

  const fullCoverage = gaps.length === 0;

  // ⚠️ گاردِ سرریزِ **جمع**، نه فقط تکِ اقلام.
  // هر قلم می‌تواند `finite` باشد ولی جمعشان `Infinity` شود: دو قلم با
  // `qty = 1e308` و قیمتِ ۱، هرکدام معتبرند و جمعشان از بردِ `double`
  // بیرون می‌زند. آن‌وقت `valueDelta` به `NaN` می‌رسید و `definitive` هم
  // `true` می‌ماند — یعنی یک «عددِ قطعی» که اصلاً عدد نیست.
  const totalUsable = Number.isFinite(covered) && covered > 0;
  const definitive = fullCoverage && holdings.positions.length > 0 && totalUsable;
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
    const valueDelta = Math.round((targetWeightPct / 100) * totalValue - value);

    // خروجیِ محاسبه هم بررسی می‌شود، نه فقط ورودی‌اش: اگر به هر دلیل
    // `NaN`/`Infinity` بیرون بیاید، `null` گزارش می‌شود نه عددِ بی‌معنا.
    const safe = (n: number): number | null => (Number.isFinite(n) ? n : null);

    return {
      assetClass,
      value,
      currentWeightPct: safe(currentWeightPct),
      targetWeightPct,
      deltaPercentagePoints: safe(targetWeightPct - currentWeightPct),
      valueDelta: safe(valueDelta),
    };
  });

  const notes: string[] = [];
  if (!definitive) {
    notes.push(
      holdings.positions.length === 0
        ? "هیچ قلمی ثبت نشده، پس مقایسه‌ای انجام نشد."
        : !totalUsable && fullCoverage
          ? "جمع ارزش‌ها از محدودهٔ عددی معتبر بیرون است، پس مقدار قطعی محاسبه نشد."
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
