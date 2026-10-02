'use client';
import type { PublicationDraft } from '@/lib/intelligence/publication';
import { prepareAudiencePreview } from '@/lib/intelligence/p07-preparation';
import { formatTehranDate } from '@/lib/consultation/time';

export default function P07AudiencePreview({ draft }: { draft: PublicationDraft }) {
  let preview: ReturnType<typeof prepareAudiencePreview>;
  try { preview = prepareAudiencePreview(draft); }
  catch (error) { return <section className="card p-5 space-y-3" aria-label="پیش‌نمایش مخاطب"><h2 className="font-bold">پیش‌نمایش مخاطب</h2><p role="status">{error instanceof Error ? error.message : 'متن کامل نیست.'}</p><p>عنوان، متن، منبع و مخاطب را کامل کنید.</p></section>; }
  return <section className="card p-5 space-y-4" aria-label="پیش‌نمایش مخاطب">
    <h2 className="font-bold text-lg">پیش‌نمایش مخاطب</h2><p className="text-sm">{preview.audience === 'public' ? 'مخاطب عمومی' : 'فقط دوره‌های انتخاب‌شده'} · این نما مجوز دسترسی ایجاد نمی‌کند.</p>
    <article className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <h3 className="font-bold text-xl">{preview.title}</h3><p className="leading-8 whitespace-pre-wrap">{preview.summary}</p><p className="leading-8 whitespace-pre-wrap break-words">{preview.content}</p>
      <h4 className="font-bold">منابع متن</h4><ul className="space-y-3">{preview.sources.map(source => <li key={source.url + source.asOf}><a className="underline break-all min-h-11 inline-flex items-center" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><p className="text-sm">تاریخ منبع: {formatTehranDate(source.asOf + 'T12:00:00Z')}</p></li>)}</ul>
    </article><p className="text-sm leading-7">اصل ورودی، یادداشت داخلی و دارایی مشتری از فیلدهای این نما کنار گذاشته‌اند. متن آزاد و نشانی منبع را هم خودتان از نظر اطلاعات خصوصی بررسی کنید.</p>
  </section>;
}
