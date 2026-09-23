/**
 * حافظهٔ تحلیلی — Wave 5.
 *
 * ردِ یک تحلیل از **شاهد** تا **تصمیمِ آرش** تا **نتیجه**. هدف این است که
 * بشود پرسید «این نتیجه از کجا آمد؟» و جواب گرفت، نه اینکه یک متنِ بی‌ریشه
 * در کارنامه بنشیند.
 *
 * ── چه چیزی اینجا اضافه می‌شود، چه چیزی نه ─────────────────────────────────
 *
 * گیتِ **وضعیت** از قبل در `lib/desk/contracts.ts` هست
 * (`canPublishBrief` / `briefPublishBlockReason`) و اینجا تکرار نمی‌شود.
 * چیزی که آنجا نبود، **کیفیتِ شاهد** است:
 *
 *   - گزاره‌ای که هیچ شاهدی ندارد
 *   - تحلیلی که کلِ پشتوانه‌اش پستِ تأییدنشدهٔ شبکهٔ اجتماعی است
 *
 * هر دو باید مانعِ انتشار شوند، و هر دو مستقل از وضعیتِ اداریِ تحلیل‌اند: یک
 * تحلیل می‌تواند `pending_approval` باشد و هم‌زمان شاهدش ناقص باشد.
 *
 * ── «چهار حالتِ کارنامه» ────────────────────────────────────────────────────
 *
 * `open` هنوز نتیجه‌ای ثبت نشده · `closed` نتیجه ثبت شده ·
 * `invalidated` فرضش نقض شده · `awaiting_review` منتظرِ قضاوتِ انسان.
 * این‌ها با هم قاطی نمی‌شوند: «بسته‌نشده» با «باطل‌شده» یکی نیست.
 */
import type { DataState } from "@/lib/desk/contracts";
import {
  DOMAIN_LABEL,
  type AnalysisStatus,
  type IntelAnalysis,
  type IntelClaim,
  type IntelClaimEvidence,
  type IntelDomain,
  type IntelEffect,
  type IntelEvidence,
  type IntelSource,
  type SourceKind,
} from "./contracts";

const SOCIAL_KINDS: readonly SourceKind[] = ["telegram", "instagram"];

export type OutcomeState = "open" | "closed" | "invalidated" | "awaiting_review";

export const OUTCOME_LABEL: Record<OutcomeState, string> = {
  open: "باز",
  closed: "بسته‌شده",
  invalidated: "باطل‌شده",
  awaiting_review: "منتظرِ بازبینی",
};

/** نتیجهٔ ثبت‌شدهٔ یک تحلیل. نبودش «باز» است، نه «درست». */
export interface RealizedOutcome {
  analysisId: string;
  /** `invalidated` یعنی فرضِ پایه نقض شد — با «اشتباه بود» یکی نیست. */
  kind: "closed" | "invalidated";
  note: string;
  recordedAt: string;
}

export interface AnalysisTrace {
  analysisId: string;
  title: string;
  domain: IntelDomain;
  domainLabel: string;
  status: AnalysisStatus;
  outcome: OutcomeState;
  outcomeLabel: string;
  /** گزاره‌های واقعیت‌محور، استنتاجی و سناریویی — جدا شمرده می‌شوند. */
  factCount: number;
  inferenceCount: number;
  scenarioCount: number;
  /** گزاره‌هایی که هیچ شاهدی به آن‌ها وصل نیست. */
  unsupportedClaims: number;
  /** دارایی‌هایی که تحلیل ادعای اثر بر آن‌ها دارد. */
  affectedAssets: readonly string[];
  /** کلِ پشتوانه فقط پستِ تأییدنشدهٔ شبکه است. */
  socialOnlySourcing: boolean;
  /** چرا این تحلیل هنوز نمی‌تواند منتشر شود — `null` یعنی مانعی از این جنس نیست. */
  evidenceBlockReason: string | null;
  state: DataState;
}

