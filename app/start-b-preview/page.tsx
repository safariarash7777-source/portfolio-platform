import { notFound } from 'next/navigation';
import SyntheticWorkbookPreview from './synthetic-workbook-preview';

export const metadata = { title: 'آزمایش ساختگی START-B', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function StartBPreview() {
  // Disposable preview branch only. Never expose this lab in Production.
  if (process.env.VERCEL_ENV !== 'preview') notFound();
  return <SyntheticWorkbookPreview />;
}
