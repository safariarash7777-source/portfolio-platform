import ResearchWorkbook from '@/components/admin/ResearchWorkbook';
export const metadata = { title: 'کاربرگ تحلیل | پنل مدیریت', robots: { index: false, follow: false } };
// Shares the existing server-side admin layout gate. No public route or API.
export default function ResearchPage() { return <ResearchWorkbook />; }
