'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileUp, Plus, Trash2, ClipboardCheck, Save, FolderOpen, CheckCircle2, Undo2 } from 'lucide-react';
import { DOMAIN_LABEL, INTEL_DOMAINS } from '@/lib/intelligence/contracts';
import { toPersianDigits, formatJalali } from '@/lib/format';
import { isCalendarDate, MAX_WORKBOOK_BYTES, emptyWorkbook, parseWorkbook, reviewWorkbook, workbookMarkdown, SCENARIO_KEYS, SCENARIO_NAMES, type ResearchWorkbook as Workbook } from '@/lib/intelligence/research-workbook';

const inputClass = 'w-full min-h-11 rounded-lg border px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const inputStyle = { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--line)' };
const API = '/api/admin/intelligence/workbooks';

interface SavedRef { workbookId: string; version: number; latestVersion: number; savedAt: string }
interface ListItem { workbookId: string; version: number; title: string; savedAt: string }
interface ReviewItem { version: number | null; decision: 'approved_internal' | 'returned'; note: string | null; reviewedAt: string }
type ServerState = 'checking' | 'ready' | 'unavailable' | 'error';

async function call(input: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(input, { ...init, headers: { 'content-type': 'application/json' }, cache: 'no-store' });
  let body: Record<string, unknown> = {};
  try { body = await res.json() as Record<string, unknown>; } catch { /* بدنهٔ خالی */ }
  return { status: res.status, body };
}

