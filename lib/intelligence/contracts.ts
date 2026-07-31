/**
 * Runtime-independent contracts for the market-intelligence ledger (G3-001).
 * The migration is NOT_APPLIED. These types describe the reviewed boundary;
 * they do not start an agent or expose a public feature.
 */
import type { AssetSeries } from "@/lib/core/allocation";
import type { HistoryDay } from "@/lib/core/engine";

export const INTEL_DOMAINS = [
  "politics_geo", "macro_ir", "macro_global", "fx_gold", "equity_ir",
  "company_codal", "fixed_income", "commodity_funds", "capital_risk", "allocation",
] as const;
export type IntelDomain = (typeof INTEL_DOMAINS)[number];

export const DOMAIN_LABEL: Record<IntelDomain, string> = {
  politics_geo: "سیاست و ژئوپلیتیک",
  macro_ir: "اقتصاد کلان ایران",
  macro_global: "اقتصاد کلان جهان",
  fx_gold: "ارز و طلا",
  equity_ir: "سهام و صنایع ایران",
  company_codal: "شرکت‌ها و کدال",
  fixed_income: "درآمد ثابت",
  commodity_funds: "صندوق‌های کالایی و گواهی سپرده",
  capital_risk: "ریسک سرمایه",
  allocation: "تخصیص دارایی و سبد مرجع",
};

export const SOURCE_KINDS = ["codal", "telegram", "instagram", "news", "official", "market_data", "manual"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const TRUST_TIERS = ["primary", "secondary", "unverified"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];
export const CLAIM_KINDS = ["FACT", "INFERENCE", "SCENARIO"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const SCENARIO_LABELS = ["base", "upside", "downside"] as const;
export type ScenarioLabel = (typeof SCENARIO_LABELS)[number];
export const ANALYSIS_STATUSES = ["draft", "pending_approval", "published", "superseded"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export const MAGNITUDE_BANDS = ["low", "medium", "high"] as const;
export type MagnitudeBand = (typeof MAGNITUDE_BANDS)[number];
export const HORIZONS = ["intraday", "short_term", "medium_term", "long_term", "structural"] as const;
export type IntelHorizon = (typeof HORIZONS)[number];

/** Stable keys shared by portfolio effects, reference versions and allocation. */
export const ASSET_CLASSES = [
  "equity_ir", "gold", "fx", "fixed_income", "commodity_fund", "commodity_certificate", "cash",
] as const;
export type IntelAssetClass = (typeof ASSET_CLASSES)[number];
export const ASSET_CLASS_LABEL: Record<IntelAssetClass, string> = {
  equity_ir: "سهام ایران",
  gold: "طلا",
  fx: "ارز",
  fixed_income: "درآمد ثابت",
  commodity_fund: "صندوق کالایی",
  commodity_certificate: "گواهی سپرده کالایی",
  cash: "وجه نقد",
};

export interface IntelSource {
  id: string; kind: SourceKind; name: string; url: string | null;
  trustTier: TrustTier; approved: boolean; approvedBy: string | null; approvedAt: string | null;
}
export interface IntelEvidence {
  id: string; sourceId: string; excerpt: string; contentUrl: string | null;
  observedAt: string; publishedAt: string | null; contentHash: string;
}
export interface IntelEvent {
  id: string; domain: IntelDomain; title: string; summary: string | null;
  occurredAt: string; scope: "iran" | "global" | "sector" | "company"; symbol: string | null;
}
export interface IntelAnalysis {
  id: string; domain: IntelDomain; title: string; bodyMd: string; status: AnalysisStatus;
  decisionNote: unknown | null; createdBy: string; approvedBy: string | null;
  approvedAt: string | null; publishedAt: string | null;
}
export interface IntelClaim {
  id: string; analysisId: string; eventId: string | null; kind: ClaimKind;
  statement: string; confidence: number; scenarioLabel: ScenarioLabel | null;
}
export interface IntelClaimEvidence { claimId: string; evidenceId: string; }
export interface IntelEffect {
  id: string; analysisId: string; eventId: string | null;
  target: "asset_class" | "symbol" | "index" | "fx" | "commodity";
  targetKey: string; direction: "up" | "down" | "unclear";
  magnitudeBand: MagnitudeBand; horizon: IntelHorizon; confidence: number;
}
export interface IntelPortfolioEffect {
  id: string; analysisId: string; assetClass: IntelAssetClass;
  suggestedDirection: "increase" | "decrease" | "hold";
  horizon: IntelHorizon; confidence: number; rationale: string;
}
export interface IntelAnalysisSignal { analysisId: string; signalId: string; }

export type IntelRun =
  | {
      id: string; origin: "human"; actorId: string; status: IntelRunStatus;
      modelProvider: null; modelName: null; modelVersion: null; promptHash: null; configHash: null;
      startedAt: string; completedAt: string | null; outputAnalysisId: string | null;
    }
  | {
      id: string; origin: "agent"; actorId: string | null; status: IntelRunStatus;
      modelProvider: string; modelName: string; modelVersion: string; promptHash: string; configHash: string;
      startedAt: string; completedAt: string | null; outputAnalysisId: string | null;
    };
export type IntelRunStatus = "queued" | "running" | "succeeded" | "failed" | "rejected";
export type IntelRunInput =
  | { runId: string; kind: "evidence"; evidenceId: string }
  | { runId: string; kind: "event"; eventId: string }
  | { runId: string; kind: "analysis"; analysisId: string }
  | { runId: string; kind: "claim"; claimId: string };

export interface ReferencePortfolio { id: string; name: string; baseCurrency: string; status: "active" | "archived"; }
export interface ReferenceVersion {
  id: string; portfolioId: string; versionNo: number; status: "draft" | "finalized";
  effectiveAt: string; reasonAnalysisId: string | null; reasonText: string;
  finalizedBy: string | null; finalizedAt: string | null;
}
export interface ReferencePosition { versionId: string; assetClass: IntelAssetClass; weightPct: number; }

export function isValidConfidence(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}
export function isScenarioLabelConsistent(kind: ClaimKind, label: ScenarioLabel | null): boolean {
  return (kind === "SCENARIO") === (label !== null);
}
export function hasCompleteEvidence(claims: IntelClaim[], links: IntelClaimEvidence[]): boolean {
  return claims.length > 0 && claims.every((claim) => links.some((link) => link.claimId === claim.id));
}
export function hasCompleteReferenceAllocation(positions: ReferencePosition[]): boolean {
  if (positions.length === 0 || new Set(positions.map((p) => p.assetClass)).size !== positions.length) return false;
  return Math.abs(positions.reduce((sum, p) => sum + p.weightPct, 0) - 100) < 1e-9;
}

/** Adapter to the existing runAllocation() engine; no parallel allocation engine. */
export function toAllocationSeries(
  positions: ReferencePosition[],
  daysByAsset: Partial<Record<IntelAssetClass, HistoryDay[]>>,
): AssetSeries[] {
  if (!hasCompleteReferenceAllocation(positions)) throw new Error("reference allocation must total 100%");
  return positions.map((position) => ({
    name: ASSET_CLASS_LABEL[position.assetClass],
    weight: position.weightPct / 100,
    days: daysByAsset[position.assetClass] ?? [],
  }));
}

