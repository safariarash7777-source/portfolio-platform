import { parseWorkbook, type ResearchWorkbook } from './research-workbook';
import { parseManualIntake, type ManualIntake } from './p07-preparation';
import { parsePublication, publicationId } from './publication';

/** Malformed admin responses are unavailable, never a successful empty queue. */
export function p07OverviewUsable(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (p.contractVersion !== 'publication.v1' || !Array.isArray(p.items) || p.items.length > 200 || !Array.isArray(p.workbooks) || p.workbooks.length > 500 || !Array.isArray(p.cohorts) || p.cohorts.length > 50) return false;
  if (![p.workbooksState, p.cohortsState].every(state => state === 'available' || state === 'unavailable')) return false;
  try {
    for (const row of p.items) {
      parsePublication(row); publicationId(row.id); publicationId(row.publicationId);
      if (!Number.isInteger(row.version) || row.version < 1 || typeof row.createdAt !== 'string' || typeof row.approvalCurrent !== 'boolean' || !['draft', 'ready', 'published', 'withdrawn', 'approval_invalid'].includes(row.state)) return false;
    }
    for (const w of p.workbooks) {
      publicationId(w.id); publicationId(w.workbookId);
      if (!Number.isInteger(w.version) || w.version < 1 || typeof w.title !== 'string' || typeof w.approved !== 'boolean' || !Array.isArray(w.sources) || !w.sources.every((s: { url?: unknown; asOf?: unknown } | null) => s && typeof s.url === 'string' && typeof s.asOf === 'string')) return false;
    }
    for (const c of p.cohorts) {
      publicationId(c.id);
      if (typeof c.title !== 'string' || typeof c.starts_at !== 'string' || typeof c.ends_at !== 'string') return false;
    }
    return true;
  } catch { return false; }
}

/** Explicit human mapping to existing fields only. Preparation metadata is NOT persisted here. */
export function mapManualClaim(workbook: ResearchWorkbook, input: unknown, claimId: string, evidenceId?: string): ResearchWorkbook {
  const intake = parseManualIntake(input);
  const claim = intake.claims.find(item => item.id === claimId);
  if (!claim) throw new Error('گزاره انتخاب نشده است.');
  const next = parseWorkbook(JSON.stringify(workbook));
  if (claim.kind === 'observation') {
    const evidence = next.evidence.find(item => item.id === evidenceId);
    if (!evidence || !claim.evidenceIds.includes(evidence.id)) throw new Error('شاهد مرتبط را انتخاب کنید.');
    evidence.statement = claim.text;
  } else if (claim.kind === 'interpretation') {
    next.interpretation = claim.text;
  } else {
    throw new Error('سناریو را در سه بخش فروض، مسیر اثر و شرط ابطال کاربرگ موجود تکمیل کنید.');
  }
  return next;
}

export interface P07Review { version: number | null; decision: 'approved_internal' | 'returned'; reviewedAt: string }
export interface P07PreparationBinding { workbookVersionId: string; signature: string }
/** UX binding only; canonical server approval/grant/current remain mandatory. */
export function p07PublicationPreparationIssue(issues: readonly string[], workbookVersionId: string, binding: P07PreparationBinding | null, signature: string): string | null {
  if (issues.length) return 'آماده‌سازی و ابهام‌ها را کامل کنید.';
  if (!binding || binding.workbookVersionId !== workbookVersionId || binding.signature !== signature)
    return 'پس از تغییر آماده‌سازی، نسخه پژوهش را دوباره ذخیره و بازبینی کنید؛ همان پژوهش را برای انتشار انتخاب کنید.';
  return null;
}
/** Match authoritative latest-review semantics, including a returned review tied at the latest time. */
export function p07ReviewCurrent(version: number, latestVersion: number, reviews: readonly P07Review[]): boolean {
  if (version !== latestVersion) return false;
  const here = reviews.filter(item => item.version === version);
  const latest = [...here].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
  return !!latest && latest.decision === 'approved_internal' && !here.some(item => item.reviewedAt === latest.reviewedAt && item.decision === 'returned');
}

/** A bounded local preparation file, not a new server ledger or a publication DTO. */
export function p07PreparationExport(input: unknown, workbook?: ResearchWorkbook): { contract: 'p07.preparation.draft.v1'; intake: ManualIntake; canonicalWorkbookDraft: ResearchWorkbook | null; persisted: false } {
  return { contract: 'p07.preparation.draft.v1', intake: parseManualIntake(input), canonicalWorkbookDraft: workbook ? parseWorkbook(JSON.stringify(workbook)) : null, persisted: false };
}
