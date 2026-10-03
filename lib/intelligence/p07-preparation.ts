/** Offline preparation only. No persistence, grant, review approval or publish authority. */
import { parsePublication, type PublicationDraft } from './publication';
export { parseManualIntake, manualIntakeIssues } from './manual-intake';
export type { ManualIntake } from './manual-intake';

export const P07_PREPARATION_CONTRACT = 'p07.preparation.draft.v1';
export type AudiencePreview = Pick<PublicationDraft, 'contentKind' | 'title' | 'summary' | 'content' | 'sources' | 'audience' | 'cohortIds'>;
/** Unsaved author preview, not a member reader. Sources/free text still need human privacy review. */
export function prepareAudiencePreview(input: unknown): AudiencePreview {
  const p = parsePublication(input);
  return { contentKind: p.contentKind, title: p.title, summary: p.summary, content: p.content,
    sources: p.sources.map(source => ({ url: source.url, asOf: source.asOf })), audience: p.audience, cohortIds: [...p.cohortIds] };
}
