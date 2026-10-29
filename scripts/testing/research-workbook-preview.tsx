/** Local-only synthetic preview. This entry is never imported by the app. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import ResearchWorkbook from '../../components/admin/ResearchWorkbook';
import { p07FixtureWorkbook } from '../../lib/intelligence/p07-workflow-fixture';

function Preview() {
  const [mode, setMode] = useState('normal');
  async function arm(value: string) {
    const response = await fetch('/_preview/control', { method: 'POST', body: JSON.stringify({ mode: value }) });
    if (response.ok) setMode(value);
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-4">
    <section className="card space-y-3 p-4" aria-label="کنترل پیش‌نمایش ساختگی">
      <h1 className="text-xl font-bold">پیش‌نمایش START-B — فقط دادهٔ ساختگی محلی</h1>
      <p>همان ویرایشگر محصول و قرارداد ذخیره؛ مخزن این پیش‌نمایش حافظه‌ای است. پایگاه واقعی، مدل، تأیید آرش و انتشار عمومی متصل نیستند.</p>
      <label>رفتار ذخیرهٔ بعدی <select aria-label="رفتار ذخیرهٔ بعدی" value={mode} onChange={e => void arm(e.target.value)}>
        <option value="normal">پاسخ عادی</option>
        <option value="lost">قطع پاسخ پس از ثبت</option>
        <option value="absent">قطع پیش از ثبت</option>
      </select></label>
      <p>اختلال انتخابی فقط یک بار اعمال می‌شود. پس از reload، کاربرگ را از فهرست ذخیره‌شده باز کنید. داده تا پایان همین فرایند محلی محفوظ است.</p>
      <a className="underline" href="/_preview/receipt" target="_blank" rel="noreferrer">بازخوانی مستقل مخزن ساختگی</a>
    </section>
    <ResearchWorkbook initialWorkbook={p07FixtureWorkbook()} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
