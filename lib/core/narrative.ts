// روایت‌ساز «امروز بازار» — T3 ممیزی (WP2).
// کد قطعی template-ای؛ هیچ LLM و هیچ عدد ساختگی. ورودی: رژیم بازار + جمع‌های
// جریان پول روز از اسنپ‌شات. دادهٔ ناموجود → جمله ساخته نمی‌شود (حالت خالی صادقانه).

import type { RegimeResult } from "./regime";
import { toPersianDigits, formatTomanShort } from "@/lib/format";

export interface FlowAggregates {
  /** خالص ورود پول حقیقی کل سهام (تومان)؛ null اگر داده ناکافی */
  netFlowToman: number | null;
  /** تعداد نمادهای دارای ورود خالص مثبت */
  inflowCount: number;
  /** تعداد نمادهای دارای خروج خالص */
  outflowCount: number;
  /** جمع ارزش معاملات سهام (تومان)؛ null اگر ناموجود */
  totalValueToman: number | null;
  /** نماد با بیشترین ورود خالص حقیقی */
  topInflow: { symbol: string; flowToman: number } | null;
  /** نماد با بیشترین خروج خالص حقیقی */
  topOutflow: { symbol: string; flowToman: number } | null;
}

export interface SnapshotStockLike {
  id?: string;
  buyI?: number | null;
  sellI?: number | null;
  closingPrice?: number | null;
  price?: number | null;
  value?: number | null;
}

function num(x: unknown): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** جمع‌های جریان پول حقیقی روز از ردیف‌های اسنپ‌شات — تابع خالص. */
export function computeFlowAggregates(stocks: SnapshotStockLike[]): FlowAggregates {
  let net = 0;
  let covered = 0;
  let inflowCount = 0;
  let outflowCount = 0;
  let totalValue = 0;
  let totalValueN = 0;
  let topInflow: FlowAggregates["topInflow"] = null;
  let topOutflow: FlowAggregates["topOutflow"] = null;

  for (const s of stocks) {
    const buyI = num(s.buyI);
    const sellI = num(s.sellI);
    const px = num(s.closingPrice) ?? num(s.price);
    const v = num(s.value);
    if (v != null) {
      totalValue += v;
      totalValueN++;
    }
    if (buyI == null || sellI == null || px == null) continue;
    const flow = (buyI - sellI) * px;
    net += flow;
    covered++;
    if (flow > 0) inflowCount++;
    else if (flow < 0) outflowCount++;
    if (flow > 0 && (!topInflow || flow > topInflow.flowToman) && s.id) {
      topInflow = { symbol: s.id, flowToman: flow };
    }
    if (flow < 0 && (!topOutflow || flow < topOutflow.flowToman) && s.id) {
      topOutflow = { symbol: s.id, flowToman: flow };
    }
  }

  return {
    netFlowToman: covered >= 50 ? net : null, // پوشش ناکافی = بدون عدد
    inflowCount,
    outflowCount,
    totalValueToman: totalValueN >= 50 ? totalValue : null,
    topInflow,
    topOutflow,
  };
}

/**
 * ۳–۵ جملهٔ روایی قطعی از رژیم + جریان روز.
 * هر جمله فقط وقتی ساخته می‌شود که دادهٔ پشتوانه‌اش موجود باشد.
 */
export function buildNarratives(regime: RegimeResult, flow: FlowAggregates): string[] {
  const out: string[] = [];

  // ۱) جملهٔ رژیم
  if (regime.data_ok && regime.score != null) {
    const tone =
      regime.label === "سازنده"
        ? "پهنای بازار به سود روندهای صعودی است"
        : regime.label === "فرسایشی"
        ? "پهنای بازار ضعیف است و اکثر نمادها زیر میانگین‌های خود معامله می‌شوند"
        : "بازار در تعادل است و برتری روشنی بین خریداران و فروشندگان دیده نمی‌شود";
    out.push(
      `چشم‌انداز آماری بازار «${regime.label}» با امتیاز ${toPersianDigits(regime.score)} از ۱۰۰ است؛ ${tone}.`
    );
  }

  // ۲) پهنای روند
  if (regime.breadthAboveSma50Pct != null) {
    out.push(
      `${toPersianDigits(regime.breadthAboveSma50Pct)}٪ از نمادهای جهانِ بررسی بالای میانگین ۵۰ روزهٔ خود قرار دارند.`
    );
  }

  // ۳) جریان پول کل روز
  if (flow.netFlowToman != null) {
    const dir = flow.netFlowToman >= 0 ? "ورود" : "خروج";
    out.push(
      `برآیند پول حقیقی امروز ${dir} خالص ${formatTomanShort(Math.abs(flow.netFlowToman))} بود (${toPersianDigits(flow.inflowCount)} نماد ورود، ${toPersianDigits(flow.outflowCount)} نماد خروج).`
    );
  }

  // ۴) قهرمان ورود/خروج
  if (flow.topInflow) {
    out.push(
      `بیشترین ورود پول حقیقی به «${flow.topInflow.symbol}» با ${formatTomanShort(flow.topInflow.flowToman)} رسید.`
    );
  }
  if (out.length < 5 && flow.topOutflow) {
    out.push(
      `سنگین‌ترین خروج پول حقیقی از «${flow.topOutflow.symbol}» با ${formatTomanShort(Math.abs(flow.topOutflow.flowToman))} ثبت شد.`
    );
  }

  return out.slice(0, 5);
}