export default function ResearchWorkbook() {
  const [workbook, setWorkbook] = useState(emptyWorkbook);
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const issues = reviewWorkbook(workbook);
  const [server, setServer] = useState<ServerState>('checking');
  const [saved, setSaved] = useState<SavedRef | null>(null);
  const [versions, setVersions] = useState<Array<{ version: number; savedAt: string }>>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [list, setList] = useState<ListItem[]>([]);
  const [busy, setBusy] = useState(false);
  async function refreshList() {
    try {
      const r = await call(API);
      if (r.status === 200) { setList(r.body.items as ListItem[]); setServer('ready'); }
      else setServer(r.body.unavailable ? 'unavailable' : 'error');
    } catch { setServer('error'); }
  }
  useEffect(() => { void refreshList(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('آخرین تغییرات ذخیره نشده است. پیش از خروج ذخیره کرده‌اید یا فایل را دریافت کرده‌اید؟')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); };
  }, [dirty]);
  function change(update: (previous: Workbook) => Workbook) {
    setWorkbook(update); setDirty(true); setMessage('');
  }
  async function saveToServer() {
    setBusy(true);
    try {
      const r = await call(API, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: saved?.workbookId ?? null, baseVersion: saved?.latestVersion ?? 0, workbook }) });
      if (r.status === 201) {
        const version = r.body.version as number;
        setSaved({ workbookId: r.body.workbookId as string, version, latestVersion: version, savedAt: r.body.savedAt as string });
        setVersions(v => [...v, { version, savedAt: r.body.savedAt as string }]);
        setDirty(false);
        setMessage(`نسخهٔ ${toPersianDigits(version)} ذخیره شد. ذخیره به معنی تأیید نیست.`);
        void refreshList();
      } else {
        if (r.body.unavailable) setServer('unavailable');
        setMessage(`${String(r.body.error ?? 'ذخیره انجام نشد.')} متن روی صفحه حفظ شد.`);
      }
    } catch { setMessage('ارتباط با سرور برقرار نشد؛ متن روی صفحه حفظ شد.'); }
    finally { setBusy(false); }
  }
  async function openFromServer(workbookId: string, version: number | null) {
    if (dirty && !window.confirm('تغییرات ذخیره‌نشدهٔ فعلی جایگزین می‌شود. ادامه می‌دهید؟')) return;
    setBusy(true);
    try {
      const r = await call(`${API}?id=${encodeURIComponent(workbookId)}${version ? `&version=${version}` : ''}`);
      if (r.status !== 200) { setMessage(String(r.body.error ?? 'کاربرگ باز نشد.')); return; }
      setWorkbook(r.body.workbook as Workbook);
      setSaved({ workbookId, version: r.body.version as number, latestVersion: r.body.latestVersion as number, savedAt: r.body.savedAt as string });
      setVersions(r.body.versions as Array<{ version: number; savedAt: string }>);
      setReviews(r.body.reviews as ReviewItem[]);
      setDirty(false); setChecked(false);
      const v = r.body.version as number; const latest = r.body.latestVersion as number;
      setMessage(v === latest
        ? `نسخهٔ ${toPersianDigits(v)} باز شد.`
        : `نسخهٔ قدیمیِ ${toPersianDigits(v)} باز شد؛ ذخیرهٔ آن، نسخهٔ ${toPersianDigits(latest + 1)} می‌سازد و نسخه‌های قبلی دست‌نخورده می‌مانند.`);
    } catch { setMessage('ارتباط با سرور برقرار نشد.'); }
    finally { setBusy(false); }
  }
  async function decide(decision: 'approved_internal' | 'returned') {
    if (!saved) return;
    const note = decision === 'returned' ? window.prompt('علت بازگرداندن این نسخه را بنویسید:')?.trim() : null;
    if (decision === 'returned' && !note) return;
    if (decision === 'approved_internal' && !window.confirm(`نسخهٔ ${toPersianDigits(saved.version)} تأیید داخلی شود؟ این کار انتشار نیست و نسخه‌های بعدی تأیید را به ارث نمی‌برند.`)) return;
    setBusy(true);
    try {
      const r = await call(API, { method: 'POST', body: JSON.stringify({ action: 'decide', workbookId: saved.workbookId, version: saved.version, decision, note }) });
      if (r.status === 201) {
        setReviews(x => [...x, { version: saved.version, decision, note: note ?? null, reviewedAt: r.body.reviewedAt as string }]);
        setMessage(decision === 'approved_internal' ? `نسخهٔ ${toPersianDigits(saved.version)} تأیید داخلی شد؛ منتشر نشده است.` : `نسخهٔ ${toPersianDigits(saved.version)} با علت بازگردانده شد.`);
      } else setMessage(String(r.body.error ?? 'تصمیم ثبت نشد.'));
    } catch { setMessage('ارتباط با سرور برقرار نشد.'); }
    finally { setBusy(false); }
  }
  function startNew() {
    if (dirty && !window.confirm('تغییرات ذخیره‌نشدهٔ فعلی کنار گذاشته می‌شود. ادامه می‌دهید؟')) return;
    setWorkbook(emptyWorkbook()); setSaved(null); setVersions([]); setReviews([]); setDirty(false); setChecked(false); setMessage('');
  }
  const canDecide = server === 'ready' && !!saved && !dirty && saved.version === saved.latestVersion && !busy;
  const approvedHere = saved ? reviews.some(r => r.version === saved.version && r.decision === 'approved_internal') : false;
  function download(kind: 'json' | 'md') {
    const text = kind === 'json' ? JSON.stringify(workbook, null, 2) : workbookMarkdown(workbook);
    const url = URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `research-draft-${new Date().toISOString().replace(/[:.]/g, '-')}.${kind}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('فایل برای دریافت آماده شد؛ ذخیره‌شدن آن را در دستگاه بررسی کنید. دریافت فایل نسخهٔ سروری نمی‌سازد.');
  }
  async function importFile(selected: File | undefined) {
    if (!selected) return;
    try {
      if (selected.size > MAX_WORKBOOK_BYTES) throw new Error('فایل بیش از حد بزرگ است.');
      const imported = parseWorkbook(await selected.text());
      if (dirty && !window.confirm('متن فعلی جایگزین می‌شود. فایل فعلی را دریافت کرده‌اید؟')) return;
      setWorkbook(imported); setSaved(null); setVersions([]); setReviews([]); setDirty(true); setChecked(false); setMessage('پیش‌نویس بارگذاری شد؛ تأیید انسانی از فایل وارد نمی‌شود. ذخیره، کاربرگ تازه‌ای می‌سازد.');
    } catch { setMessage('فایل خوانده نشد؛ یک فایل JSON کاربرگ معتبر با حجم کمتر از ۸ مگابایت انتخاب کنید. متن فعلی حفظ شد.'); }
    finally { if (file.current) file.current.value = ''; }
  }
  function field(id: string, label: string, value: string, update: (value: string) => void, type = 'textarea') {
    const error = checked ? issues.find(i => i.field === id)?.message : undefined;
    return <div className="space-y-2" key={id}>
      <label htmlFor={id} className="block text-sm font-bold">{label}</label>
      {type === 'textarea'
        ? <textarea id={id} rows={3} maxLength={10000} className={inputClass} style={inputStyle} value={value} onChange={e => update(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
        : <input id={id} type={type} dir={type === 'url' || type === 'date' ? 'ltr' : undefined} maxLength={10000} className={inputClass} style={inputStyle} value={value} onChange={e => update(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />}
      {type === 'date' && isCalendarDate(value) && <p className="text-sm">{formatJalali(value + 'T12:00:00Z')}</p>}
      {error && <p id={`${id}-error`} className="text-sm" style={{ color: 'var(--text)' }}>{error}</p>}
    </div>;
  }
  const textField = (key: 'title' | 'question' | 'horizon' | 'interpretation' | 'counterEvidence' | 'portfolioImpact' | 'reviewOn', label: string, type?: string) =>
    field(key, label, workbook[key], value => change(w => ({ ...w, [key]: value })), type);

  return <div className="mx-auto max-w-6xl space-y-6" style={{ color: 'var(--text)' }}>
    <header className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-2)' }}>پژوهش ← شواهد ← سناریو ← بازبینی انسانی</p>
      <h1 className="font-display text-2xl font-extrabold">کاربرگ تحلیل</h1>
      <p className="max-w-3xl text-base leading-8">از یک پرسش مشخص شروع کنید؛ واقعیت را از تفسیر جدا کنید و برای هر سناریو شرط بازنگری بنویسید.</p>
      <div className="rounded-xl border p-4 text-sm leading-7" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        {server === 'ready'
          ? 'هر ذخیره یک نسخهٔ تازه است و نسخه‌های قبلی هرگز بازنویسی نمی‌شوند. تأیید داخلی به یک نسخهٔ مشخص بسته است و انتشار نیست. ارسال به مدل انجام نمی‌شود.'
          : server === 'checking'
            ? 'در حال بررسی ذخیرهٔ سروری…'
            : 'ذخیرهٔ سروری در دسترس نیست؛ پیش‌نویس فقط در همین صفحه است. پیش از خروج، فایل قابل ادامه را دریافت کنید. ارسال به مدل و انتشار انجام نمی‌شود.'}
      </div>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <section className="card space-y-4 p-5" aria-labelledby="research-question">
          <h2 id="research-question" className="text-lg font-bold">۱. پرسش و دامنه</h2>
          {textField('title', 'عنوان تحلیل', 'text')}
          <label className="block space-y-2"><span className="text-sm font-bold">حوزه</span>
            <select className={inputClass} style={inputStyle} value={workbook.domain} onChange={e => change(w => ({ ...w, domain: e.target.value as Workbook['domain'] }))}>
              {INTEL_DOMAINS.map(domain => <option key={domain} value={domain}>{DOMAIN_LABEL[domain]}</option>)}
            </select>
          </label>
          {textField('question', 'این تحلیل به کدام پرسش پاسخ می‌دهد؟')}
          {textField('horizon', 'افق تحلیل و دورهٔ مورد بررسی', 'text')}
        </section>
        <section className="card space-y-5 p-5" aria-labelledby="evidence">
          <h2 id="evidence" className="text-lg font-bold">۲. دفتر شواهد</h2>
          <p className="text-sm leading-7">هر گزاره را به منبع و دو تاریخ متصل کنید. تاریخ مشاهده با زمان انتشار منبع یکی نیست. کنترل نشانی، صحت محتوای منبع را اثبات نمی‌کند.</p>
          {workbook.evidence.map((e, index) => <fieldset key={e.id} className="min-w-0 space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--line)' }}>
            <legend className="px-2 text-sm font-bold">شاهد {toPersianDigits(index + 1)} · {e.id}</legend>
            {field(`evidence-${e.id}`, 'گزارهٔ قابل استناد', e.statement, value => change(w => ({ ...w, evidence: w.evidence.map(x => x.id === e.id ? { ...x, statement: value } : x) })))}
            {field(`url-${e.id}`, 'نشانی منبع', e.sourceUrl, value => change(w => ({ ...w, evidence: w.evidence.map(x => x.id === e.id ? { ...x, sourceUrl: value } : x) })), 'url')}
            <div className="grid gap-3 sm:grid-cols-2">
              {field(`observed-${e.id}`, 'تاریخ مشاهده (میلادی)', e.observedOn, value => change(w => ({ ...w, evidence: w.evidence.map(x => x.id === e.id ? { ...x, observedOn: value } : x) })), 'date')}
              {field(`published-${e.id}`, 'تاریخ انتشار منبع (میلادی)', e.publishedOn, value => change(w => ({ ...w, evidence: w.evidence.map(x => x.id === e.id ? { ...x, publishedOn: value } : x) })), 'date')}
            </div>
            <button type="button" className="btn btn-ghost min-h-11" onClick={() => { if (window.confirm('این شاهد از پیش‌نویس حذف شود؟')) change(w => ({ ...w, evidence: w.evidence.filter(x => x.id !== e.id) })); }}><Trash2 size={16} aria-hidden="true" /> حذف شاهد {toPersianDigits(index + 1)}</button>
          </fieldset>)}
          <button type="button" className="btn btn-secondary min-h-11" disabled={workbook.evidence.length >= 30} onClick={() => change(w => ({ ...w, evidence: [...w.evidence, { id: crypto.randomUUID(), statement: '', sourceUrl: '', observedOn: '', publishedOn: '' }] }))}><Plus size={16} aria-hidden="true" /> افزودن شاهد</button>
        </section>
        <section className="card space-y-4 p-5" aria-labelledby="causal"><h2 id="causal" className="text-lg font-bold">۳. استدلال و نقد</h2>
          {textField('interpretation', 'تفسیر: رخداد چگونه و از چه مسیری اثر می‌گذارد؟ به شناسهٔ شاهد ارجاع دهید.')}
          {textField('counterEvidence', 'شاهد مخالف، توضیح جایگزین و آنچه هنوز نمی‌دانیم')}
        </section>
        <section className="space-y-4" aria-labelledby="scenarios"><h2 id="scenarios" className="text-lg font-bold">۴. سه سناریو</h2>
          {SCENARIO_KEYS.map(key => <fieldset key={key} className="card min-w-0 space-y-4 p-5"><legend className="px-2 text-base font-bold">{SCENARIO_NAMES[key]}</legend>
            {(['assumptions', 'mechanism', 'invalidation'] as const).map((part, i) => field(`${key}-${part}`, ['فروض و محرک‌ها', 'مسیر اثر احتمالی', 'چه مشاهده‌ای این سناریو را باطل می‌کند؟'][i], workbook.scenarios[key][part], value => change(w => ({ ...w, scenarios: { ...w.scenarios, [key]: { ...w.scenarios[key], [part]: value } } }))))}
          </fieldset>)}
        </section>
        <section className="card space-y-4 p-5" aria-labelledby="impact"><h2 id="impact" className="text-lg font-bold">۵. اثر و بازنگری</h2>
          {textField('portfolioImpact', 'اثر احتمالی بر دارایی‌ها، ریسک‌ها و محدودیت استدلال')}
          {textField('reviewOn', 'تاریخ بازنگری (میلادی)', 'date')}
        </section>
      </div>
      <aside className="card space-y-4 p-5 lg:sticky lg:top-6" aria-label="بررسی و دریافت پیش‌نویس">
        <h2 className="text-lg font-bold">پروندهٔ پژوهش</h2>
        <p className="text-sm leading-7">بررسی ساختار، جایگزین بررسی صحت منبع یا قضاوت تحلیلی نیست.</p>
        {saved && <p className="text-sm leading-7" aria-live="polite">
          نسخهٔ {toPersianDigits(saved.version)} از {toPersianDigits(saved.latestVersion)}{dirty ? ' · تغییرات ذخیره‌نشده' : ''}{approvedHere ? ' · تأیید داخلی شده' : ''}
        </p>}
        {server === 'ready' && <button type="button" className="btn btn-primary w-full min-h-11" disabled={busy || (!dirty && !!saved)} onClick={() => void saveToServer()}><Save size={16} aria-hidden="true" /> {saved ? `ذخیره به‌عنوان نسخهٔ ${toPersianDigits(saved.latestVersion + 1)}` : 'ذخیرهٔ نسخهٔ ۱'}</button>}
        <button type="button" className="btn btn-primary w-full min-h-11" onClick={() => { setChecked(true); setMessage(issues.length ? `${toPersianDigits(issues.length)} مورد نیازمند تکمیل است.` : 'ساختار کامل است؛ صحت شواهد و نتیجه هنوز بازبینی انسانی می‌خواهد.'); }}><ClipboardCheck size={16} aria-hidden="true" /> بررسی ساختار</button>
        {checked && issues.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">{issues.map((issue, i) => <li key={`${issue.field}-${i}`}><a className="underline" href={`#${issue.field}`}>{issue.message}</a></li>)}</ul>}
        <button type="button" className="btn btn-secondary min-h-11 w-full" onClick={() => download('json')}><Download size={16} aria-hidden="true" /> دریافت فایل قابل ادامه</button>
        <button type="button" className="btn btn-secondary min-h-11 w-full" onClick={() => download('md')}>دریافت متن تحلیل</button>
        <button type="button" className="btn btn-ghost min-h-11 w-full" onClick={() => file.current?.click()}><FileUp size={16} aria-hidden="true" /> ادامه از فایل</button>
        <input ref={file} type="file" accept=".json,application/json" className="sr-only" aria-label="فایل کاربرگ" onChange={e => void importFile(e.target.files?.[0])} />
        {server === 'ready' && saved && <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-sm font-bold">بازبینی انسانی</h3>
          <button type="button" className="btn btn-secondary min-h-11 w-full" disabled={!canDecide || issues.length > 0 || approvedHere} onClick={() => void decide('approved_internal')}><CheckCircle2 size={16} aria-hidden="true" /> تأیید داخلی نسخهٔ {toPersianDigits(saved.version)}</button>
          <button type="button" className="btn btn-ghost min-h-11 w-full" disabled={!canDecide} onClick={() => void decide('returned')}><Undo2 size={16} aria-hidden="true" /> بازگرداندن با علت</button>
          {!canDecide && <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>تصمیم فقط روی آخرین نسخهٔ ذخیره‌شده و بدون تغییرِ ذخیره‌نشده ممکن است.</p>}
          {canDecide && issues.length > 0 && <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>تا {toPersianDigits(issues.length)} مورد چک‌لیست باز است، تأیید ممکن نیست.</p>}
          {reviews.length > 0 && <ul className="space-y-1 text-sm leading-7">{reviews.map((r, i) => <li key={i}>
            نسخهٔ {r.version === null ? '؟' : toPersianDigits(r.version)}: {r.decision === 'approved_internal' ? 'تأیید داخلی' : 'بازگردانده'} · {formatJalali(r.reviewedAt)}{r.note ? ` — ${r.note}` : ''}
          </li>)}</ul>}
          {versions.length > 1 && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">نسخه‌های قبلی</summary>
            <ul className="space-y-1">{versions.map(v => <li key={v.version}><button type="button" className="min-h-11 underline" disabled={busy || v.version === saved.version} onClick={() => void openFromServer(saved.workbookId, v.version)}>نسخهٔ {toPersianDigits(v.version)} · {formatJalali(v.savedAt)}</button></li>)}</ul>
          </details>}
        </div>}
        <p role="status" className="text-sm leading-7">{message}</p>
        {server === 'ready' && <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">کاربرگ‌های ذخیره‌شده</h3>
            <button type="button" className="btn btn-ghost min-h-11" onClick={startNew}><Plus size={16} aria-hidden="true" /> تازه</button></div>
          {list.length === 0
            ? <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>هنوز کاربرگی ذخیره نشده است.</p>
            : <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">{list.map(item => <li key={item.workbookId}>
                <button type="button" className="flex min-h-11 w-full items-center gap-2 text-start underline" disabled={busy} onClick={() => void openFromServer(item.workbookId, null)}>
                  <FolderOpen size={16} aria-hidden="true" className="shrink-0" /><span className="min-w-0 truncate">{item.title}</span>
                  <span className="shrink-0" style={{ color: 'var(--text-2)' }}>نسخهٔ {toPersianDigits(item.version)}</span>
                </button></li>)}</ul>}
        </div>}
        <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>تأیید داخلی کاربرگ، انتشار عمومی نیست و خودکار وارد گردش هوشمندی نمی‌شود.</p>
        <Link href="/admin/intelligence" className="inline-flex min-h-11 items-center underline">گردش هوشمندی</Link>
      </aside>
    </div>
  </div>;
}
