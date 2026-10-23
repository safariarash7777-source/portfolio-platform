import { dateInput } from "@/lib/portfolio/financialInput";
import { validateRecommendationBody, type FinancialBasis, type RecommendationBody, type ConsultationSession } from "@/lib/consultation/contracts";
export type RecommendationDraft = Omit<RecommendationBody, "basis" | "researchVersionIds"> & { researchIds: string; privateNote: string; sessionKey: string; baseVersion: number };
export function recommendationDraft(sessionKey: string, session?: ConsultationSession, privateNote?: string | null): RecommendationDraft {
  return { sessionKey, baseVersion: session?.version ?? 0, topic: session?.body.topic ?? "", goal: session?.body.goal ?? "", clientSummary: session?.body.clientSummary ?? "", rationale: session?.body.rationale ?? "", limitations: session?.body.limitations ?? "", reviewOn: session?.body.reviewOn ?? "", researchIds: session?.body.researchVersionIds.join("\n") ?? "", evidence: session ? structuredClone(session.body.evidence) : [{ label: "", url: null, asOf: "" }], actions: session ? structuredClone(session.body.actions) : [], privateNote: privateNote ?? "" };
}
export function draftBody(draft: RecommendationDraft, basis: FinancialBasis): RecommendationBody {
  return validateRecommendationBody({ topic: draft.topic, goal: draft.goal, clientSummary: draft.clientSummary, rationale: draft.rationale, limitations: draft.limitations,
    reviewOn: dateInput(draft.reviewOn), basis, researchVersionIds: draft.researchIds.split(/[\s,،]+/).filter(Boolean),
    evidence: draft.evidence.map(item => ({ label: item.label, url: item.url?.trim() || null, asOf: dateInput(item.asOf) })),
    actions: draft.actions.map(item => ({ ...item, dueOn: dateInput(item.dueOn) })) });
}
