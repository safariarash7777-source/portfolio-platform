/**
 * سبدِ مرجع — قراردادِ نسخه‌دار.
 *
 * ── دو چیزِ متفاوت که نباید قاطی شوند ───────────────────────────────────────
 *
 *   **هدفِ اعلام‌شده**  ساختارِ ۷۰/۱۵/۱۵ که مالک در تعریفِ مأموریت داده است.
 *                      این یک *قصد* است، نه وضعیتِ زندهٔ سبد.
 *   **نسخهٔ نهایی**     چیزی که واقعاً در سامانه ثبت و نهایی شده
 *                      (`intel_reference_positions`).
 *
 * تا وقتی نسخهٔ نهایی ثبت نشده، میز **نباید** هدف را جای وضعیت جا بزند. تستِ
 * `command-desk.test.ts` دقیقاً همین را گارد می‌کند: پاسخِ «اثر بر سبد» حق
 * ندارد ۷۰/۱۵/۱۵ را وقتی نسخهٔ نهایی وجود ندارد بیرون بدهد.
 *
 * پس این ماژول هدف را **به‌عنوانِ هدف** نگه می‌دارد، با برچسبِ صریح، و
 * وضعیتِ پیکربندی را جدا گزارش می‌کند.
 *
 * ── آنچه اینجا هرگز حدس زده نمی‌شود ────────────────────────────────────────
 *
 * **ابزارها.** «۷۰٪ طلا» یک تخصیص است؛ «کدام صندوقِ طلا، با چه وزنی» یک
 * تصمیمِ مالک است. هیچ پراکسی، نماد یا صندوقی اینجا hardcode نمی‌شود. تا
 * وقتی مالک نگاشتِ ابزار را ندهد، سبد `unconfigured` است و سامانه دقیقاً
 * می‌گوید چه تصمیمی لازم دارد.
 *
 * بازهٔ مجاز، بودجهٔ ریسک و شرطِ بازتوازن هم همین‌طور: `null` یعنی مالک هنوز
 * نگفته، نه «محدودیتی ندارد».
 */
import type { DataState } from "@/lib/desk/contracts";

export const SLEEVE_KEYS = ["gold", "fixed_income", "iranian_equity"] as const;
export type SleeveKey = (typeof SLEEVE_KEYS)[number];

export const SLEEVE_LABEL: Record<SleeveKey, string> = {
  gold: "طلا",
  fixed_income: "درآمد ثابت",
  iranian_equity: "سهام ایران",
};

export interface SleeveTarget {
  key: SleeveKey;
  label: string;
  /** درصدِ هدف — از تعریفِ مالک. */
  targetPct: number;
  /** بازهٔ مجازِ انحراف. `null` = مالک تعیین نکرده. */
  bandPct: { min: number; max: number } | null;
  /** ابزار/پراکسیِ مصوب. خالی = تصمیمِ مالک نیامده. هرگز حدس زده نمی‌شود. */
  instruments: readonly string[];
}

export interface ReferenceContract {
  /** شناسهٔ نسخه — تغییرِ تخصیص باید نسخهٔ تازه بسازد، نه ویرایشِ درجا. */
  version: string;
  /** هدفِ سرمایه‌گذاری، به زبانِ مالک. */
  objective: string;
  sleeves: readonly SleeveTarget[];
  /** بودجهٔ ریسک. `null` = تعیین‌نشده. */
  riskBudget: string | null;
  /** شرطِ بازتوازن. `null` = تعیین‌نشده. */
  rebalanceTrigger: string | null;
}

/**
 * نسخهٔ ۱ — تخصیصی که مالک در `P2-INTELLIGENCE-DESK-MEGA-001` اعلام کرد.
 *
 * فقط سه عددِ تخصیص و هدف از مالک آمده‌اند. بقیهٔ فیلدها عمداً `null` یا
 * خالی‌اند تا کسی آن‌ها را «تأییدشده» فرض نکند.
 */
export const REFERENCE_CONTRACT_V1: ReferenceContract = {
  version: "v1",
  objective: "حفظ قدرتِ خرید با ریسکِ کنترل‌شده",
  sleeves: [
    { key: "gold", label: SLEEVE_LABEL.gold, targetPct: 70, bandPct: null, instruments: [] },
    { key: "fixed_income", label: SLEEVE_LABEL.fixed_income, targetPct: 15, bandPct: null, instruments: [] },
    { key: "iranian_equity", label: SLEEVE_LABEL.iranian_equity, targetPct: 15, bandPct: null, instruments: [] },
  ],
  riskBudget: null,
  rebalanceTrigger: null,
};

