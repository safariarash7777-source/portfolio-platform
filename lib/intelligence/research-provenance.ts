/** Offline sidecar only. No store adapter, actor authentication, Gate or publishing action. */
import { createHash } from 'node:crypto';
import type { IntelClaim, IntelClaimEvidence, IntelEvidence, IntelEvent, IntelRun, IntelSource } from './contracts';
import { isCalendarDate, isSourceUrl, parseWorkbook, reviewWorkbook } from './research-workbook';
import type { StoredReview, StoredVersion } from './workbook-store';
import { EVENT_SCOPES, REQUIRED_REHEARSAL_DAYS, summarizeRehearsal, type RehearsalDay } from './workflow';

export interface EvidenceReviewReference {
  workbookEvidenceId: string;
  evidenceId: IntelEvidence['id'];
  contentHash: IntelEvidence['contentHash'];
  claimId: IntelClaim['id'];
  requiresUnit: boolean;
  requiresScope: boolean;
}
/** Detached consistency snapshot; not an approval receipt or a new persisted ledger. */
export interface ResearchReviewReference {
  workbookId: StoredVersion['workbookId'];
  versionId: StoredVersion['id'];
  versionNo: StoredVersion['version'];
  workbookHash: string;
  reviewId: StoredReview['id'];
  evidence: readonly EvidenceReviewReference[];
}
/** Existing phase34 row columns, optional because StoredReview currently omits reviewed_by. */
export interface ExistingReviewIdentity {
  id: string; version_id: string; reviewed_by: string; reviewed_at: string;
}
export interface ResearchProvenanceInput {
  version: StoredVersion;
  review: StoredReview | null;
  reference: ResearchReviewReference;
  evidence: readonly IntelEvidence[];
  sources: readonly IntelSource[];
  claims: readonly IntelClaim[];
  events: readonly IntelEvent[];
  links: readonly IntelClaimEvidence[];
  nativeReviewIdentity?: ExistingReviewIdentity;
  /** Explicit caller clock; no reading live environment or guessing a review time. */
  checkedAt: string;
}
export interface ProvenanceIssue { code: string; field: string; }
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const instant = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
      !isCalendarDate(v.slice(0, 10))) return null;
  const [hour, minute, second] = v.slice(11, 19).split(':').map(Number);
  if (hour > 23 || minute > 59 || second > 59 || Number(v.slice(0, 4)) < 1) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
};
const canonical = (v: unknown): string => JSON.stringify(v, (_key, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

/** Hash only parseWorkbook's known preparation fields, never imported authority flags. */
export function workbookContentFingerprint(body: unknown): string {
  return createHash('sha256').update(canonical(parseWorkbook(JSON.stringify(body)))).digest('hex');
}

export function validateResearchProvenance(input: ResearchProvenanceInput) {
  const issues: ProvenanceIssue[] = [];
  const gaps = new Set(['review_evidence_snapshot_not_persisted', 'workbook_claim_mapping_not_persisted', 'record_authenticity_not_proved_offline']);
  const issue = (code: string, field: string) => issues.push({ code, field });
  const { version, review, reference } = input;
  const checked = instant(input.checkedAt), created = instant(version.createdAt);
  if (checked === null || created === null || created > checked) issue('invalid_version_or_check_time', 'version.createdAt');
  if (!uuid(version.id) || !uuid(version.workbookId) || !Number.isSafeInteger(version.version) || version.version < 1 ||
      reference.versionId !== version.id || reference.workbookId !== version.workbookId || reference.versionNo !== version.version) {
    issue('stale_workbook_version', 'reference.versionId');
  }
  let workbook;
  try {
    workbook = parseWorkbook(JSON.stringify(version.body));
    if (workbookContentFingerprint(version.body) !== reference.workbookHash) issue('changed_workbook_content', 'reference.workbookHash');
    for (const item of reviewWorkbook(workbook)) issue('workbook_structure_incomplete', item.field);
  } catch {
    issue('invalid_workbook', 'version.body');
  }
  let reviewerId: string | null = null;
  let reviewedAt: string | null = null;
  if (!review) issue('existing_review_missing', 'review');
  else {
    const at = instant(review.reviewedAt);
    if (!uuid(review.id) || review.id !== reference.reviewId || review.versionId !== version.id || review.decision !== 'approved_internal') {
      issue('review_receipt_mismatch', 'review');
    }
    if (at === null || created === null || checked === null || at < created || at > checked) issue('invalid_review_time', 'review.reviewedAt');
    else reviewedAt = review.reviewedAt;
    const identity = input.nativeReviewIdentity;
    if (!identity) gaps.add('stored_review_dto_omits_reviewer_identity');
    else if (identity.id !== review.id || identity.version_id !== review.versionId ||
        !uuid(identity.reviewed_by) ||
        at === null || instant(identity.reviewed_at) !== at) {
      issue('native_review_identity_mismatch', 'nativeReviewIdentity');
    } else reviewerId = identity.reviewed_by;
  }
  const indexed = <T extends { id: string }>(items: readonly T[], field: string) => {
    const map = new Map<string, T>();
    for (const item of items) {
      if (!text(item.id) || map.has(item.id)) issue('duplicate_or_missing_id', field);
      map.set(item.id, item);
    }
    return map;
  };
  const evidence = indexed(input.evidence, 'evidence'), sources = indexed(input.sources, 'sources');
  const claims = indexed(input.claims, 'claims'), events = indexed(input.events, 'events');
  const seen = new Set<string>();
  if (!reference.evidence.length) issue('evidence_references_missing', 'reference.evidence');
  for (const binding of reference.evidence) {
    const field = `reference.evidence.${binding.workbookEvidenceId}`;
    if (seen.has(binding.workbookEvidenceId)) issue('duplicate_workbook_evidence_binding', field);
    seen.add(binding.workbookEvidenceId);
    const local = workbook?.evidence.find(e => e.id === binding.workbookEvidenceId);
    const item = evidence.get(binding.evidenceId), claim = claims.get(binding.claimId);
    if (!local || !item || !claim || !input.links.some(link => link.evidenceId === binding.evidenceId && link.claimId === binding.claimId)) {
      issue('missing_existing_evidence_or_claim_link', field); continue;
    }
    if (local.statement !== claim.statement) issue('workbook_claim_statement_mismatch', field);
    if (!text(item.contentHash) || item.contentHash !== binding.contentHash) issue('changed_evidence_hash', field);
    if (!text(item.excerpt) || !sources.has(item.sourceId)) issue('source_data_missing', field);
    const observed = instant(item.observedAt), published = item.publishedAt === null ? null : instant(item.publishedAt);
    if (observed === null || checked === null || observed > checked ||
        (item.publishedAt !== null && (published === null || published > checked))) issue('invalid_evidence_time', field);
    if (!item.contentUrl || !isSourceUrl(item.contentUrl) || local.sourceUrl !== item.contentUrl) issue('source_url_mismatch', field);
    const observedDay = observed !== null && typeof item.observedAt === 'string' ? item.observedAt.slice(0, 10) : null;
    const publishedDay = published !== null && typeof item.publishedAt === 'string' ? item.publishedAt.slice(0, 10) : null;
    if (local.observedOn !== observedDay || local.publishedOn !== publishedDay) issue('workbook_evidence_date_mismatch', field);
    if (binding.requiresUnit !== true && binding.requiresUnit !== false || binding.requiresScope !== true && binding.requiresScope !== false) {
      issue('dependency_requirements_unknown', field);
    }
    if (binding.requiresUnit) {
      // IntelEvidence has no unit field. Never infer it from URL, statement or an imported extra key.
      gaps.add('intel_evidence_unit_not_recorded'); issue('dependent_unit_unattested', field);
    }
    if (binding.requiresScope) {
      const event = claim.eventId ? events.get(claim.eventId) : null;
      if (!event || !EVENT_SCOPES.includes(event.scope)) issue('dependent_scope_unknown', field);
    }
  }
  for (const local of workbook?.evidence ?? []) if (!seen.has(local.id)) issue('workbook_evidence_unbound', `evidence.${local.id}`);
  return {
    consistent: issues.length === 0, issues, gaps: [...gaps].sort(),
    reviewObservation: { reviewId: review?.id ?? null, reviewerId: issues.length ? null : reviewerId, reviewedAt: issues.length ? null : reviewedAt },
    sourceTruthVerified: false as const, quotationTruthVerified: false as const,
    humanReviewAuthenticated: false as const, publicationAuthorized: false as const, gate3Accepted: false as const,
  };
}

/** Provenance labels are offline declarations, not a replacement for an installed Gate3 record. */
export interface RehearsalReference {
  day: RehearsalDay; run: IntelRun | null; declaredOrigin: 'real' | 'synthetic' | 'unknown';
}
/** Caller-declared calendar only: not inferred from a timestamp, environment or existing DTO. */
export function inspectRehearsalReferences(rows: readonly RehearsalReference[], checkedAt: string, calendarZone?: string) {
  const issues: ProvenanceIssue[] = [], days = new Set<string>(), runs = new Set<string>(), selected: RehearsalDay[] = [];
  const checked = instant(checkedAt);
  let calendar: Intl.DateTimeFormat | null = null;
  try {
    if (typeof calendarZone === 'string' && calendarZone.trim()) {
      calendar = new Intl.DateTimeFormat('en-US', { timeZone: calendarZone, year: 'numeric', month: '2-digit', day: '2-digit', era: 'short' });
    }
  } catch { /* An unknown caller calendar is a diagnostic, never a process failure. */ }
  if (!calendar) issues.push({ code: 'rehearsal_calendar_zone_unknown', field: 'calendarZone' });
  const calendarDay = (at: number): string | null => {
    if (!calendar) return null;
    const parts = Object.fromEntries(calendar.formatToParts(at).map(part => [part.type, part.value]));
    return parts.era === 'AD' ? `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}` : null;
  };
  const checkedDay = checked === null ? null : calendarDay(checked);
  for (const [index, row] of rows.entries()) {
    const field = `rehearsals.${index}`;
    if (row.declaredOrigin !== 'real') { issues.push({ code: 'not_declared_real', field }); continue; }
    const { day, run } = row;
    if (checked === null || !isCalendarDate(day.rehearsalDate) || !run || !text(run.id) || run.status !== 'succeeded' ||
        !Number.isSafeInteger(day.dayIndex) || day.dayIndex < 1 || typeof day.briefProduced !== 'boolean' ||
        ![day.humanCorrections, day.rejectedConclusions, day.missedEvents].every(n => Number.isSafeInteger(n) && n >= 0) ||
        day.minutesToApproval !== null && (!Number.isFinite(day.minutesToApproval) || day.minutesToApproval < 0) ||
        !Array.isArray(day.absentSources) || !Array.isArray(day.staleSources) ||
        ![...day.absentSources, ...day.staleSources].every(text) ||
        instant(run.startedAt) === null || instant(run.completedAt) === null ||
        Date.parse(run.completedAt!) > checked ||
        Date.parse(run.completedAt!) < Date.parse(run.startedAt)) {
      issues.push({ code: 'invalid_existing_day_or_run', field }); continue;
    }
    // Require the declared day to intersect the run's interval in the caller's calendar.
    // This establishes input consistency only; it does not attest the day/run link.
    const startedDay = calendarDay(Date.parse(run.startedAt)), completedDay = calendarDay(Date.parse(run.completedAt!));
    if (!checkedDay || !startedDay || !completedDay) {
      if (calendar) issues.push({ code: 'invalid_existing_calendar_day', field });
      continue;
    }
    if (day.rehearsalDate > checkedDay) { issues.push({ code: 'future_rehearsal_day', field }); continue; }
    if (day.rehearsalDate < startedDay || day.rehearsalDate > completedDay) {
      issues.push({ code: 'rehearsal_day_run_mismatch', field }); continue;
    }
    if (days.has(day.rehearsalDate) || runs.has(run.id)) { issues.push({ code: 'repeated_day_or_run', field }); continue; }
    days.add(day.rehearsalDate); runs.add(run.id); selected.push(day);
  }
  const summary = summarizeRehearsal(selected);
  return {
    uniqueDeclaredRealDays: selected.length,
    structuralTenDayCandidate: selected.length >= REQUIRED_REHEARSAL_DAYS && issues.length === 0,
    summary: { ...summary, readyForGateReview: summary.readyForGateReview && issues.length === 0 }, issues,
    gaps: ['rehearsal_real_origin_not_attested', 'rehearsal_run_link_not_in_existing_day_dto', 'rehearsal_calendar_zone_not_recorded'],
    realDaysVerified: false as const, gate3Accepted: false as const, publicationAuthorized: false as const,
  };
}
