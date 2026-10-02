/** Offline preparation only. No persistence, grant, review approval or publish authority. */
import { parsePublication, type PublicationDraft } from './publication';
import type { ResearchWorkbook } from './research-workbook';

export const P07_PREPARATION_CONTRACT = 'p07.preparation.draft.v1';
export interface ManualIntake {
  kind: 'text' | 'voice_manual';
  text: string;
  transcriptConfirmed: boolean;
  claims: { id: string; kind: 'observation' | 'interpretation' | 'scenario'; text: string; evidenceIds: string[] }[];
  ambiguities: { id: string; text: string; resolved: boolean }[];
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ورودی دستی معتبر نیست.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('متن یا شناسه کامل نیست.');
  return value.trim();
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('فهرست معتبر نیست.');
  return value;
}
function uniqueIds(items: { id: string }[]) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('شناسه تکراری است.');
}
/** Rebuild internal allowlist; booleans are human checklist entries, never identity/approval. */
export function parseManualIntake(input: unknown): ManualIntake {
  const p = record(input);
  if (p.kind !== 'text' && p.kind !== 'voice_manual') throw new Error('نوع ورود دستی را مشخص کنید.');
  if (typeof p.transcriptConfirmed !== 'boolean') throw new Error('وضعیت بازبینی رونویسی را مشخص کنید.');
  const claims = list(p.claims, 100).map((value): ManualIntake['claims'][number] => {
    const c = record(value);
    if (c.kind !== 'observation' && c.kind !== 'interpretation' && c.kind !== 'scenario') throw new Error('نوع گزاره معتبر نیست.');
    return { id: text(c.id, 100), kind: c.kind, text: text(c.text, 4000), evidenceIds: [...new Set(list(c.evidenceIds, 100).map(id => text(id, 100)))] };
  });
  const ambiguities = list(p.ambiguities, 100).map(value => {
    const a = record(value);
    if (typeof a.resolved !== 'boolean') throw new Error('وضعیت ابهام معتبر نیست.');
    return { id: text(a.id, 100), text: text(a.text, 4000), resolved: a.resolved };
  });
  uniqueIds(claims); uniqueIds(ambiguities);
  return { kind: p.kind, text: text(p.text, 20000), transcriptConfirmed: p.transcriptConfirmed, claims, ambiguities };
}
/** Structural preparation issues only; an empty list does not establish source truth or approval. */
export function manualIntakeIssues(intake: ManualIntake, workbook: ResearchWorkbook): string[] {
  const issues: string[] = [];
  if (intake.kind === 'voice_manual' && !intake.transcriptConfirmed) issues.push('transcript_unconfirmed');
  if (intake.claims.length === 0) issues.push('claims_missing');
  const evidence = new Set(workbook.evidence.map(item => item.id));
  if (evidence.size !== workbook.evidence.length) issues.push('evidence_ids_duplicate');
  for (const claim of intake.claims) {
    if (claim.evidenceIds.length === 0) issues.push(`claim_evidence_missing:${claim.id}`);
    for (const id of claim.evidenceIds) if (!evidence.has(id)) issues.push(`claim_evidence_unknown:${claim.id}:${id}`);
  }
  for (const ambiguity of intake.ambiguities) if (!ambiguity.resolved) issues.push(`ambiguity_unresolved:${ambiguity.id}`);
  return issues;
}

export type AudiencePreview = Pick<PublicationDraft, 'contentKind' | 'title' | 'summary' | 'content' | 'sources' | 'audience' | 'cohortIds'>;
/** Unsaved author preview, not a member reader. Sources/free text still need human privacy review. */
export function prepareAudiencePreview(input: unknown): AudiencePreview {
  const p = parsePublication(input);
  return { contentKind: p.contentKind, title: p.title, summary: p.summary, content: p.content,
    sources: p.sources.map(source => ({ url: source.url, asOf: source.asOf })), audience: p.audience, cohortIds: [...p.cohortIds] };
}
