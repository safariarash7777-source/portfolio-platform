'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import PublicationWorkbench, { publicationApi, type PublicationOverview } from './PublicationWorkbench';
import P07AudiencePreview from './P07AudiencePreview';
import { emptyWorkbook, type ResearchWorkbook } from '@/lib/intelligence/research-workbook';
import { manualIntakeIssues, type ManualIntake } from '@/lib/intelligence/p07-preparation';
import { mapManualClaim, p07PreparationExport, p07PublicationPreparationIssue, p07OverviewUsable, type P07PreparationBinding } from '@/lib/intelligence/p07-workflow';
import type { P07Transport } from '@/lib/intelligence/p07-workflow-fixture';
import type { PublicationRow } from '@/lib/intelligence/publication';
import { toPersianDigits } from '@/lib/format';

export interface P07ResearchRendererProps {
  initialWorkbook: ResearchWorkbook; transport: P07Transport;
  onWorkbookChange: (workbook: ResearchWorkbook) => void; preparationGate: string | null;
}
const control = 'w-full min-h-11 rounded-lg border px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const style = { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--line)' };
const WB_API = '/api/admin/intelligence/workbooks';
const PUB_API = '/api/admin/intelligence/publications';
const initialIntake: ManualIntake = { kind: 'text', text: '', transcriptConfirmed: false, claims: [], ambiguities: [] };
const issueLabel = (code: string) => code === 'pending_manual_entry' ? 'گزاره یا ابهام در حال ویرایش را ابتدا ثبت کنید.' : code === 'transcript_unconfirmed' ? 'رونویسی ویس تأیید نشده است.' : code === 'claims_missing' ? 'حداقل یک گزاره ثبت کنید.' : code.startsWith('ambiguity_unresolved') ? 'ابهام ثبت‌شده هنوز رفع نشده است.' : 'گزاره باید شاهد مرتبط موجود داشته باشد.';
interface ResearchDecisionPayload { action?: string; decision?: string; workbookId?: string; version?: number }

