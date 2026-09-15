/**
 * سرهم‌کردنِ نمای میزِ هوشمندی — `G3-003`.
 *
 * توابعِ خالص، بدونِ IO. صفحهٔ ادمین سطرهای خام را می‌خواند و همین‌جا به نما
 * تبدیل می‌شود، تا رفتار بدونِ دیتابیس قابلِ تست باشد.
 *
 * قاعدهٔ سختی که همه‌جای این فایل تکرار می‌شود و **بارها به ما ضربه زده**:
 * «نداریم» با «صفر است» یکی نیست. وزنِ سبدِ تعریف‌نشده `null` است، نه ۰٪؛
 * تمرینِ شروع‌نشده `null` است، نه ۰٪. شاخصی که این دو را قاطی کند، دیر یا زود
 * برای دلیلِ اشتباه مورد اعتماد قرار می‌گیرد.
 */

import { toPersianDigits } from "@/lib/format";
import {
  ANALYSIS_STATE_LABEL,
  SCENARIO_LABEL_FA,
  summarizeRehearsal,
  type AnalysisState,
  type RehearsalDay,
  type RehearsalSummary,
  type ScenarioLabel,
} from "@/lib/intelligence/workflow";
import { ASSET_CLASS_LABEL, type IntelAssetClass } from "@/lib/intelligence/contracts";
import type { QueryErrorKind } from "@/lib/health/status";

/**
 * یک شکستِ خواندن نباید به آرایهٔ خالی و بعد به «صفر» تبدیل شود. این متن
 * مشترک، کل view را تا زمانِ رفع شکست fail-closed نگه می‌دارد.
 */
export function explainIntelligenceFailures(failures: readonly QueryErrorKind[]): string | null {
  if (failures.length === 0) return null;
  if (failures.includes("missing_table")) {
    return "جدول‌های گردشِ دستی هنوز روی این محیط اجرا نشده‌اند — `phase22` هنوز اعمال نشده است.";
  }
  return "یک یا چند بخش از دادهٔ هوشمندی خوانده نشد؛ خروجی ناقص به‌عنوان نتیجه نمایش داده نمی‌شود.";
}

export interface BriefRow {
  id: string;
  title: string;
  domain: string;
  status: AnalysisState;
  briefDate: string | null;
  updatedAt: string;
  reviewNote: string | null;
}

export interface ClaimRow {
  id: string;
  analysisId: string;
  kind: "FACT" | "INFERENCE" | "SCENARIO";
  statement: string;
  confidence: number;
  scenarioLabel: ScenarioLabel | null;
  evidenceCount: number;
}

export interface EffectRow {
  analysisId: string;
  assetClass: IntelAssetClass;
  direction: "increase" | "decrease" | "hold";
  horizon: string;
  confidence: number;
  rationale: string;
}

export interface HistoryRow {
  analysisId: string;
  event: string;
  occurredAt: string;
  note: string | null;
}

export interface PositionRow {
  assetClass: IntelAssetClass;
  weightPct: number;
}

// ── امروز ───────────────────────────────────────────────────────────────────

export interface TodayView {
  brief: BriefRow | null;
  /** گزاره‌های همان بریف؛ برای پاسخِ «چرا مهم است؟»، نه نمایشِ همهٔ تاریخچه. */
  claims: readonly ClaimRow[];
  /** `null` یعنی هنوز بریفی برای امروز ثبت نشده — نه اینکه بریف خالی است. */
  claimCount: number | null;
  unsupportedClaims: number;
  statusLabel: string;
}

export function buildToday(today: string, briefs: readonly BriefRow[], claims: readonly ClaimRow[]): TodayView {
  const brief = briefs.find((b) => b.briefDate === today && b.status !== "rejected" && b.status !== "superseded") ?? null;
  if (!brief) {
    return { brief: null, claims: [], claimCount: null, unsupportedClaims: 0, statusLabel: "ثبت‌نشده" };
  }
  const mine = claims.filter((c) => c.analysisId === brief.id);
  return {
    brief,
    claims: mine,
    claimCount: mine.length,
    unsupportedClaims: mine.filter((c) => c.evidenceCount === 0).length,
    statusLabel: ANALYSIS_STATE_LABEL[brief.status],
  };
}

// ── صندوقِ بازبینی ──────────────────────────────────────────────────────────

export interface InboxItem {
  brief: BriefRow;
  claimCount: number;
  unsupportedClaims: number;
  /** آیا تأییدِ داخلی همین حالا ممکن است؟ اگر نه، دلیلش. */
  blockedReason: string | null;
  history: readonly HistoryRow[];
}

export function buildInbox(
  briefs: readonly BriefRow[],
  claims: readonly ClaimRow[],
  history: readonly HistoryRow[]
): InboxItem[] {
  return briefs
    .filter((b) => b.status === "pending_approval")
    .map((brief) => {
      const mine = claims.filter((c) => c.analysisId === brief.id);
      const unsupported = mine.filter((c) => c.evidenceCount === 0).length;
      return {
        brief,
        claimCount: mine.length,
        unsupportedClaims: unsupported,
        // رقمِ لاتین در متنِ فارسی هم زشت است و هم ناسازگار با بقیهٔ UI. هر
        // عددی که به کاربر نشان داده می‌شود باید از `toPersianDigits` بگذرد —
        // حتی وقتی داخلِ یک جملهٔ ساخته‌شده در لایهٔ منطق است.
        blockedReason:
          mine.length === 0
            ? "این تحلیل هیچ گزاره‌ای ندارد"
            : unsupported > 0
              ? `${toPersianDigits(unsupported)} گزاره هنوز شاهد ندارد`
              : null,
        history: history
          .filter((h) => h.analysisId === brief.id)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      };
    })
    .sort((a, b) => a.brief.updatedAt.localeCompare(b.brief.updatedAt));
}

