import { validNeeds, type NeedsAssessment } from "../seasonal/contracts";
export interface NeedsDraft { body: NeedsAssessment; savedAt: number }
export const draftKey = (user: string, cohort: string) => `member-needs.v1:${user}:${cohort}`;
export function restoreDraft(raw: string | null, now: number): NeedsAssessment | null {
  try { const d = JSON.parse(raw ?? "null") as NeedsDraft | null; return d && validNeeds(d.body) && Number.isFinite(d.savedAt) && d.savedAt <= now && now - d.savedAt < 2 * 60 * 60 * 1000 ? d.body : null; } catch { return null; }
}
