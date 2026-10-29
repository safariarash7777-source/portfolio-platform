'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ResearchWorkbook, { type WorkbookTransport } from '@/components/admin/ResearchWorkbook';
import { createP07WorkflowFixture, p07FixtureWorkbook } from '@/lib/intelligence/p07-workflow-fixture';

const API = '/api/admin/intelligence/workbooks';

export default function SyntheticWorkbookPreview() {
  const fixture = useMemo(() => createP07WorkflowFixture(), []);
  const started = useRef(false), nextSave = useRef('normal');
  const [id, setId] = useState<string | null>(null);
  const [mode, setMode] = useState('normal');
  const [snapshot, setSnapshot] = useState(() => fixture.snapshot());
  const [requests, setRequests] = useState<Array<{ method: string; version: number | null }>>([]);
  const transport = useMemo<WorkbookTransport>(() => async (path, init) => {
    const url = new URL(path, 'https://synthetic.invalid');
    if (url.pathname !== API) throw new Error('Outside synthetic fixture');
    const command = init?.method === 'POST' ? JSON.parse(String(init.body)) : null;
    setRequests(previous => [...previous.slice(-99), { method: init?.method ?? 'GET', version: command ? Number(command.baseVersion) + 1 : Number(url.searchParams.get('version')) || null }]);
    const fault = command?.action === 'save' ? nextSave.current : 'normal';
    if (command?.action === 'save') { nextSave.current = 'normal'; setMode('normal'); }
    if (fault === 'absent') throw new Error('Synthetic interruption before commit');
    const result = await fixture.transport(path, init);
    setSnapshot(fixture.snapshot());
    if (fault === 'lost') throw new Error('Synthetic response lost after commit');
    return result;
  }, [fixture]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Pre-seed a clearly synthetic approved v1 without a browser dialog or Auth.
    // This is a test precondition, never an Arash/human approval receipt.
    void (async () => {
      const saved = await fixture.transport(API, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
      const workbookId = String(saved.body.workbookId);
      await fixture.transport(API, { method: 'POST', body: JSON.stringify({ action: 'decide', workbookId, version: 1, decision: 'approved_internal' }) });
      setSnapshot(fixture.snapshot()); setId(workbookId);
    })();
  }, [fixture]);
  return <main className="mx-auto max-w-7xl space-y-6 p-4">
    <section className="card space-y-3 border-2 p-5" style={{ borderColor: 'var(--gold)' }} aria-label="آزمایش ساختگی START-B">
      <h1 className="text-xl font-bold">آزمایش ساختگی START-B — سامانهٔ واقعی اعضا نیست</h1>
      <p>فقط پیش‌نمایش همین شاخه: بدون حساب، داده واقعی، پایگاه‌داده، مدل یا انتشار. مخزن حافظه‌ای مرورگر است و با reload از ابتدا ساخته می‌شود. این صفحه شاهد پایداری تولید نیست.</p>
      <p>نسخهٔ اول و بازبینی آن خودکار و صرفاً به‌عنوان پیش‌شرط آزمایش ساخته شده‌اند؛ تأیید آرش نیستند. عنوان را تغییر دهید، قطع پاسخ را انتخاب و نسخهٔ دوم را ذخیره کنید؛ سپس «بررسی دوبارهٔ همین ثبت» را بزنید. تاریخچهٔ اول و نبود تأیید برای دوم را بررسی کنید.</p>
      <label className="block">رفتار ذخیرهٔ بعدی <select className="min-h-11 rounded border p-2" aria-label="رفتار ذخیرهٔ بعدی" value={mode} onChange={event => { nextSave.current = event.target.value; setMode(event.target.value); }}>
        <option value="normal">پاسخ عادی</option><option value="lost">قطع پاسخ پس از ثبت</option><option value="absent">قطع پیش از ثبت</option>
      </select></label>
      <details><summary className="min-h-11 cursor-pointer py-2">رسید مستقل مخزن ساختگی و درخواست‌ها</summary>
        <pre dir="ltr" className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ environment: 'PREVIEW_SYNTHETIC_BROWSER_MEMORY', modelCalls: 0, requests, versions: snapshot.versions.map(row => ({ workbookId: row.workbookId, version: row.version, title: row.title })), reviews: snapshot.reviews.map(row => ({ versionId: row.versionId, decision: row.decision })), publications: snapshot.publications.length }, null, 2)}</pre>
      </details>
    </section>
    {id ? <ResearchWorkbook transport={transport} initialWorkbookId={id} /> : <p role="status">آماده‌سازی دادهٔ ساختگی…</p>}
  </main>;
}
