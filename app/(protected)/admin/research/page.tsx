import ResearchWorkbook from '@/components/admin/ResearchWorkbook';
import { resolveAppUrl } from '@/lib/site-url';
export const metadata = { title: 'کاربرگ تحلیل | پنل مدیریت', robots: { index: false, follow: false } };
// Shares the existing server-side admin layout gate. No public route or API.
export default async function ResearchPage({searchParams}:{searchParams:Promise<{source?:string;workbook?:string}>}) {
 const params=await searchParams;
 const path=params.source;
 const safe=path && (/^\/symbol\/[^/?#]{1,64}$/.test(path)||path==='/market/funds'||path==='/codal') ? new URL(path,resolveAppUrl()).href : undefined;
 const id=params.workbook&&/^[0-9a-f-]{36}$/i.test(params.workbook)?params.workbook:undefined;
 return <ResearchWorkbook initialSource={safe} initialWorkbookId={id}/>;
}