/** یک تصمیمِ مشخص که تا نیاید، سبد قابلِ محاسبه نیست. */
export interface OwnerDecision {
  key: string;
  /** خودِ پرسش — کوتاه و تمام‌شونده با «؟». زمینه در `detail` می‌آید. */
  question: string;
  detail: string | null;
}

export interface ReferencePortfolioView {
  version: string;
  objective: string;
  sleeves: readonly SleeveTarget[];
  /** جمعِ درصدهای هدف — برای اثباتِ اینکه قرارداد خودش سازگار است. */
  totalPct: number;
  state: DataState;
  /** یک جملهٔ فارسی که دقیقاً می‌گوید چرا این حالت. */
  summary: string;
  /** تصمیم‌هایی که از مالک لازم است. خالی یعنی چیزی معطل نیست. */
  pendingDecisions: readonly OwnerDecision[];
  /** آیا نسخهٔ نهایی در سامانه ثبت شده؟ */
  hasFinalizedVersion: boolean;
}

export interface FinalizedPosition {
  assetClass: string;
  weightPct: number;
}

/**
 * وضعیتِ سبدِ مرجع را از قرارداد + آنچه واقعاً در سامانه نهایی شده می‌سازد.
 *
 * تابعِ خالص. هیچ عددی تولید نمی‌کند: یا از قرارداد می‌آید (هدف) یا از
 * سامانه (نسخهٔ نهایی).
 */
export function describeReferencePortfolio(
  contract: ReferenceContract,
  finalized: readonly FinalizedPosition[]
): ReferencePortfolioView {
  const totalPct = contract.sleeves.reduce((sum, s) => sum + s.targetPct, 0);
  const missingInstruments = contract.sleeves.filter((s) => s.instruments.length === 0);

  const pendingDecisions: OwnerDecision[] = [];
  if (missingInstruments.length > 0) {
    pendingDecisions.push({
      key: "instrument-map",
      question: "کدام ابزار یا صندوق نمایندهٔ هر بخش است؟",
      detail: `بدونِ نگاشت: ${missingInstruments.map((s) => s.label).join("، ")}`,
    });
  }
  if (contract.sleeves.some((s) => s.bandPct === null)) {
    pendingDecisions.push({
      key: "bands",
      question: "انحرافِ مجاز از هر وزنِ هدف چقدر است؟",
      detail: null,
    });
  }
  if (contract.riskBudget === null) {
    pendingDecisions.push({
      key: "risk-budget",
      question: "بودجهٔ ریسکِ سبد چطور تعریف می‌شود؟",
      detail: null,
    });
  }
  if (contract.rebalanceTrigger === null) {
    pendingDecisions.push({
      key: "rebalance",
      question: "بازتوازن با چه شرطی انجام می‌شود؟",
      detail: null,
    });
  }

  const hasFinalizedVersion = finalized.length > 0;

  // ترتیبِ بررسی مهم است: نبودِ ابزار از نبودِ نسخهٔ نهایی بنیادی‌تر است، چون
  // بدونِ ابزار حتی نسخهٔ نهایی هم قابلِ محاسبه نیست.
  const state: DataState = pendingDecisions.length > 0 ? "unconfigured" : hasFinalizedVersion ? "ready" : "empty";

  const summary =
    pendingDecisions.length > 0
      ? `تخصیصِ هدف اعلام شده، ولی سبد تا رسیدنِ ${pendingDecisions.length === 1 ? "یک تصمیم" : `${pendingDecisions.length} تصمیمِ`} مالک قابلِ محاسبه نیست.`
      : hasFinalizedVersion
        ? "قرارداد کامل است و نسخهٔ نهایی در سامانه ثبت شده."
        : "قرارداد کامل است، ولی هنوز نسخهٔ نهایی در سامانه ثبت نشده.";

  return {
    version: contract.version,
    objective: contract.objective,
    sleeves: contract.sleeves,
    totalPct,
    state,
    summary,
    pendingDecisions,
    hasFinalizedVersion,
  };
}
