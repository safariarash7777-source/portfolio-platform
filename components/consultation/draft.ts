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

export type PanelDrafts = { advisorId: string; clientLabel: string; consent: boolean; recommendation: RecommendationDraft | null; questions: Record<string, string> };
export const emptyPanelDrafts = (): PanelDrafts => ({ advisorId: "", clientLabel: "", consent: false, recommendation: null, questions: {} });

/** A fresh read must still authorize the exact case, basis and editable versions. */
export function mayRestorePanelDrafts(before: import("@/lib/consultation/contracts").ConsultationRead, after: typeof before, value: PanelDrafts): boolean {
  const a = before.selected, b = after.selected;
  if (before.actor.id !== after.actor.id || before.actor.isAdvisor !== after.actor.isAdvisor || before.actor.isOwner !== after.actor.isOwner) return false;
  if (value.advisorId && !after.advisors.some(person => person.id === value.advisorId && person.isOwner)) return false;
  if ((value.advisorId || value.clientLabel || value.consent) && after.relationships.some(r => r.clientId === after.actor.id && !r.revoked && after.advisors.some(person => person.id === r.advisorId && person.isOwner))) return false;
  if (!a || !b) return !a && !b && !value.recommendation && !Object.keys(value.questions).length;
  if (a.id !== b.id || a.advisorId !== b.advisorId || a.clientId !== b.clientId || a.revoked !== b.revoked || b.revoked) return false;
  const x = before.dossier?.basis, y = after.dossier?.basis;
  if (!x || !y || x.holdingsVersionId !== y.holdingsVersionId || x.cashFlowVersionId !== y.cashFlowVersionId || x.goalsVersionId !== y.goalsVersionId || x.cashFlowPeriod.startOn !== y.cashFlowPeriod.startOn || x.cashFlowPeriod.endOn !== y.cashFlowPeriod.endOn) return false;
  if (value.recommendation) {
    const { sessionKey, baseVersion } = value.recommendation;
    const current = after.sessions.filter(session => session.sessionKey === sessionKey);
    if (b.advisorId !== after.actor.id || Math.max(0, ...current.map(session => session.version)) !== baseVersion) return false;
    if (baseVersion > 0) {
      const original = before.sessions.find(session => session.sessionKey === sessionKey && session.version === baseVersion);
      if (!original || !current.some(session => session.id === original.id && session.state === original.state && session.contentHash === original.contentHash)) return false;
    }
  }
  return Object.keys(value.questions).every(id => b.clientId === after.actor.id && after.sessions.some(session => session.id === id && session.state === "published"));
}
