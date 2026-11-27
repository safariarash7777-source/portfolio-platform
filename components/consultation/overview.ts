import type { ConsultationRead, ConsultationSession, FinancialBasis } from "@/lib/consultation/contracts";

export function sameBasis(left: FinancialBasis, right: FinancialBasis) {
  return left.holdingsVersionId === right.holdingsVersionId && left.cashFlowVersionId === right.cashFlowVersionId &&
    left.goalsVersionId === right.goalsVersionId && left.cashFlowPeriod.startOn === right.cashFlowPeriod.startOn &&
    left.cashFlowPeriod.endOn === right.cashFlowPeriod.endOn;
}

export function latestVersions(sessions: ConsultationSession[]) {
  const result = new Map<string, ConsultationSession>();
  for (const session of sessions) {
    const previous = result.get(session.sessionKey);
    if (!previous || previous.version < session.version) result.set(session.sessionKey, session);
  }
  return Array.from(result.values());
}

/** Only member-visible states; a withdrawal supersedes its thread, it never revives an older version. */
export function visiblePublication(data: ConsultationRead) {
  const latest = latestVersions(data.sessions.filter(s => s.state === "published" || s.state === "withdrawn"));
  const publishedAt = new Map(data.events.filter(e => e.kind === "publish").map(e => [e.sessionId, e.createdAt]));
  return latest.filter(s => s.state === "published" && s.approval)
    .sort((a, b) => Date.parse(publishedAt.get(b.id) ?? b.createdAt) - Date.parse(publishedAt.get(a.id) ?? a.createdAt) || a.id.localeCompare(b.id))[0] ?? null;
}

export function nextMemberAction(session: ConsultationSession, data: ConsultationRead) {
  const latest = new Map<string, ConsultationRead["actions"][number]>();
  for (const feedback of data.actions) {
    if (feedback.sessionId !== session.id || !feedback.actionKey || !["doing", "done", "partial", "not_done"].includes(feedback.status)) continue;
    const previous = latest.get(feedback.actionKey);
    if (!previous || feedback.version > previous.version) latest.set(feedback.actionKey, feedback);
  }
  return session.body.actions.filter(a => a.responsible === "member" && latest.get(a.actionKey)?.status !== "done")
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null;
}
