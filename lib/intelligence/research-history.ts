/** Metadata-only projection. No IO, clock, writer, role inference or model execution. */
import type { StoredReview, StoredVersion } from './workbook-store';

export type VersionHistoryMetadata = Pick<StoredVersion, 'id' | 'workbookId' | 'version' | 'createdAt' | 'createdBy'>;
export type ReviewHistoryMetadata = Pick<StoredReview, 'id' | 'versionId' | 'decision' | 'reviewedAt'>;
export type HistorySource = 'worker_state' | 'worker_last_run' | 'workbook_versions' | 'workbook_reviews';
export interface HistorySnapshot {
  source: HistorySource;
  /** Stable, nonsecret scope alias supplied by an authorized caller, never a path/URL/token. */
  sourceId: string;
  readAt?: string | null;
  status: 'read' | 'unavailable';
  /** Existing worker JSON, VersionHistoryMetadata[], or ReviewHistoryMetadata[]. */
  data?: unknown;
}
type EventKind = 'worker_state_observed' | 'worker_result_reported' | 'workbook_version_recorded' | 'workbook_review_recorded';
export interface ResearchHistoryEvent {
  id: string;
  kind: EventKind;
  sourceRef: { source: HistorySource; sourceId: string; recordId: string };
  requestDigest: string | null;
  destinationDigest: string | null;
  draftId: string | null;
  workbookId: string | null;
  versionId: string | null;
  version: number | null;
  workerStatus: 'started' | 'ready' | 'stored' | 'failed' | 'unchanged' | 'budget_hold' | null;
  decision: StoredReview['decision'] | null;
  actorId: string | null;
  actorUnknownReason: 'not_recorded' | 'invalid' | 'not_in_contract' | null;
  /** A worker terminal state/last-run is not independent destination readback. */
  evidence: 'snapshot_only' | 'supplied_version_row' | 'supplied_review_row';
  writeOutcome: 'unknown' | 'version_row_present' | 'review_row_present';
  times: {
    readAt: string | null;
    entryAt: string | null;
    reportedAt: string | null;
    createdAt: string | null;
    reviewedAt: string | null;
    startedAt: null;
    completedAt: null;
  };
  gaps: string[];
}
interface SourceCoverage {
  source: HistorySource;
  sourceId: string | null;
  state: 'read' | 'unavailable' | 'invalid' | 'not_supplied';
  readAt: string | null;
  schemaVersion: 1 | 2 | null;
  invalidRows: number;
}
const SOURCES: HistorySource[] = ['worker_state', 'worker_last_run', 'workbook_versions', 'workbook_reviews'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): string | null => typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;
const digest = (v: unknown): string | null => typeof v === 'string' && DIGEST.test(v) ? v : null;
const key = (...parts: (string | number | null)[]) => JSON.stringify(parts);

/** Require an explicit timezone and a real calendar date; do not use Date.parse's rollover. */
function instant(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m || Number(m[1]) < 1000 || Number(m[2]) < 1 || Number(m[2]) > 12 ||
    Number(m[3]) < 1 || Number(m[3]) > new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() ||
    Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59 || !Number.isFinite(Date.parse(v))) return null;
  return v; // Preserve source precision, including PostgreSQL microseconds.
}
function setTime(event: ResearchHistoryEvent, field: 'entryAt' | 'reportedAt' | 'createdAt' | 'reviewedAt', value: unknown) {
  event.times[field] = instant(value);
  if (!event.times[field]) event.gaps.push(`${field}_${value === undefined || value === null ? 'missing' : 'invalid'}`);
}
function base(snapshot: HistorySnapshot, recordId: string, kind: EventKind): ResearchHistoryEvent {
  const readAt = instant(snapshot.readAt);
  return {
    id: key(snapshot.source, snapshot.sourceId, recordId, kind), kind,
    sourceRef: { source: snapshot.source, sourceId: snapshot.sourceId, recordId },
    requestDigest: null, destinationDigest: null, draftId: null, workbookId: null, versionId: null, version: null,
    workerStatus: null, decision: null, actorId: null, actorUnknownReason: 'not_in_contract',
    evidence: 'snapshot_only', writeOutcome: 'unknown',
    times: { readAt, entryAt: null, reportedAt: null, createdAt: null, reviewedAt: null, startedAt: null, completedAt: null },
    gaps: ['intermediate_transitions_not_recorded', ...(!readAt ? ['readAt_missing_or_invalid'] : [])],
  };
}

/**
 * Only caller-supplied, already-authorized metadata is projected. This function grants
 * no access. Returned references must stay in an authorized consumer. Unavailable
 * reads are not empty histories. Source read times are never event completion times.
 */
