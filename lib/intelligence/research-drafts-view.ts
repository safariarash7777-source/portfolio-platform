import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { validateResearchDraft, type ResearchDraft } from '@/lib/intelligence/research-agent';

interface DraftSource {
  evidence: string; symbol: string; reportId: string; sourceUrl: string;
  periodEnd: string; periodMonths: number; publishedAt: string | null;
  fetchedAt: string | null; capturedAt: string | null; unit: string; scope: string;
}
export interface StoredResearchDraft {
  id: string; createdAt: string; provider: string; model: string;
  body: ResearchDraft; provenance: DraftSource[];
}
export interface ResearchDraftsView {
  drafts: StoredResearchDraft[]; unavailableReason: string | null; invalidCount: number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_stored_draft');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_stored_text');
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = text(value, 60);
  if (!Number.isFinite(Date.parse(result))) throw new Error('invalid_stored_date');
  return result;
}
function source(value: unknown): DraftSource {
  const row = object(value);
  const evidence = text(row.evidence, 3);
  if (!/^E([1-9]|1[0-9]|20)$/.test(evidence)) throw new Error('invalid_evidence_alias');
  const url = new URL(text(row.sourceUrl, 2000));
  if (url.protocol !== 'https:' || !['codal.ir', 'www.codal.ir'].includes(url.hostname)
    || url.port || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => /key|token|secret|password/i.test(key))) throw new Error('invalid_source_url');
  if (!Number.isInteger(row.periodMonths) || Number(row.periodMonths) < 1 || Number(row.periodMonths) > 12) throw new Error('invalid_period');
  const periodEnd = text(row.periodEnd, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) throw new Error('invalid_period_end');
  if (typeof row.reportId !== 'string' && (typeof row.reportId !== 'number' || !Number.isSafeInteger(row.reportId))) throw new Error('invalid_report_id');
  return {
    evidence, symbol: text(row.symbol), reportId: text(String(row.reportId)), sourceUrl: url.href,
    periodEnd, periodMonths: Number(row.periodMonths), publishedAt: timestamp(row.publishedAt),
    fetchedAt: timestamp(row.fetchedAt), capturedAt: timestamp(row.capturedAt), unit: text(row.unit), scope: text(row.scope),
  };
}
/** Stored JSON remains untrusted; rendering a row never implies semantic approval. */
function parseStoredDraft(value: unknown): StoredResearchDraft {
  const row = object(value);
  if (row.status !== 'draft' || !Array.isArray(row.provenance) || !row.provenance.length || row.provenance.length > 20) throw new Error('invalid_stored_draft');
  const provenance = row.provenance.map(source);
  if (new Set(provenance.map(item => item.evidence)).size !== provenance.length) throw new Error('duplicate_evidence');
  const createdAt = timestamp(row.created_at);
  if (!createdAt) throw new Error('missing_created_at');
  const body = validateResearchDraft(row.body, { version: 'research-v1', observations: provenance.map(item => ({ evidence: item.evidence, bands: {} })) });
  return { id: text(row.id), createdAt, provider: text(row.provider), model: text(row.model), body, provenance };
}
/** Session-scoped and independently admin-checked; no service-role client or model calls. */
export async function loadResearchDraftsView(): Promise<ResearchDraftsView> {
  const unavailable = (unavailableReason: string): ResearchDraftsView => ({ drafts: [], invalidCount: 0, unavailableReason });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return unavailable('برای مشاهدهٔ پیش‌نویس‌ها، نشست معتبر مدیریت لازم است.');
    const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'admin') return unavailable('دسترسی مدیریتی احراز نشد.');
    const { data, error } = await client.from('research_agent_drafts')
      .select('id,created_at,provider,model,status,body,provenance').order('created_at', { ascending: false }).limit(20);
    if (error) return unavailable('خواندن مخزن پیش‌نویس‌ها ممکن نیست؛ اتصال، نصب جدول و مجوز خواندن باید بررسی شود.');
    const drafts: StoredResearchDraft[] = [];
    let invalidCount = 0;
    for (const row of data ?? []) {
      try { drafts.push(parseStoredDraft(row)); } catch { invalidCount += 1; }
    }
    return { drafts, unavailableReason: null, invalidCount };
  } catch {
    return unavailable('مخزن پیش‌نویس‌ها اکنون در دسترس نیست؛ وضعیت اجرای ایجنت از این صفحه قابل احراز نیست.');
  }
}
