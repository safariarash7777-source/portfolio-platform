import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyQueryError } from "@/lib/health/status";
import { formatJalali } from "@/lib/format";
import {
  buildToday,
  buildInbox,
  buildScenarioBoard,
  buildPortfolioImpact,
  buildRehearsalView,
  explainIntelligenceFailures,
  type BriefRow,
  type ClaimRow,
  type EffectRow,
  type HistoryRow,
  type PositionRow,
  type IntelligenceDeskViewModel,
} from "@/lib/intelligence/board";
import type { RehearsalDay } from "@/lib/intelligence/workflow";

export type AdminIntelligenceView = IntelligenceDeskViewModel;

/**
 * خوانندهٔ مشترک نمای داخلی هوشمندی.
 *
 * `/admin/desk` و `/admin/intelligence` باید از یک قرارداد بخوانند؛ در غیر
 * این صورت میز فرماندهی خیلی زود با صفحهٔ گردش دستی دو واقعیت متفاوت نشان
 * می‌دهد. این تابع فقط داده می‌خواند و هیچ mutation یا محاسبهٔ مالی ندارد.
 */
export async function loadAdminIntelligenceView(now = new Date()): Promise<AdminIntelligenceView> {
  const admin = createAdminClient();
  const today = now.toISOString().slice(0, 10);

  const [briefsRes, claimsRes, evidenceRes, effectsRes, historyRes, daysRes, versionRes] =
    await Promise.all([
      admin.from("intel_analyses")
        .select("id,title,domain,status,brief_date,updated_at,review_note")
        .order("updated_at", { ascending: false }).limit(100),
      admin.from("intel_claims")
        .select("id,analysis_id,kind,statement,confidence,scenario_label").limit(500),
      admin.from("intel_claim_evidence").select("claim_id").limit(2000),
      admin.from("intel_portfolio_effects")
        .select("analysis_id,asset_class,suggested_direction,horizon,confidence,rationale").limit(200),
      admin.from("intel_workflow_events")
        .select("analysis_id,event,occurred_at,note").order("occurred_at", { ascending: true }).limit(500),
      admin.from("intel_rehearsal_days")
        .select("rehearsal_date,day_index,brief_produced,minutes_to_approval,absent_sources,stale_sources,human_corrections,rejected_conclusions,missed_events")
        .order("rehearsal_date", { ascending: true }).limit(120),
      admin.from("intel_reference_versions")
        .select("id,status,finalized_at").eq("status", "finalized")
        .order("finalized_at", { ascending: false }).limit(1),
    ]);

  const failures = [
    briefsRes,
    claimsRes,
    evidenceRes,
    effectsRes,
    historyRes,
    daysRes,
    versionRes,
  ]
    .filter((result) => result.error)
    .map((result) => classifyQueryError(result.error!.code ?? "", result.error!.message));

  const evidenceByClaim = new Map<string, number>();
  for (const row of evidenceRes.data ?? []) {
    evidenceByClaim.set(row.claim_id, (evidenceByClaim.get(row.claim_id) ?? 0) + 1);
  }

  const briefs: BriefRow[] = (briefsRes.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    domain: row.domain,
    status: row.status,
    briefDate: row.brief_date,
    updatedAt: row.updated_at,
    reviewNote: row.review_note,
  }));
  const claims: ClaimRow[] = (claimsRes.data ?? []).map((row) => ({
    id: row.id,
    analysisId: row.analysis_id,
    kind: row.kind,
    statement: row.statement,
    confidence: row.confidence,
    scenarioLabel: row.scenario_label,
    evidenceCount: evidenceByClaim.get(row.id) ?? 0,
  }));
  const history: HistoryRow[] = (historyRes.data ?? []).map((row) => ({
    analysisId: row.analysis_id,
    event: row.event,
    occurredAt: row.occurred_at,
    note: row.note,
  }));
  const effects: EffectRow[] = (effectsRes.data ?? []).map((row) => ({
    analysisId: row.analysis_id,
    assetClass: row.asset_class,
    direction: row.suggested_direction,
    horizon: row.horizon,
    confidence: row.confidence,
    rationale: row.rationale,
  }));
  const days: RehearsalDay[] = (daysRes.data ?? []).map((row) => ({
    rehearsalDate: row.rehearsal_date,
    dayIndex: row.day_index,
    briefProduced: row.brief_produced,
    minutesToApproval: row.minutes_to_approval,
    absentSources: row.absent_sources ?? [],
    staleSources: row.stale_sources ?? [],
    humanCorrections: row.human_corrections,
    rejectedConclusions: row.rejected_conclusions,
    missedEvents: row.missed_events,
  }));

  let positions: PositionRow[] = [];
  const finalized = versionRes.data?.[0]?.id;
  if (finalized) {
    const positionsRes = await admin.from("intel_reference_positions")
      .select("asset_class,weight_pct").eq("version_id", finalized);
    if (positionsRes.error) {
      failures.push(classifyQueryError(positionsRes.error.code ?? "", positionsRes.error.message));
    }
    positions = (positionsRes.data ?? []).map((position) => ({
      assetClass: position.asset_class,
      weightPct: Number(position.weight_pct),
    }));
  }

  const unavailableReason = explainIntelligenceFailures(failures);

  return {
    today: buildToday(today, briefs, claims),
    todayJalali: formatJalali(today),
    inbox: buildInbox(briefs, claims, history),
    scenarios: buildScenarioBoard(claims),
    portfolio: buildPortfolioImpact(positions, effects),
    rehearsal: buildRehearsalView(days),
    unavailableReason,
  };
}
