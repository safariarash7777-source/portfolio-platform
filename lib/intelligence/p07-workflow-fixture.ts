/** Synthetic, in-memory UI fixture only. No fetch, provider, database or production authority. */
import { emptyWorkbook, parseWorkbook, type ResearchWorkbook } from './research-workbook';
import { listWorkbooks, openWorkbook, saveWorkbook, decideWorkbook, StoreError, type WorkbookStore, type StoredVersion, type StoredReview } from './workbook-store';
import { publicationCommand, type PublicationRow } from './publication';

export const P07_FIXTURE_COHORT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export type P07Transport = (path: string, init?: RequestInit) => Promise<{ status: number; body: Record<string, unknown> }>;
export function p07FixtureWorkbook(): ResearchWorkbook {
  const w = emptyWorkbook();
  return { ...w, title: 'نمونه ساختگی: بررسی یک تغییر', question: 'این رخداد چه محدودیتی دارد؟', horizon: 'افق نمونه برای آزمون',
    evidence: [{ id: 'e1', statement: 'شاهد کاملاً ساختگی', sourceUrl: 'https://example.invalid/p07-synthetic', observedOn: '2026-10-02', publishedOn: '2026-10-01' }],
    interpretation: 'تفسیر ساختگی؛ این نوشته تحلیل واقعی نیست.', counterEvidence: 'شاهد مخالف نمونه و محدودیت بررسی نمونه',
    scenarios: { base: { assumptions: 'فرض نمونه', mechanism: 'مسیر اثر نمونه', invalidation: 'شرط ابطال نمونه' },
      upside: { assumptions: 'فرض نمونه', mechanism: 'مسیر اثر نمونه', invalidation: 'شرط ابطال نمونه' },
      downside: { assumptions: 'فرض نمونه', mechanism: 'مسیر اثر نمونه', invalidation: 'شرط ابطال نمونه' } },
    portfolioImpact: 'اثر ساختگی؛ هیچ محاسبه یا اقدام مالی ندارد.', reviewOn: '2026-10-10' };
}
export function createP07WorkflowFixture() {
  const versions: StoredVersion[] = [], reviews: StoredReview[] = [], publications: PublicationRow[] = [];
  const commands = new Map<string, { body: string; receipt: string }>();
  let sequence = 1, tick = 0, failure: number | null = null;
  const id = () => `cccccccc-cccc-4ccc-8ccc-${String(sequence++).padStart(12, '0')}`;
  const clock = () => new Date(Date.UTC(2026, 9, 2, 10, 0, tick++)).toISOString();
  const store: WorkbookStore = {
    recent: async limit => versions.slice(-limit).map(({ body: _body, ...row }) => { void _body; return row; }),
    versions: async workbookId => versions.filter(row => row.workbookId === workbookId),
    reviews: async versionIds => reviews.filter(row => versionIds.includes(row.versionId)),
    insertVersion: async row => {
      const last = versions.filter(v => v.workbookId === row.workbookId).at(-1);
      if (row.version !== (last?.version ?? 0) + 1) throw new StoreError('conflict');
      const saved = { ...row, body: parseWorkbook(JSON.stringify(row.body)), id: id(), createdAt: clock() };
      versions.push(saved); return saved;
    },
    insertReview: async row => {
      if (row.decision === 'approved_internal' && reviews.some(review => review.versionId === row.versionId && review.decision === 'approved_internal')) throw new StoreError('conflict');
      const saved = { ...row, id: id(), reviewedAt: clock() }; reviews.push(saved); return saved;
    },
  };
  const gateway = { privatePreparationWritable: true, getUser: async () => ({ id: P07_FIXTURE_COHORT }), getRole: async () => 'admin', createStore: () => store, newId: id };
  function approved(versionId: string) {
    const version = versions.find(row => row.id === versionId);
    if (!version || versions.filter(row => row.workbookId === version.workbookId).at(-1)?.id !== version.id) return false;
    return reviews.filter(row => row.versionId === versionId).at(-1)?.decision === 'approved_internal';
  }
  function current(row: PublicationRow) {
    return publications.filter(item => item.publicationId === row.publicationId).at(-1)?.id === row.id && approved(row.workbookVersionId);
  }
  const transport: P07Transport = async (path, init) => {
    if (failure !== null) { const status = failure; failure = null; return { status, body: { error: 'خطای نمونه؛ متن حفظ شود.', unavailable: status === 503 } }; }
    const url = new URL(path, 'https://example.invalid');
    const write = init?.method === 'POST';
    let payload: Record<string, unknown> = {};
    try { if (write) payload = JSON.parse(String(init?.body)) as Record<string, unknown>; }
    catch { return { status: 400, body: { error: 'ورودی نمونه معتبر نیست.' } }; }
    if (url.pathname === '/api/admin/intelligence/workbooks') {
      if (!write) return url.searchParams.get('id')
        ? openWorkbook(gateway, url.searchParams.get('id')!, url.searchParams.has('version') ? Number(url.searchParams.get('version')) : null)
        : listWorkbooks(gateway);
      return payload.action === 'save' ? saveWorkbook(gateway, payload) : payload.action === 'decide' ? decideWorkbook(gateway, payload)
        : { status: 400, body: { error: 'فرمان نمونه معتبر نیست.' } };
    }
    if (url.pathname.includes('course-needs')) return { status: 200, body: { state: 'available', data: { submittedCount: 0, interests: [], questions: [] } } };
    if (url.pathname !== '/api/admin/intelligence/publications') return { status: 404, body: { error: 'مسیر خارج از fixture است.' } };
    if (!write) return { status: 200, body: {
      contractVersion: 'publication.v1', items: publications.filter(row => publications.filter(p => p.publicationId === row.publicationId).at(-1)?.id === row.id).map(row => ({ ...row, approvalCurrent: current(row), state: !current(row) && ['ready', 'published'].includes(row.state) ? 'approval_invalid' : row.state })),
      workbooksState: 'available', cohortsState: 'available', workbooks: versions.filter(row => versions.filter(v => v.workbookId === row.workbookId).at(-1)?.id === row.id).map(row => {
        const w = row.body as ResearchWorkbook;
        return { id: row.id, workbookId: row.workbookId, version: row.version, title: row.title, approved: approved(row.id), sources: w.evidence.map(e => ({ url: e.sourceUrl, asOf: e.publishedOn })) };
      }), cohorts: [{ id: P07_FIXTURE_COHORT, title: 'دوره ساختگی P07', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' }],
    } };
    try {
      const command = publicationCommand(payload), key = String(payload.idempotencyKey), body = JSON.stringify(payload);
      const previous = commands.get(key);
      if (previous) return previous.body === body ? { status: 201, body: { receipt: previous.receipt } } : { status: 409, body: { error: 'کلید تکرار با فرمان دیگری استفاده شده است.' } };
      let receipt: string;
      if (payload.action === 'save') {
        const aggregate = typeof payload.publicationId === 'string' ? payload.publicationId : id();
        const last = publications.filter(row => row.publicationId === aggregate).at(-1);
        if (payload.baseVersion !== (last?.version ?? 0)) return { status: 409, body: { error: 'نسخه پایه تغییر کرده است.' } };
        const row: PublicationRow = { ...command.args.p_body as PublicationRow, id: id(), publicationId: aggregate, version: Number(payload.baseVersion) + 1, createdAt: clock(), state: 'draft', approvalCurrent: false };
        if (!versions.some(v => v.id === row.workbookVersionId)) return { status: 422, body: { error: 'نسخه پژوهش نمونه وجود ندارد.' } };
        publications.push(row); receipt = row.id;
      } else {
        const row = publications.find(item => item.id === payload.versionId);
        if (!row) return { status: 404, body: { error: 'نسخه نمونه موجود نیست.' } };
        if (payload.action !== 'withdraw' && (!current(row) || (payload.action === 'ready' ? row.state !== 'draft' : row.state !== 'ready')))
          return { status: 422, body: { error: 'تأیید پژوهش یا وضعیت نسخه معتبر نیست.' } };
        row.state = payload.action === 'ready' ? 'ready' : payload.action === 'publish' ? 'published' : 'withdrawn'; receipt = id();
      }
      commands.set(key, { body, receipt }); return { status: 201, body: { receipt, contractVersion: 'publication.v1' } };
    } catch (error) { return { status: 422, body: { error: error instanceof Error ? error.message : 'فرمان نمونه نامعتبر است.' } }; }
  };
  return { transport, failNext: (status: 409 | 503) => { failure = status; }, snapshot: () => structuredClone({ versions, reviews, publications }) };
}