export function projectResearchHistory(snapshots: readonly HistorySnapshot[]) {
  const candidates: ResearchHistoryEvent[] = [];
  const sources: SourceCoverage[] = [];
  for (const snapshot of snapshots) {
    const validScope = typeof snapshot.sourceId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(snapshot.sourceId);
    const coverage: SourceCoverage = {
      source: snapshot.source, sourceId: validScope ? snapshot.sourceId : null,
      state: validScope && SOURCES.includes(snapshot.source) ? snapshot.status : 'invalid',
      readAt: instant(snapshot.readAt), schemaVersion: null, invalidRows: 0,
    };
    sources.push(coverage);
    if (coverage.state !== 'read') continue;
    const data = snapshot.data;
    if (snapshot.source === 'worker_state') {
      if (!object(data) || (data.version !== 1 && data.version !== 2) || !object(data.entries)) {
        coverage.state = 'invalid'; continue;
      }
      coverage.schemaVersion = data.version;
      for (const [requestDigest, row] of Object.entries(data.entries)) {
        if (!digest(requestDigest) || !object(row) || typeof row.status !== 'string' || !['started', 'ready', 'stored', 'failed'].includes(row.status)) {
          coverage.invalidRows++; continue;
        }
        const at = instant(row.at);
        // A state observation is repeatable, but is not a reconstructed transition.
        const event = base(snapshot, key(requestDigest, String(row.status), at), 'worker_state_observed');
        event.requestDigest = requestDigest;
        event.workerStatus = row.status as ResearchHistoryEvent['workerStatus'];
        event.draftId = uuid(row.id);
        event.gaps.push('entry_at_not_completion', 'destination_not_independently_read');
        setTime(event, 'entryAt', row.at);
        candidates.push(event);
      }
    } else if (snapshot.source === 'worker_last_run') {
      if (!object(data) || typeof data.status !== 'string' || !['stored', 'unchanged', 'budget_hold', 'failed'].includes(data.status)) {
        coverage.state = 'invalid'; continue;
      }
      const event = base(snapshot, key(String(data.status), instant(data.at), uuid(data.id), digest(data.requestDigest), digest(data.destinationDigest)), 'worker_result_reported');
      event.workerStatus = data.status as ResearchHistoryEvent['workerStatus'];
      event.requestDigest = digest(data.requestDigest);
      event.destinationDigest = digest(data.destinationDigest);
      event.draftId = uuid(data.id);
      event.gaps.push('last_run_not_full_history', 'destination_not_independently_read');
      if (!instant(data.at)) event.gaps.push('undated_report_not_unique_run');
      setTime(event, 'reportedAt', data.at);
      candidates.push(event);
    } else {
      if (!Array.isArray(data)) { coverage.state = 'invalid'; continue; }
      for (const row of data) {
        if (!object(row) || !uuid(row.id)) { coverage.invalidRows++; continue; }
        const isVersion = snapshot.source === 'workbook_versions';
        if (isVersion ? (!uuid(row.workbookId) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) :
          (!uuid(row.versionId) || typeof row.decision !== 'string' || !['approved_internal', 'returned'].includes(row.decision))) {
          coverage.invalidRows++; continue;
        }
        const event = base(snapshot, uuid(row.id)!, isVersion ? 'workbook_version_recorded' : 'workbook_review_recorded');
        if (isVersion) {
          event.workbookId = uuid(row.workbookId);
          event.versionId = uuid(row.id);
          event.version = Number(row.version);
          event.actorId = uuid(row.createdBy);
          event.actorUnknownReason = event.actorId ? null : row.createdBy == null ? 'not_recorded' : 'invalid';
          event.evidence = 'supplied_version_row'; event.writeOutcome = 'version_row_present';
          setTime(event, 'createdAt', row.createdAt);
        } else {
          event.versionId = uuid(row.versionId);
          event.decision = row.decision as StoredReview['decision'];
          event.evidence = 'supplied_review_row'; event.writeOutcome = 'review_row_present';
          setTime(event, 'reviewedAt', row.reviewedAt);
        }
        candidates.push(event);
      }
    }
  }
  for (const source of SOURCES) if (!sources.some(row => row.source === source)) {
    sources.push({ source, sourceId: null, state: 'not_supplied', readAt: null, schemaVersion: null, invalidRows: 0 });
  }

  // Dedupe excludes readAt: observing a row later does not create a new action.
  const byId = new Map<string, ResearchHistoryEvent>();
  const variants = new Map<string, Set<string>>();
  const conflicts = new Set<string>();
  let duplicatesDropped = 0;
  const content = (e: ResearchHistoryEvent) => JSON.stringify({ ...e, times: { ...e.times, readAt: null }, gaps: e.gaps.filter(g => g !== 'readAt_missing_or_invalid') });
  for (const event of candidates) {
    const fingerprint = content(event);
    const seen = variants.get(event.id);
    if (seen?.has(fingerprint)) duplicatesDropped++;
    else if (seen) { seen.add(fingerprint); conflicts.add(event.id); }
    else variants.set(event.id, new Set([fingerprint]));
    const previous = byId.get(event.id);
    if (!previous) { byId.set(event.id, event); continue; }
    if (content(previous) !== fingerprint) continue;
    const a = previous.times.readAt, b = event.times.readAt;
    if (b && (!a || Date.parse(b) > Date.parse(a) || (Date.parse(b) === Date.parse(a) && b > a))) {
      previous.times.readAt = b;
      previous.gaps = previous.gaps.filter(g => g !== 'readAt_missing_or_invalid');
    }
  }
  const events = [...byId.values()].filter(e => !conflicts.has(e.id));
  const versions = new Map(events.filter(e => e.kind === 'workbook_version_recorded').map(e => [key(e.sourceRef.sourceId, e.versionId), e]));
  for (const review of events.filter(e => e.kind === 'workbook_review_recorded')) {
    const version = versions.get(key(review.sourceRef.sourceId, review.versionId));
    if (version) { review.workbookId = version.workbookId; review.version = version.version; }
    else review.gaps.push('version_metadata_not_supplied_or_conflicting');
  }
  // Stable reference order only, deliberately not an invented chronological story.
  events.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    events, sources, duplicatesDropped, conflictingReferences: [...conflicts].sort(),
    coverage: { scope: 'supplied_metadata_only' as const, live: false, allAnalysts: false, appendOnly: false, intermediateTransitionsReconstructed: false },
  };
}