// ── تختهٔ سناریو ────────────────────────────────────────────────────────────

export interface ScenarioCard {
  label: ScenarioLabel;
  labelFa: string;
  claims: readonly ClaimRow[];
  /** `null` وقتی هیچ گزارهٔ سناریویی با این برچسب ثبت نشده. */
  averageConfidence: number | null;
  unsupported: number;
}

const SCENARIO_ORDER: ScenarioLabel[] = ["base", "upside", "downside"];

export function buildScenarioBoard(claims: readonly ClaimRow[]): ScenarioCard[] {
  return SCENARIO_ORDER.map((label) => {
    const mine = claims.filter((c) => c.kind === "SCENARIO" && c.scenarioLabel === label);
    return {
      label,
      labelFa: SCENARIO_LABEL_FA[label],
      claims: mine,
      averageConfidence:
        mine.length === 0
          ? null
          : Math.round(mine.reduce((s, c) => s + c.confidence, 0) / mine.length),
      unsupported: mine.filter((c) => c.evidenceCount === 0).length,
    };
  });
}

// ── اثر بر سبدِ مرجع ────────────────────────────────────────────────────────

export interface PortfolioImpactRow {
  assetClass: IntelAssetClass;
  label: string;
  /** `null` = آرش هنوز وزنِ رسمی تعریف نکرده. **هرگز ۰ جای آن نمی‌نشیند.** */
  weightPct: number | null;
  direction: "increase" | "decrease" | "hold" | null;
  confidence: number | null;
  rationale: string | null;
  horizon: string | null;
}

export interface PortfolioImpactView {
  rows: PortfolioImpactRow[];
  /** وقتی نسخهٔ نهاییِ سبد وجود ندارد، UI باید «هنوز تعریف نشده» بگوید. */
  hasOfficialWeights: boolean;
  note: string;
}

const ASSET_ORDER: IntelAssetClass[] = [
  "equity_ir", "gold", "fx", "fixed_income", "commodity_fund", "commodity_certificate", "cash",
];

/**
 * اثرِ **احتمالیِ** رخداد بر سبدِ مرجع — نه توصیهٔ خرید و فروش، نه قیمتِ هدف،
 * نه شخصی‌سازیِ مشتری.
 *
 * وزن‌ها هرگز جعل نمی‌شوند. اگر نسخهٔ نهاییِ سبد وجود نداشته باشد، هر وزن
 * `null` می‌ماند و تصمیمش برای آرش باز است. سبدی که وزنش را ما حدس بزنیم،
 * بدتر از سبدِ نداشته است.
 */
export function buildPortfolioImpact(
  positions: readonly PositionRow[],
  effects: readonly EffectRow[]
): PortfolioImpactView {
  const hasOfficialWeights = positions.length > 0;
  const byClass = new Map(positions.map((p) => [p.assetClass, p.weightPct]));

  const rows = ASSET_ORDER.map((assetClass) => {
    const effect = effects.find((e) => e.assetClass === assetClass) ?? null;
    return {
      assetClass,
      label: ASSET_CLASS_LABEL[assetClass],
      weightPct: hasOfficialWeights ? (byClass.get(assetClass) ?? null) : null,
      direction: effect?.direction ?? null,
      confidence: effect?.confidence ?? null,
      rationale: effect?.rationale ?? null,
      horizon: effect?.horizon ?? null,
    };
  });

  return {
    rows,
    hasOfficialWeights,
    note: hasOfficialWeights
      ? "وزن‌ها از آخرین نسخهٔ نهایی‌شدهٔ سبد مرجع خوانده شده‌اند."
      : "سبد مرجع هنوز نسخهٔ نهایی ندارد؛ وزن‌ها «تعریف‌نشده» می‌مانند و ساخته نمی‌شوند.",
  };
}

// ── تمرین ───────────────────────────────────────────────────────────────────

export interface RehearsalView extends RehearsalSummary {
  remainingDays: number;
  gateStatus: "not_started" | "in_progress" | "ready_for_review";
}

/** قرارداد واحدِ دو نمای داخلی: میز فرماندهی و گردش تخصصی هوشمندی. */
export interface IntelligenceDeskViewModel {
  today: TodayView;
  todayJalali: string;
  inbox: InboxItem[];
  scenarios: ScenarioCard[];
  portfolio: PortfolioImpactView;
  rehearsal: RehearsalView;
  unavailableReason: string | null;
}

export function buildRehearsalView(days: readonly RehearsalDay[]): RehearsalView {
  const summary = summarizeRehearsal(days);
  return {
    ...summary,
    remainingDays: Math.max(0, 10 - summary.daysRecorded),
    gateStatus:
      summary.daysRecorded === 0
        ? "not_started"
        : summary.readyForGateReview
          ? "ready_for_review"
          : "in_progress",
  };
}
