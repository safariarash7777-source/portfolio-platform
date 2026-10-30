/** Pure reader adapter. Only metadata supplied by the existing authorized open is consumed. */
import { projectResearchHistory, type VersionHistoryMetadata, type ReviewHistoryMetadata } from './research-history';

export interface WorkbookHistoryMetadata {
  contract: 'p10.workbook-history.metadata.v1';
  actorPolicy: 'not_exposed_by_read_contract';
  workbookId: string;
  versions: Omit<VersionHistoryMetadata, 'createdBy'>[];
  reviews: ReviewHistoryMetadata[];
}
export type WorkbookHistoryRead =
  | { state: 'not_supplied' | 'loading' | 'error' | 'stale' | 'uncertain' }
  | { state: 'read'; workbookId: string; metadata: unknown; latestVersion: number; reviewCount: number };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function projectWorkbookHistory(read: WorkbookHistoryRead) {
  if (read.state !== 'read') return { state: read.state, history: projectResearchHistory([]) };
  const m = read.metadata;
  if (m === null || m === undefined) return { state: 'metadata_unavailable' as const, history: projectResearchHistory([]) };
  if (!record(m) || m.contract !== 'p10.workbook-history.metadata.v1' || m.actorPolicy !== 'not_exposed_by_read_contract' || !UUID.test(read.workbookId) ||
    typeof m.workbookId !== 'string' || m.workbookId.toLowerCase() !== read.workbookId.toLowerCase() ||
    !Array.isArray(m.versions) || !Array.isArray(m.reviews) ||
    m.versions.some(row => !record(row) || typeof row.workbookId !== 'string' || row.workbookId.toLowerCase() !== read.workbookId.toLowerCase())) {
    return { state: 'invalid' as const, history: projectResearchHistory([]) };
  }
  // The DTO has no trustworthy read timestamp or reviewer identity. Do not fill either.
  const history = projectResearchHistory([
    { source: 'workbook_versions', sourceId: 'current-authorized-workbook-store', status: 'read', readAt: null,
      data: m.versions.map(row => ({ id: row.id, workbookId: row.workbookId, version: row.version, createdAt: row.createdAt })) },
    { source: 'workbook_reviews', sourceId: 'current-authorized-workbook-store', status: 'read', readAt: null,
      data: m.reviews.map(row => record(row) ? { id: row.id, versionId: row.versionId, decision: row.decision, reviewedAt: row.reviewedAt } : null) },
  ]);
  for (const event of history.events) event.actorUnknownReason = 'not_in_contract';
  return { state: 'read' as const, history };
}