export interface AnalysisMemory {
  traces: readonly AnalysisTrace[];
  open: number;
  closed: number;
  invalidated: number;
  awaitingReview: number;
  /** تحلیل‌هایی که به‌خاطرِ کیفیتِ شاهد قابلِ انتشار نیستند. */
  blockedByEvidence: number;
}

function outcomeOf(status: AnalysisStatus, outcome: RealizedOutcome | undefined): OutcomeState {
  if (outcome) return outcome.kind;
  if (status === "pending_approval") return "awaiting_review";
  return "open";
}

/**
 * تابعِ خالص. هیچ نتیجه، اطمینان یا شاهدی تولید نمی‌کند.
 */
export function buildAnalysisMemory(
  analyses: readonly IntelAnalysis[],
  claims: readonly IntelClaim[],
  claimEvidence: readonly IntelClaimEvidence[],
  evidence: readonly IntelEvidence[],
  sources: readonly IntelSource[],
  effects: readonly IntelEffect[],
  outcomes: readonly RealizedOutcome[] = []
): AnalysisMemory {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const outcomeByAnalysis = new Map(outcomes.map((o) => [o.analysisId, o]));

  const traces = analyses.map((analysis): AnalysisTrace => {
    const own = claims.filter((c) => c.analysisId === analysis.id);
    const claimIds = new Set(own.map((c) => c.id));

    const linkedEvidence = claimEvidence
      .filter((ce) => claimIds.has(ce.claimId))
      .map((ce) => evidenceById.get(ce.evidenceId))
      .filter((e): e is IntelEvidence => Boolean(e));

    const backingSources = linkedEvidence
      .map((e) => sourceById.get(e.sourceId))
      .filter((s): s is IntelSource => Boolean(s));
    const approved = backingSources.filter((s) => s.approved);

    const unsupportedClaims = own.filter(
      (c) => !claimEvidence.some((ce) => ce.claimId === c.id)
    ).length;

    // «فقط شبکه» فقط وقتی معنا دارد که اصلاً پشتوانه‌ای باشد.
    const socialOnlySourcing =
      approved.length > 0 && approved.every((s) => SOCIAL_KINDS.includes(s.kind));

    const affectedAssets = [
      ...new Set(effects.filter((e) => e.analysisId === analysis.id).map((e) => e.targetKey)),
    ].sort();

    const evidenceBlockReason =
      own.length === 0
        ? "هیچ گزاره‌ای به این تحلیل وصل نیست"
        : unsupportedClaims > 0
          ? `${unsupportedClaims} گزاره هنوز شاهد ندارد`
          : approved.length === 0
            ? "هیچ شاهدی از منبعِ تأییدشده ندارد"
            : socialOnlySourcing
              ? "کلِ پشتوانه پستِ تأییدنشدهٔ شبکهٔ اجتماعی است — سرنخ هست، تحلیلِ مستند نیست"
              : null;

    const outcome = outcomeOf(analysis.status, outcomeByAnalysis.get(analysis.id));

    return {
      analysisId: analysis.id,
      title: analysis.title,
      domain: analysis.domain,
      domainLabel: DOMAIN_LABEL[analysis.domain],
      status: analysis.status,
      outcome,
      outcomeLabel: OUTCOME_LABEL[outcome],
      factCount: own.filter((c) => c.kind === "FACT").length,
      inferenceCount: own.filter((c) => c.kind === "INFERENCE").length,
      scenarioCount: own.filter((c) => c.kind === "SCENARIO").length,
      unsupportedClaims,
      affectedAssets,
      socialOnlySourcing,
      evidenceBlockReason,
      state:
        evidenceBlockReason !== null
          ? "awaiting_review"
          : analysis.status === "published"
            ? "ready"
            : "awaiting_review",
    };
  });

  return {
    traces,
    open: traces.filter((t) => t.outcome === "open").length,
    closed: traces.filter((t) => t.outcome === "closed").length,
    invalidated: traces.filter((t) => t.outcome === "invalidated").length,
    awaitingReview: traces.filter((t) => t.outcome === "awaiting_review").length,
    blockedByEvidence: traces.filter((t) => t.evidenceBlockReason !== null).length,
  };
}
