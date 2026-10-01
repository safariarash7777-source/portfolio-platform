/**
 * بازدهِ سبد — با جداسازیِ جریانِ نقدی از سود.
 *
 * ── چرا وجودِ نوعِ «واریز/برداشت» در جدول کافی نیست ─────────────────────────
 * `transactions.type` از قبل چهار مقدار دارد. ولی داشتنِ ستون ثابت نمی‌کند
 * محاسبه درست است — اگر موتور فقط «ارزشِ امروز منهای ارزشِ دیروز» را بگیرد،
 * واریزِ ۱۰ میلیون دقیقاً شبیهِ سودِ ۱۰ میلیون به نظر می‌رسد. جداسازی باید در
 * **محاسبه** اتفاق بیفتد و آزمون شود، نه در schema.
 *
 * ── قاعدهٔ سختِ داده ────────────────────────────────────────────────────────
 * بدونِ دو سرِ بازه، بازده `null` است. صفر برنمی‌گردد و «تقریباً» ساخته
 * نمی‌شود — نبودِ داده یعنی نبودِ داده.
 */

export type FlowKind = "خرید" | "فروش" | "واریز" | "برداشت";

export interface CashFlow {
  kind: FlowKind;
  /** تومان، مثبت. جهت از `kind` می‌آید نه از علامت. */
  amount: number;
  occurredAt: string;
}

export interface ValuePoint {
  asOf: string;
  value: number;
}

export interface PerformanceResult {
  /** سودِ خالص پس از کنارگذاشتنِ جریانِ نقدی. `null` = قابلِ محاسبه نیست. */
  netProfit: number | null;
  /** درصد نسبت به سرمایهٔ درگیر. `null` = قابلِ محاسبه نیست. */
  returnPct: number | null;
  /** جمعِ واریز منهای برداشت در بازه. */
  netExternalFlow: number;
  /** چرا `null` — همیشه پر است وقتی محاسبه نشد. */
  unavailableReason: string | null;
}

/**
 * ⚠️ فقط «واریز» و «برداشت» جریانِ بیرونی‌اند.
 *
 * «خرید» و «فروش» جابه‌جاییِ درونِ همان سبدند: نقد به دارایی و برعکس. اگر
 * آن‌ها را هم جریانِ بیرونی بشماریم، هر معامله بازده را تحریف می‌کند.
 */
export function isExternalFlow(kind: FlowKind): boolean {
  return kind === "واریز" || kind === "برداشت";
}

function signedExternal(flow: CashFlow): number {
  if (!isExternalFlow(flow.kind)) return 0;
  return flow.kind === "واریز" ? flow.amount : -flow.amount;
}

function inWindow(at: string, start: ValuePoint, end: ValuePoint): boolean {
  const t = new Date(at).getTime();
  return t > new Date(start.asOf).getTime() && t <= new Date(end.asOf).getTime();
}

/**
 * سود = (ارزشِ پایان − ارزشِ آغاز) − جریانِ خالصِ بیرونی.
 *
 * مخرجِ درصد «سرمایهٔ درگیر» است: ارزشِ آغاز به‌علاوهٔ واریزهای بازه. با
 * مخرجِ صرفاً «ارزشِ آغاز»، حسابی که با صفر شروع شده و بعد واریز گرفته،
 * درصدِ بی‌نهایت می‌دهد.
 */
export function computePerformance(
  start: ValuePoint | null,
  end: ValuePoint | null,
  flows: readonly CashFlow[]
): PerformanceResult {
  const netExternalFlow = (start && end ? flows.filter((f) => inWindow(f.occurredAt, start, end)) : [])
    .reduce((sum, f) => sum + signedExternal(f), 0);

  if (!start || !end) {
    return {
      netProfit: null,
      returnPct: null,
      netExternalFlow,
      unavailableReason: "برای محاسبهٔ بازده، ارزشِ سبد در ابتدا و انتهای بازه لازم است.",
    };
  }
  if (new Date(end.asOf).getTime() <= new Date(start.asOf).getTime()) {
    return {
      netProfit: null,
      returnPct: null,
      netExternalFlow,
      unavailableReason: "بازهٔ زمانی معتبر نیست.",
    };
  }

  const windowFlows = flows.filter((f) => inWindow(f.occurredAt, start, end));
  const netProfit = end.value - start.value - netExternalFlow;

  const deposits = windowFlows
    .filter((f) => f.kind === "واریز")
    .reduce((s, f) => s + f.amount, 0);
  const invested = start.value + deposits;

  if (invested <= 0) {
    return {
      netProfit,
      returnPct: null,
      netExternalFlow,
      unavailableReason: "سرمایهٔ درگیر صفر است، پس درصد بازده معنا ندارد.",
    };
  }

  return {
    netProfit,
    returnPct: (netProfit / invested) * 100,
    netExternalFlow,
    unavailableReason: null,
  };
}
