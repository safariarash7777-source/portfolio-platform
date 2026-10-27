import React from 'react';
import type { ResearchDraftsView } from '@/lib/intelligence/research-drafts-view';
import { formatJalali, formatTehranClock, toPersianDigits } from '@/lib/format';

const stamp = (value: string | null) => value ? `${formatJalali(value)}، ${formatTehranClock(value)} تهران` : 'نامعلوم';
const scenarioNames = { base: 'پایه', upside: 'مساعد', downside: 'نامساعد' };

/** Read-only projection of the existing validated, admin-scoped draft reader. */
export default function ResearchCaseFiles({ view }: { view: ResearchDraftsView }) {
  return <section aria-labelledby="research-case-files" className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-6" style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--text)' }}>
    <h1 id="research-case-files" className="text-xl font-bold">پرونده‌های پژوهش موجود</h1>
    <p>پیش‌نویس‌های ذخیره‌شده برای بررسی آرش؛ نمایش این متن به معنی صحت مالی، تأیید یا انتشار نیست.</p>
    <p className="text-sm" style={{ color: 'var(--text-2)' }}>این فهرست حداکثر {toPersianDigits(20)} خروجی آخر مخزن را نشان می‌دهد. وجود خروجی تاریخی، وضعیت اجرای فعلی یا آماده‌بودن نقش‌های پژوهش را ثابت نمی‌کند.</p>
    {view.unavailableReason ? <p role="status">{view.unavailableReason}</p> : !view.drafts.length ? <p>در این خواندن، پیش‌نویس قابل نمایش وجود ندارد.</p> : null}
    {view.invalidCount > 0 && <p role="status">{toPersianDigits(view.invalidCount)} رکورد به دلیل ساختار نامعتبر نمایش داده نشد.</p>}
    {view.drafts.map(row => {
      const symbols = [...new Set(row.provenance.map(source => source.symbol))];
      return <details key={row.id} className="min-w-0 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <summary className="min-h-11 cursor-pointer break-words py-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          {symbols.join('، ')}{symbols.length > 1 ? ' · چندنمادی' : ''} · پیش‌نویس · {stamp(row.createdAt)}
        </summary>
        <div className="space-y-4 break-words pt-4">
          <p className="text-sm">شناسهٔ پیش‌نویس: <bdi className="break-all" dir="ltr">{row.id}</bdi></p>
          <p>{row.body.summary}</p>
          <p>این رکورد شمارهٔ نسخهٔ کاربرگ ندارد؛ مبنای مقایسهٔ نسخه در این نما موجود نیست.</p>
          <h2 className="font-bold">گزاره‌ها و شواهد</h2>
          <ul className="space-y-3">{row.body.claims.map((claim, index) => <li key={index}>
            <strong>{claim.kind === 'FACT' ? 'گزارهٔ توصیفی مدل؛ نیازمند تطبیق' : 'استنباط مدل'}: </strong>{claim.text}
            <p>شاهد: {claim.evidence.join('، ')}</p>
          </li>)}</ul>
          <h2 className="font-bold">سناریوها</h2>
          {row.body.scenarios.map(scenario => <div key={scenario.label}>
            <h3 className="font-bold">{scenarioNames[scenario.label]}</h3><p>{scenario.text}</p>
            <p>شرط ابطال: {scenario.invalidation}</p><p>شاهد: {scenario.evidence.join('، ')}</p>
          </div>)}
          <h2 className="font-bold">محدودیت‌ها</h2>
          <ul>{row.body.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul>
          <h2 className="font-bold">منبع و کیفیت</h2>
          {row.provenance.map(source => <div key={source.evidence} className="space-y-1 rounded border p-3" style={{ borderColor: 'var(--line)' }}>
            <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{source.symbol} · {source.evidence} · بازکردن منبع</a>
            <p>شناسهٔ رکورد منبع: <bdi className="break-all" dir="ltr">{source.reportId}</bdi></p>
            <p>پایان دوره: {toPersianDigits(source.periodEnd)} · طول دوره: {toPersianDigits(source.periodMonths)} ماه</p>
            <p>واحد ثبت‌شده: {source.unit} · دامنهٔ ثبت‌شده: {source.scope === 'company' ? 'شرکت اصلی' : source.scope}</p>
            <p>انتشار منبع: {stamp(source.publishedAt)}</p><p>دریافت و ثبت منبع: {stamp(source.capturedAt)}</p><p>خواندن برای پژوهش: {stamp(source.fetchedAt)}</p>
            <p>وجود منبع و ساختار معتبر، تطبیق مستقل سند یا کامل‌بودن داده را ثابت نمی‌کند.</p>
          </div>)}
          <p>ثبت پیش‌نویس: {stamp(row.createdAt)}</p>
          <p>مدل ثبت‌شده: <bdi className="break-all" dir="ltr">{row.model}</bdi> · مسیر ثبت‌شده: <bdi className="break-all" dir="ltr">{row.provider}</bdi></p>
        </div>
      </details>;
    })}
    <a href="#research-workbook" className="inline-block min-h-11 py-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">رفتن به کاربرگ تحلیل</a>
    <p>کاربرگ پایین صفحه مستقل است؛ متن یا شواهد پیش‌نویس به‌صورت خودکار به آن منتقل نمی‌شوند.</p>
  </section>;
}
