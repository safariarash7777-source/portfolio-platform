'use client';
import { useState } from 'react';
import type { ManualIntake } from '@/lib/intelligence/manual-intake';
import type { ResearchEvidence } from '@/lib/intelligence/research-workbook';

const empty: ManualIntake = { kind: 'text', text: '', transcriptConfirmed: false, claims: [], ambiguities: [] };
const control = 'w-full min-h-11 rounded-lg border px-3 py-2 text-base';
const style = { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--line)' };

/** Fields of the existing private workbook, not a separate composer or publication. */
export default function ResearchPreparationFields({ value, evidence, onChange, onPendingChange }: {
  value?: ManualIntake; evidence: ResearchEvidence[]; onChange: (next: ManualIntake) => void; onPendingChange: (pending: boolean) => void;
}) {
  const intake = value ?? empty;
  const [claimText, setClaimText] = useState(''), [claimKind, setClaimKind] = useState<ManualIntake['claims'][number]['kind']>('observation');
  const [evidenceId, setEvidenceId] = useState(''), [ambiguity, setAmbiguity] = useState('');
  const update = (patch: Partial<ManualIntake>) => onChange({ ...intake, ...patch });
  return <details className="card space-y-4 p-5" aria-label="آماده‌سازی خصوصی پژوهش">
    <summary className="cursor-pointer min-h-11 font-bold">اصل ورودی، گزاره و ابهام خصوصی</summary>
    <p className="text-sm leading-7">این اطلاعات همراه نسخهٔ کاربرگ و فقط در پژوهش ادمین نگهداری می‌شوند؛ ذخیره، تأیید یا انتشار نیست. متن مخاطب جدا بازبینی می‌شود.</p>
    <label className="block space-y-2">نوع ورودی<select className={control} style={style} value={intake.kind} onChange={event => update({ kind: event.target.value as ManualIntake['kind'], transcriptConfirmed: false })}><option value="text">متن</option><option value="voice_manual">رونویسی دستی ویس</option></select></label>
    <label className="block space-y-2">اصل ورودی / رونویسی<textarea className={control} style={style} rows={5} maxLength={20000} value={intake.text} onChange={event => update({ text: event.target.value, transcriptConfirmed: false })}/></label>
    {intake.kind === 'voice_manual' && <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={intake.transcriptConfirmed} onChange={event => update({ transcriptConfirmed: event.target.checked })}/>رونویسی را با اصل ویس بررسی کرده‌ام.</label>}
    <label className="block space-y-2">گزاره<textarea className={control} style={style} rows={3} maxLength={4000} value={claimText} onChange={event => { setClaimText(event.target.value); onPendingChange(!!event.target.value.trim() || !!ambiguity.trim()); }}/></label>
    <label className="block space-y-2">نوع گزاره<select className={control} style={style} value={claimKind} onChange={event => setClaimKind(event.target.value as typeof claimKind)}><option value="observation">مشاهده</option><option value="interpretation">تفسیر</option><option value="scenario">سناریو</option></select></label>
    <label className="block space-y-2">شاهد مرتبط<select className={control} style={style} value={evidenceId} onChange={event => setEvidenceId(event.target.value)}><option value="">شاهد را انتخاب کنید</option>{evidence.map(item => <option key={item.id} value={item.id}>{item.id} · {item.statement}</option>)}</select></label>
    <button type="button" className="btn btn-secondary min-h-11" disabled={!claimText.trim() || !evidence.some(item => item.id === evidenceId) || intake.claims.length >= 100} onClick={() => { update({ claims: [...intake.claims, { id: crypto.randomUUID(), kind: claimKind, text: claimText.trim(), evidenceIds: [evidenceId] }] }); setClaimText(''); onPendingChange(!!ambiguity.trim()); }}>ثبت گزاره در آماده‌سازی</button>
    <ul className="space-y-2">{intake.claims.map(item => <li key={item.id}>{item.text} · شاهد: {item.evidenceIds.join('، ')}</li>)}</ul>
    <label className="block space-y-2">ابهام نیازمند بررسی<textarea className={control} style={style} rows={2} maxLength={4000} value={ambiguity} onChange={event => { setAmbiguity(event.target.value); onPendingChange(!!event.target.value.trim() || !!claimText.trim()); }}/></label>
    <button type="button" className="btn btn-secondary min-h-11" disabled={!ambiguity.trim() || intake.ambiguities.length >= 100} onClick={() => { update({ ambiguities: [...intake.ambiguities, { id: crypto.randomUUID(), text: ambiguity.trim(), resolved: false }] }); setAmbiguity(''); onPendingChange(!!claimText.trim()); }}>ثبت ابهام</button>
    {intake.ambiguities.map(item => <label key={item.id} className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={item.resolved} onChange={event => update({ ambiguities: intake.ambiguities.map(current => current.id === item.id ? { ...current, resolved: event.target.checked } : current) })}/>{item.text} · بررسی و رفع شده</label>)}
  </details>;
}