/** Embedded workflow; host owns the route/admin shell. Sample transports must be supplied explicitly. */
export default function P07ManualDesk({ transport = publicationApi, sample = false, initialWorkbook,
  renderResearch, onRefreshToday }: { transport?: P07Transport; sample?: boolean; initialWorkbook?: ResearchWorkbook;
    renderResearch?: (props: P07ResearchRendererProps) => ReactNode; onRefreshToday?: () => void }) {
  const [intake, setIntake] = useState<ManualIntake>(initialIntake);
  const [workbook, setWorkbook] = useState(() => initialWorkbook ?? emptyWorkbook());
  const [seed, setSeed] = useState<ResearchWorkbook | null>(null), [seedVersion, setSeedVersion] = useState(0);
  const [tab, setTab] = useState<'intake' | 'research' | 'publication'>('intake');
  const [message, setMessage] = useState(''), [today, setToday] = useState<PublicationOverview | null>(null), [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PublicationRow | null>(null), [previewAcknowledged, setPreviewAcknowledged] = useState(false);
  const [savedDraft, setSavedDraft] = useState<{ id: string; version: number } | null>(null);
  const [researchRefresh, setResearchRefresh] = useState(0);
  const [claimText, setClaimText] = useState(''), [claimKind, setClaimKind] = useState<ManualIntake['claims'][number]['kind']>('observation');
  const [claimEvidence, setClaimEvidence] = useState('e1'), [ambiguityText, setAmbiguityText] = useState('');
  const dirty = useRef(false), busy = useRef(false), latestOverview = useRef<PublicationOverview | null>(null);
  const gate = useRef<string | null>(null), previewAck = useRef<string | null>(null);
  const binding = useRef<P07PreparationBinding | null>(null), signature = useRef(''), preparationIssues = useRef<string[]>([]);
  const pendingBinding = useRef<{ workbookId: string; version: number; signature: string } | null>(null);
  const issues = intake.text.trim() ? manualIntakeIssues(intake, workbook) : ['claims_missing'];
  if (claimText.trim() || ambiguityText.trim()) issues.push('pending_manual_entry');
  gate.current = issues.length ? issueLabel(issues[0]) : null;
  preparationIssues.current = issues; signature.current = JSON.stringify({ workbook, intake });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await transport(PUB_API);
      if (result.status !== 200 || !p07OverviewUsable(result.body)) throw new Error('صف امروز قابل دریافت نیست؛ خالی فرض نشده است.');
      const overview = result.body as unknown as PublicationOverview;
      latestOverview.current = overview; setToday(overview); setMessage('');
      const pending = pendingBinding.current;
      const approved = pending && overview.workbooks.find(w => w.workbookId === pending.workbookId && w.version === pending.version && w.approved);
      if (approved && pending?.signature === signature.current) { binding.current = { workbookVersionId: approved.id, signature: pending.signature }; pendingBinding.current = null; }
    } catch (error) { setToday(null); setMessage(error instanceof Error ? error.message : 'صف امروز در دسترس نیست.'); }
    finally { setLoading(false); }
  }, [transport]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    const guard = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!dirty.current || !anchor || anchor.hasAttribute('download') || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm('پرونده آماده‌سازی ذخیرهٔ سروری ندارد؛ پیش از خروج آن را دریافت کرده‌اید؟')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, []);
  const changedWorkbook = useCallback((next: ResearchWorkbook) => { setWorkbook(next); }, []);
  const researchTransport = useCallback<P07Transport>(async (path, init) => {
    let decision: ResearchDecisionPayload | null = null;
    const reviewedSignature = signature.current;
    if (path === WB_API && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as ResearchDecisionPayload;
      decision = payload; binding.current = null; pendingBinding.current = null; previewAck.current = null; setPreviewAcknowledged(false);
      if (payload.action === 'decide' && payload.decision === 'approved_internal' && gate.current)
        return { status: 422, body: { error: gate.current } };
    }
    const result = await transport(path, init);
    if (init?.method === 'POST' && result.status === 201) {
      setResearchRefresh(value => value + 1);
      if (decision?.decision === 'approved_internal') {
        if (decision.workbookId && typeof decision.version === 'number') pendingBinding.current = { workbookId: decision.workbookId, version: decision.version, signature: reviewedSignature };
        try {
          const response = await transport(PUB_API);
          if (response.status === 200 && p07OverviewUsable(response.body)) {
            const overview = response.body as unknown as PublicationOverview;
            latestOverview.current = overview; setToday(overview);
            const approved = overview.workbooks.find(w => w.workbookId === decision?.workbookId && w.version === decision?.version && w.approved);
            if (approved && signature.current === reviewedSignature) { binding.current = { workbookVersionId: approved.id, signature: reviewedSignature }; pendingBinding.current = null; }
          }
        } catch { setMessage('تأیید در سرور ثبت شد، اما تطبیق نسخه قابل دریافت نیست؛ صف را دوباره دریافت کنید.'); }
      } else void refresh();
    }
    return result;
  }, [transport, refresh]);
  const publicationTransport = useCallback<P07Transport>(async (path, init) => {
    void researchRefresh; // Changing the stable transport refreshes the existing workbench without remounting its draft.
    let action: string | undefined;
    if (path === PUB_API && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { action: string; versionId?: string };
      action = payload.action;
      if (action === 'ready' || action === 'publish') {
        if (gate.current) return { status: 422, body: { error: gate.current } };
        const row = latestOverview.current?.items.find(item => item.id === payload.versionId);
        if (!row) return { status: 409, body: { error: 'نسخه را دوباره دریافت و پیش‌نمایش را بررسی کنید.' } };
        const preparationIssue = p07PublicationPreparationIssue(preparationIssues.current, row.workbookVersionId, binding.current, signature.current);
        if (preparationIssue) return { status: 422, body: { error: preparationIssue } };
        if (previewAck.current !== row.id) {
          setPreview(row); setPreviewAcknowledged(false); previewAck.current = null;
          return { status: 422, body: { error: 'پیش‌نمایش همین نسخه را پایین فرم بررسی و تأیید کنید، سپس اقدام را تکرار کنید.' } };
        }
      }
    }
    const result = await transport(path, init);
    if (path === PUB_API && !init?.method && result.status === 200) {
      if (!p07OverviewUsable(result.body)) { latestOverview.current = null; setToday(null); return { status: 503, body: { error: 'ساختار دفتر انتشار قابل دریافت نیست؛ متن حفظ شد.', unavailable: true } }; }
      const overview = result.body as unknown as PublicationOverview;
      latestOverview.current = overview; setToday(overview);
      setPreview(previous => previous ? overview.items.find(row => row.id === previous.id) ?? null : null);
    }
    if (action === 'save' && result.status === 201) { setPreview(null); setPreviewAcknowledged(false); previewAck.current = null; }
    return result;
  }, [transport, researchRefresh]);
  function changeIntake(update: Partial<ManualIntake>) {
    setIntake(previous => ({ ...previous, ...update })); dirty.current = true; previewAck.current = null; setPreviewAcknowledged(false);
  }
  function downloadPreparation() {
    try {
      if (claimText.trim() || ambiguityText.trim()) throw new Error('گزاره یا ابهام در حال ویرایش را ابتدا ثبت کنید، سپس پرونده را دریافت کنید.');
      const blob = new Blob([JSON.stringify(p07PreparationExport(intake, workbook), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'p07-manual-preparation.json'; anchor.click(); URL.revokeObjectURL(url);
      dirty.current = false; setMessage('پرونده آماده‌سازی دریافت شد؛ روی سرور ذخیره نشده است.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ورودی دستی کامل نیست.'); }
  }
  async function saveDraft() {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await transport(WB_API, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: savedDraft?.id ?? null, baseVersion: savedDraft?.version ?? 0, workbook }) });
      if (result.status !== 201) throw new Error(String(result.body.error ?? 'کاربرگ ذخیره نشد.'));
      setSavedDraft({ id: String(result.body.workbookId), version: Number(result.body.version) });
      await refresh(); onRefreshToday?.();
      setMessage(`کاربرگ نسخه ${toPersianDigits(String(result.body.version))} ذخیره شد؛ اصل ورودی و ابهام‌ها هنوز پروندهٔ آماده‌سازی محلی‌اند.`);
    } catch (error) { setMessage(`${error instanceof Error ? error.message : 'خطای ارتباط'} متن شما حفظ شد.`); }
    finally { busy.current = false; }
  }
  function prepareResearch() {
    if (seed && !window.confirm('ویرایشگر فعلی جایگزین شود؟ ابتدا تغییرهای کاربرگ را ذخیره کنید.')) return;
    setSeed(structuredClone(workbook)); setSeedVersion(value => value + 1); setTab('research');
  }
  const nextToday = today?.workbooks.filter(w => !w.approved);
  return <section className="space-y-5" aria-labelledby="p07-desk-title" style={{ color: 'var(--text)' }}>
    <header className="card p-5 space-y-3"><h2 id="p07-desk-title" className="font-display text-2xl font-bold">میز دستی آرش</h2>
      <p className="leading-8">اصل ورودی را بخوانید، گزاره را به شاهد وصل کنید و متن مخاطب را جدا بررسی کنید.</p>
      {sample ? <p className="font-bold">نمونهٔ نمایشی؛ همه داده‌ها ساختگی‌اند، به سرور یا اعضای واقعی متصل نیستند.</p> : null}
      <p className="text-sm leading-7">اصل ورودی، ارتباط گزاره و وضعیت ابهام فعلاً در آماده‌سازی این صفحه‌اند؛ پیش از خروج پرونده را دریافت کنید. این داده‌ها روی سرور ذخیره نمی‌شوند.</p>
      <nav className="flex flex-wrap gap-3" aria-label="مراحل میز آرش">{(['intake', 'research', 'publication'] as const).map((item, index) => <button key={item} className="btn btn-secondary min-h-11" aria-pressed={tab === item} onClick={() => setTab(item)}>{['ورودی و شاهد', 'کاربرگ و بازبینی', 'متن مخاطب و انتشار'][index]}</button>)}</nav>
    </header>
    <section className="card p-5 space-y-3" aria-label="صف امروز"><h3 className="font-bold text-lg">امروز و اقدام بعدی</h3>
      <button className="btn btn-ghost min-h-11" disabled={loading} onClick={() => void refresh()}>دریافت دوباره صف</button>
      {loading ? <p>در حال دریافت…</p> : today ? <><p>{today.workbooksState === 'available' ? `${toPersianDigits(nextToday?.length ?? 0)} پژوهش نیازمند بازبینی در فهرست اخیر` : 'وضعیت پژوهش قابل دریافت نیست.'}</p><p>{toPersianDigits(today.items.filter(p => p.state === 'ready').length)} نسخه آماده انتشار در فهرست اخیر</p></> : <p>صف در دسترس نیست؛ خالی فرض نشده است.</p>}
      <p role="status" className="leading-7">{message}</p>
    </section>
    <div hidden={tab !== 'intake'} className="space-y-4" onChange={() => { dirty.current = true; }}>
      <section className="card p-5 space-y-4"><h3 className="font-bold">اصل ورودی دستی</h3>
        <label className="block space-y-2">نوع ورودی<select className={control} style={style} value={intake.kind} onChange={event => changeIntake({ kind: event.target.value as ManualIntake['kind'], transcriptConfirmed: false })}><option value="text">متن</option><option value="voice_manual">رونویسی دستی ویس</option></select></label>
        <label className="block space-y-2">متن اصلی / رونویسی<textarea className={control} style={style} rows={5} maxLength={20000} value={intake.text} onChange={event => changeIntake({ text: event.target.value, transcriptConfirmed: false })}/></label>
        {intake.kind === 'voice_manual' ? <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={intake.transcriptConfirmed} onChange={event => changeIntake({ transcriptConfirmed: event.target.checked })}/>رونویسی را با اصل ویس بررسی کرده‌ام.</label> : null}
        <button className="btn btn-secondary min-h-11" onClick={downloadPreparation}>دریافت پرونده آماده‌سازی</button>
      </section>
      <section className="card p-5 space-y-4"><h3 className="font-bold">گزاره، شاهد و انتقال دستی</h3>
        <label className="block space-y-2">عنوان پژوهش<input className={control} style={style} maxLength={300} value={workbook.title} onChange={event => { dirty.current = true; setWorkbook(w => ({ ...w, title: event.target.value })); }}/></label>
        {workbook.evidence.map(evidence => <fieldset key={evidence.id} className="space-y-3 border rounded-lg p-3" style={{ borderColor: 'var(--line)' }}><legend>شاهد {evidence.id}</legend>{(['statement', 'sourceUrl', 'observedOn', 'publishedOn'] as const).map((part, index) => <label key={part} className="block space-y-2">{['متن شاهد', 'نشانی منبع', 'تاریخ مشاهده میلادی', 'تاریخ انتشار میلادی'][index]}<input className={control} style={style} type={part.endsWith('On') ? 'date' : 'text'} value={evidence[part]} maxLength={part === 'statement' ? 4000 : 2000} onChange={event => setWorkbook(w => ({ ...w, evidence: w.evidence.map(e => e.id === evidence.id ? { ...e, [part]: event.target.value } : e) }))}/></label>)}</fieldset>)}
        <button className="btn btn-ghost min-h-11" disabled={workbook.evidence.length >= 30} onClick={() => setWorkbook(w => ({ ...w, evidence: [...w.evidence, { id: crypto.randomUUID(), statement: '', sourceUrl: '', observedOn: '', publishedOn: '' }] }))}>افزودن شاهد</button>
        <label className="block space-y-2">گزاره<textarea className={control} style={style} rows={3} maxLength={4000} value={claimText} onChange={event => setClaimText(event.target.value)}/></label>
        <label className="block space-y-2">نوع گزاره<select className={control} style={style} value={claimKind} onChange={event => setClaimKind(event.target.value as typeof claimKind)}><option value="observation">مشاهده</option><option value="interpretation">تفسیر</option><option value="scenario">سناریو</option></select></label>
        <label className="block space-y-2">شاهد مرتبط<select className={control} style={style} value={claimEvidence} onChange={event => setClaimEvidence(event.target.value)}>{workbook.evidence.map(e => <option key={e.id} value={e.id}>{e.id} · {e.statement}</option>)}</select></label>
        <button className="btn btn-secondary min-h-11" disabled={!claimText.trim() || intake.claims.length >= 100} onClick={() => { changeIntake({ claims: [...intake.claims, { id: crypto.randomUUID(), kind: claimKind, text: claimText.trim(), evidenceIds: claimEvidence ? [claimEvidence] : [] }] }); setClaimText(''); }}>ثبت گزاره در آماده‌سازی</button>
        <ul className="space-y-3">{intake.claims.map(claim => <li key={claim.id} className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--line)' }}><p>{claim.text}</p><p className="text-sm">شاهد: {claim.evidenceIds.join('، ')}</p><button className="btn btn-ghost min-h-11" onClick={() => { try { setWorkbook(mapManualClaim(workbook, intake, claim.id, claim.evidenceIds[0])); setMessage('فقط متن گزاره به فیلد مناسب کاربرگ منتقل شد؛ metadata منتقل نشد.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'انتقال کامل نیست.'); } }}>انتقال دستی گزاره به کاربرگ</button></li>)}</ul>
      </section>
      <section className="card p-5 space-y-4"><h3 className="font-bold">ابهام‌ها و بازبینی</h3><label className="block space-y-2">ابهام نیازمند بررسی<textarea className={control} style={style} maxLength={4000} rows={2} value={ambiguityText} onChange={event => setAmbiguityText(event.target.value)}/></label>
        <button className="btn btn-secondary min-h-11" disabled={!ambiguityText.trim() || intake.ambiguities.length >= 100} onClick={() => { changeIntake({ ambiguities: [...intake.ambiguities, { id: crypto.randomUUID(), text: ambiguityText.trim(), resolved: false }] }); setAmbiguityText(''); }}>ثبت ابهام</button>
        {intake.ambiguities.map(item => <label key={item.id} className="flex gap-3 min-h-11 items-center"><input type="checkbox" checked={item.resolved} onChange={event => changeIntake({ ambiguities: intake.ambiguities.map(a => a.id === item.id ? { ...a, resolved: event.target.checked } : a) })}/>{item.text} · بررسی و رفع شده</label>)}
        <ul className="space-y-2" aria-label="موارد باز">{issues.map(code => <li key={code}>{issueLabel(code)}</li>)}</ul>
        <button className="btn btn-primary min-h-11" onClick={prepareResearch}>ادامه در کاربرگ موجود</button>
        {!renderResearch ? <button className="btn btn-secondary min-h-11" disabled={!workbook.title.trim()} onClick={() => void saveDraft()}>ذخیره نسخهٔ پیش‌نویس کاربرگ</button> : null}
      </section>
    </div>
    <div hidden={tab !== 'research'} className="space-y-4">{seed && renderResearch ? <div key={seedVersion}>{renderResearch({ initialWorkbook: seed, transport: researchTransport, onWorkbookChange: changedWorkbook, preparationGate: gate.current })}</div> : <section className="card p-5 space-y-3"><p>ویرایش و بازبینی از کاربرگ موجود انجام می‌شود؛ ابتدا «ادامه در کاربرگ موجود» را انتخاب کنید.</p>{!sample ? <Link className="btn btn-secondary min-h-11" href={savedDraft ? `/admin/research?workbook=${savedDraft.id}` : '/admin/research'}>بازکردن ویرایشگر پژوهش</Link> : <p>اتصال ویرایشگر نمونه باید توسط میزبان دارای transport ساختگی فراهم شود.</p>}</section>}</div>
    <div hidden={tab !== 'publication'} className="space-y-4"><PublicationWorkbench transport={publicationTransport} sample={sample}/>
      {preview ? <><P07AudiencePreview draft={preview}/><p>نسخه {toPersianDigits(preview.version)} · {preview.state === 'withdrawn' ? 'متوقف‌شده' : 'پیش‌نمایش برای بازبینی'}</p><label className="card p-4 flex gap-3 min-h-11 items-center"><input type="checkbox" checked={previewAcknowledged} onChange={event => { setPreviewAcknowledged(event.target.checked); previewAck.current = event.target.checked ? preview.id : null; }}/>پیش‌نمایش همین نسخه را بررسی کرده‌ام.</label></> : <p>پس از ذخیره، آماده‌سازی همین نسخه ابتدا پیش‌نمایش را برای بازبینی باز می‌کند.</p>}
      <p className="text-sm">بازبینی آماده‌سازی در این صفحه کنترل UX است؛ سرور موجود همچنان نسخه، تأیید پژوهش و مجوز را بررسی می‌کند. ثبت ساختاریافته ابهام و زمان اعتبار در سرور هنوز اجرا نشده است.</p>
    </div>
  </section>;
}
