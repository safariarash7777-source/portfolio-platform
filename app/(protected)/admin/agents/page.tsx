import Link from 'next/link';
import { Bot, ArrowLeft } from 'lucide-react';
import { loadResearchDraftsView } from '@/lib/intelligence/research-drafts-view';
import { formatJalali, formatTehranClock, toPersianDigits } from '@/lib/format';
import OperationalAgents from '@/components/admin/OperationalAgents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ایجنت‌های سایت | پنل مدیریت', robots: { index: false, follow: false } };
function dateLabel(value: string | null): string {
  return value ? `${formatJalali(value)}، ساعت ${formatTehranClock(value)} تهران` : 'در منبع ثبت نشده';
}
const scenarioLabels = { base: 'پایه', upside: 'بهبود', downside: 'افت' };

export default async function AgentsPage() {
  const view = await loadResearchDraftsView();
  const latest = view.drafts[0];
  return <div className="mx-auto max-w-6xl space-y-6" style={{ color: 'var(--text)' }}>
    <header className="space-y-3">
      <Bot size={28} aria-hidden="true" />
      <h1 className="font-display text-2xl font-extrabold">ایجنت‌های سایت</h1>
      <p className="max-w-3xl text-base leading-8">پیش‌نویس‌های داخلی پژوهش، همراه شواهد و سناریوها؛ نتیجهٔ مدل پیش از استفاده نیازمند بازبینی انسانی است.</p>
      <div className="rounded-xl border p-4 text-sm leading-7" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        {view.unavailableReason ?? (latest ? `آخرین پیش‌نویس قابل نمایش: ${dateLabel(latest.createdAt)}.` : view.invalidCount ? 'هیچ پیش‌نویس معتبری برای نمایش وجود ندارد؛ رکوردهای ناسازگار باید بررسی شوند.' : 'هنوز پیش‌نویسی در مخزن ثبت نشده است. وجود این صفحه به معنی اجرای ایجنت نیست.')}
        <p>مسیر پژوهش با Hermes محلی کار می‌کند و فقط باندهای کیفی را به مدل می‌فرستد. اجرای زمان‌بندی‌شده به روشن بودن رایانه و دسترسی شبکه وابسته است؛ وجود پیش‌نویس، سلامت فعلی زمان‌بند را اثبات نمی‌کند.</p>
      </div>
      {view.invalidCount > 0 && <p role="status" className="text-sm leading-7">{toPersianDigits(view.invalidCount)} رکورد به دلیل ناسازگاری ساختار یا شواهد نمایش داده نشد و نیازمند بررسی است.</p>}
    </header>
    <OperationalAgents />
    <section aria-labelledby="research-drafts" className="space-y-5">
      <h2 id="research-drafts" className="text-lg font-bold">تازه‌ترین پیش‌نویس‌های ثبت‌شده</h2>
      <p className="text-sm leading-7" style={{ color: 'var(--text-2)' }}>این نما حداکثر {toPersianDigits(20)} رکورد اخیر را می‌خواند. زمان دریافت داده با تاریخ انتشار گزارش و دورهٔ مالی تفاوت دارد؛ تازه بودن دریافت، تازه بودن دورهٔ گزارش را تضمین نمی‌کند.</p>
      {view.drafts.map(draft => <article key={draft.id} className="card space-y-5 p-5" aria-label={`پیش‌نویس ثبت‌شده در ${dateLabel(draft.createdAt)}`}>
        <header className="space-y-2">
          <h3 className="text-base font-bold">پیش‌نویس — در انتظار بازبینی انسانی</h3>
          <p className="text-sm leading-7">ثبت در پنل: {dateLabel(draft.createdAt)}</p>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>مسیر مدل: <bdi dir="ltr">{draft.provider} / {draft.model}</bdi></p>
        </header>
        <p className="whitespace-pre-wrap text-sm leading-8">{draft.body.summary}</p>
        <section className="space-y-3" aria-label="گزاره‌ها">
          <h4 className="font-bold">گزاره‌ها و شواهد</h4>
          <ul className="space-y-3">{draft.body.claims.map((claim, index) => <li key={index} className="rounded-lg border p-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>
            <span className="font-bold">{claim.kind === 'FACT' ? 'گزارهٔ مبتنی بر ورودی — نیازمند تطبیق' : 'استنباط مدل'}: </span>{claim.text}
            <p style={{ color: 'var(--text-2)' }}>شواهد: {claim.evidence.map(toPersianDigits).join('، ')}</p>
          </li>)}</ul>
        </section>
        <section className="space-y-3" aria-label="سناریوها">
          <h4 className="font-bold">سناریوها و شرط ابطال</h4>
          <div className="grid gap-3 lg:grid-cols-3">{draft.body.scenarios.map(scenario => <div key={scenario.label} className="rounded-lg border p-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>
            <h5 className="font-bold">{scenarioLabels[scenario.label]}</h5><p>{scenario.text}</p>
            <p className="mt-2"><span className="font-bold">شرط ابطال: </span>{scenario.invalidation}</p>
            <p className="mt-2" style={{ color: 'var(--text-2)' }}>شواهد: {scenario.evidence.map(toPersianDigits).join('، ')}</p>
          </div>)}</div>
        </section>
        <section className="space-y-2" aria-label="محدودیت‌ها"><h4 className="font-bold">محدودیت‌های تحلیل</h4><ul className="list-inside list-disc space-y-2 text-sm leading-7">{draft.body.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></section>
        <details className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
          <summary className="cursor-pointer text-sm font-bold">منابع و زمان‌های هر شاهد</summary>
          <ul className="mt-4 space-y-4">{draft.provenance.map(source => <li key={source.evidence} className="space-y-1 border-t pt-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>
            <p className="font-bold"><bdi>{toPersianDigits(source.evidence)}</bdi> — {source.symbol}</p>
            <p>شناسهٔ گزارش: <bdi>{toPersianDigits(source.reportId)}</bdi> · دورهٔ مالی: <bdi>{toPersianDigits(source.periodEnd)}</bdi> · {toPersianDigits(source.periodMonths)} ماهه</p>
            <p>واحد ورودی: {source.unit} · دامنه: {source.scope === 'company' ? 'شرکت اصلی' : source.scope}</p>
            <p>انتشار منبع: {dateLabel(source.publishedAt)}</p>
            <p>برداشت برای این پژوهش: {dateLabel(source.fetchedAt)}</p>
            <p>دریافت ذخیره‌شده: {dateLabel(source.capturedAt)}</p>
            <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">مشاهدهٔ گزارش منبع برای {source.symbol}</a>
          </li>)}</ul>
        </details>
      </article>)}
    </section>
    <section className="grid gap-4 sm:grid-cols-2" aria-label="ادامهٔ کار">
      <Link className="card flex min-h-16 items-center justify-between gap-3 p-5 focus-visible:outline focus-visible:outline-2" href="/admin/research"><span>کاربرگ پژوهش و بازبینی تحلیل</span><ArrowLeft size={20} aria-hidden="true" /></Link>
      <Link className="card flex min-h-16 items-center justify-between gap-3 p-5 focus-visible:outline focus-visible:outline-2" href="/admin/intelligence"><span>گردش تحلیل و بازبینی انسانی</span><ArrowLeft size={20} aria-hidden="true" /></Link>
    </section>
  </div>;
}
