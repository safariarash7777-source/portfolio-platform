/** Pure reader adapter. Only metadata supplied by the existing authorized open is consumed. */
import { projectResearchHistory, researchHistoryInstant, type IntentHistoryMetadata, type VersionHistoryMetadata, type ReviewHistoryMetadata } from './research-history';

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

export type WorkbookIntentHistoryRead =
  | { state: 'not_supplied' | 'loading' | 'error' | 'unavailable' | 'invalid' }
  | { state: 'read'; rows: Array<IntentHistoryMetadata | null>; offset: number; nextOffset: number | null };

/** Capture only metadata from one already-completed R2 read; do not retain old pages or private fields. */
export function intentHistoryFromPage(input: { status: number; items: unknown; nextOffset: unknown; offset: number; initial?: boolean; availability?: unknown }): WorkbookIntentHistoryRead {
  if (input.status !== 200) return { state: 'error' };
  if (input.initial && input.availability === undefined) return { state: 'not_supplied' };
  if (input.initial && input.availability === false) return { state: 'unavailable' };
  if ((input.initial && input.availability !== true) || !Array.isArray(input.items) || input.items.length > 50 ||
    !Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 100_000 ||
    !(input.nextOffset === null || (Number.isSafeInteger(input.nextOffset) && Number(input.nextOffset) > input.offset))) return { state: 'invalid' };
  const rows = input.items.map(row => {
    if (!record(row) || typeof row.intentId !== 'string' || !UUID.test(row.intentId) ||
      typeof row.workbookId !== 'string' || !UUID.test(row.workbookId) || !Number.isSafeInteger(row.baseVersion) ||
      Number(row.baseVersion) < 0 || Number(row.baseVersion) >= 2_147_483_647 || row.targetVersion !== Number(row.baseVersion) + 1) return null;
    return { intentId: row.intentId.toLowerCase(), workbookId: row.workbookId.toLowerCase(),
      baseVersion: Number(row.baseVersion), targetVersion: Number(row.targetVersion),
      preparedAt: row.preparedAt == null ? null : researchHistoryInstant(row.preparedAt) ?? '' };
  });
  return { state: 'read', rows, offset: input.offset, nextOffset: input.nextOffset as number | null };
}

export function projectIntentHistory(read: WorkbookIntentHistoryRead, workbookId: string | null = null) {
  const empty = () => projectResearchHistory([]);
  if (read.state !== 'read') return { state: read.state, history: empty(), excludedByWorkbook: 0, workbookId: null, window: null };
  if (workbookId !== null && !UUID.test(workbookId)) return { state: 'invalid' as const, history: empty(), excludedByWorkbook: 0, workbookId: null, window: null };
  const history = projectResearchHistory([{ source: 'workbook_intents', sourceId: 'current-authorized-workbook-intents', status: 'read', readAt: null, data: read.rows }]);
  const filtered = workbookId === null ? history.events : history.events.filter(event => event.workbookId === workbookId.toLowerCase());
  return { state: 'read' as const, history: { ...history, events: filtered }, excludedByWorkbook: history.events.length - filtered.length,
    workbookId, window: { offset: read.offset, nextOffset: read.nextOffset, rowsReceived: read.rows.length, completeHistory: false as const } };
}
