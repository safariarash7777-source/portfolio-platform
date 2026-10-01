import { createClient } from '@/lib/supabase/server';
import { latestPerWorkbook } from './workbook-store';
import { publicationFailure, type PublicationDraft, type PublicationRow } from './publication';

export async function publicationAdmin() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error) return { status: 503, db, user: null };
  if (!user) return { status: 401, db, user: null };
  const role = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { status: role.error ? 503 : role.data?.role === 'admin' ? 200 : 403, db, user };
}
export async function publicationOverview(db: Awaited<ReturnType<typeof createClient>>) {
  const [versions, wb, cohorts] = await Promise.all([
    db.rpc('list_research_publications'),
    db.from('research_workbook_versions').select('id,workbook_id,version,title,body,created_at').order('created_at', { ascending: false }).limit(500),
    db.from('course_cohorts').select('id,title,starts_at,ends_at,status').eq('status','published').order('starts_at', { ascending: false }).limit(50),
  ]);
  if (versions.error) throw publicationFailure(versions.error);
  const publicationRows: PublicationRow[] = [];
  for (const row of (versions.data ?? []) as {id:string;publication_id:string;version:number;body:PublicationDraft;created_at:string;state:string;approvalCurrent:boolean}[]) {
    const current = row.approvalCurrent === true;
    const state = (row.state === 'publish' ? 'published' : row.state === 'withdraw' ? 'withdrawn' : row.state) as PublicationRow['state'];
    publicationRows.push({ ...(row.body as PublicationDraft), id: row.id, publicationId: row.publication_id, version: row.version, createdAt: row.created_at, state: !current && ['ready','published'].includes(state) ? 'approval_invalid' : state, approvalCurrent: current });
  }
  const workbookRows = latestPerWorkbook((wb.data ?? []).map(w => ({ ...w, workbookId: w.workbook_id, createdAt: w.created_at })));
  const review = workbookRows.length ? await db.from('research_workbook_reviews').select('version_id,decision,reviewed_at').in('version_id', workbookRows.map(w => w.id)).order('reviewed_at', { ascending: false }) : { data: [], error: null };
  return {
    contractVersion: 'publication.v1', items: publicationRows,
    workbooksState: wb.error || review.error ? 'unavailable' : 'available',
    workbooks: wb.error || review.error ? [] : workbookRows.map(w => {
      const decisions=review.data?.filter(r=>r.version_id===w.id)??[];
      const latest=decisions[0];
      const approved=latest?.decision==='approved_internal'&&!decisions.some(r=>r.reviewed_at===latest.reviewed_at&&r.decision==='returned');
      return { id: w.id, workbookId: w.workbook_id, version: w.version, title: w.title, approved, sources: Array.isArray(w.body?.evidence) ? w.body.evidence.map((e: { sourceUrl: string; publishedOn: string }) => ({ url: e.sourceUrl, asOf: e.publishedOn })) : [] };
    }),
    cohortsState: cohorts.error ? 'unavailable' : 'available', cohorts: cohorts.data ?? [],
  };
}
