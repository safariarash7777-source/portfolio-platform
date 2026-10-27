import ResearchWorkbook from '@/components/admin/ResearchWorkbook';
import ResearchCaseFiles from '@/components/admin/ResearchCaseFiles';
import { loadResearchDraftsView } from '@/lib/intelligence/research-drafts-view';
import { Suspense } from 'react';
export const metadata = { title: 'کاربرگ تحلیل | پنل مدیریت', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
// Shares the existing server-side admin layout gate. No public route or API.
async function ExistingCases() {
  const view = await loadResearchDraftsView();
  return <ResearchCaseFiles view={view} />;
}
export default function ResearchPage() {
  return <div className="space-y-8"><Suspense fallback={<p role="status">در حال خواندن پرونده‌های ذخیره‌شده…</p>}><ExistingCases /></Suspense><div id="research-workbook"><ResearchWorkbook /></div></div>;
}
