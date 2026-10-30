import React from 'react';
import { formatJalali, toPersianDigits } from '@/lib/format';
import { projectWorkbookHistory, type WorkbookHistoryRead } from '@/lib/intelligence/research-history-metadata';

const MESSAGES = {
  not_supplied: 'هنوز متادیتای یک پروندهٔ ذخیره‌شده تحویل نشده است؛ بازکردن موجود پرونده منبع این بخش است.',
  loading: 'در حال خواندن همان پرونده؛ تاریخچهٔ قبلی به درخواست تازه نسبت داده نمی‌شود.',
  error: 'خواندن متادیتای تاریخچه کامل نشد؛ این خطا به معنی خالی‌بودن تاریخچه نیست.',
  stale: 'پس از آخرین بازخوانی، ثبت یا بازبینی تازه‌ای اعلام شده است؛ تا بازکردن دوبارهٔ موجود پرونده، این بخش نتیجهٔ تازه را بازسازی نمی‌کند.',
  uncertain: 'نتیجهٔ ثبت نامعلوم است؛ این بخش موفقیت، نبود رکورد یا اقدام تازه‌ای از آن استنباط نمی‌کند.',
  metadata_unavailable: 'پرونده باز شده، اما پاسخ فعلی متادیتای مرجع‌دار ندارد؛ UUID یا نویسنده از شمارهٔ نسخه ساخته نمی‌شود.',
  invalid: 'مرجع یا قرارداد متادیتا تطبیق ندارد؛ تاریخچهٔ پروندهٔ دیگری نمایش داده نمی‌شود.',
};

export default function ResearchHistoryPanel({ read }: { read: WorkbookHistoryRead }) {
  const view = projectWorkbookHistory(read);
  const events = view.history.events;
  const invalidRows = view.history.sources.reduce((sum, source) => sum + source.invalidRows, 0);
  return <section className="card min-w-0 space-y-3 p-4" aria-labelledby="research-history-title">
    <h3 id="research-history-title" className="text-base font-bold">تاریخچهٔ مرجع‌دار همین پرونده</h3>
    <p className="text-sm leading-7">فقط متادیتای آخرین بازکردن پرونده؛ متن خصوصی، یادداشت بازبین و بدنهٔ تحلیل اینجا کپی نمی‌شوند. ترتیب نمایش براساس مرجع است، نه بازسازی ترتیب همهٔ اقدام‌ها. این فهرست، دفتر زندهٔ همهٔ اقدام‌ها یا ارزیابی تحلیلگران نیست.</p>
    {view.state !== 'read' ? <p role="status" className="text-sm leading-7">{MESSAGES[view.state]}</p> : <>
      {events.length === 0 && <p role="status" className="text-sm leading-7">در متادیتای خوانده‌شده رویداد قابل نمایش وجود ندارد؛ این نتیجه دربارهٔ همهٔ تاریخچه نیست.</p>}
      {(invalidRows > 0 || view.history.conflictingReferences.length > 0) && <p role="status" className="text-sm leading-7">
        {toPersianDigits(invalidRows)} ردیف نامعتبر و {toPersianDigits(view.history.conflictingReferences.length)} مرجع متعارض کنار گذاشته شد؛ اطلاعات جایگزین ساخته نشده است.
      </p>}
      {view.history.duplicatesDropped > 0 && <p className="text-sm">{toPersianDigits(view.history.duplicatesDropped)} مشاهدهٔ تکراری، اقدام تازه شمرده نشد.</p>}
      <ol className="space-y-3">
        {events.map(event => {
          const isReview = event.kind === 'workbook_review_recorded';
          const at = isReview ? event.times.reviewedAt : event.times.createdAt;
          return <li key={event.id} className="min-w-0 rounded-lg border p-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>
            <p className="font-medium">{isReview ? 'بازبینی ثبت‌شده' : 'نسخهٔ ثبت‌شده'} · نسخهٔ {event.version === null ? 'نامعلوم' : toPersianDigits(event.version)}</p>
            {isReview && <p>تصمیم روی همین نسخه: {event.decision === 'approved_internal' ? 'تأیید داخلی' : 'بازگردانده‌شده'}؛ تأیید نسخهٔ دیگر یا انتشار نیست.</p>}
            <p>{isReview ? 'زمان بازبینی' : 'زمان ثبت نسخه'}: {at ? <time dateTime={at}>{formatJalali(at)}</time> : 'نامعلوم؛ در منبع موجود نیست یا معتبر نیست'}</p>
            <p>شناسهٔ {isReview ? 'بازبین' : 'نویسنده'}: {event.actorId ? <code dir="ltr" className="break-all">{event.actorId}</code> : 'نامعلوم؛ در متادیتای خوانده‌شده نیست و از نشست یا نقش حدس زده نشده است'}</p>
            <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-2">مرجع همین رویداد</summary>
              <dl className="min-w-0 space-y-1">
                <dt>نسخهٔ مقصد</dt><dd dir="ltr" className="break-all">{event.versionId ?? 'نامعلوم'}</dd>
                <dt>مرجع ردیف</dt><dd dir="ltr" className="break-all">{event.sourceRef.recordId}</dd>
                <dt>منبع</dt><dd className="break-words">متادیتای مخزن مجاز همین پرونده</dd>
              </dl>
              {event.version === null && <p>متادیتای نسخهٔ مرجع حاضر نیست یا تعارض دارد؛ ارتباط به آخرین نسخه حدس زده نمی‌شود.</p>}
            </details>
          </li>;
        })}
      </ol>
    </>}
    <p className="text-sm leading-7">worker محلی: داده‌ای تحویل نشده است. زمان خواندن، شروع و پایان چرخه نامعلوم‌اند؛ جای آن‌ها با زمان ثبت نسخه پر نمی‌شود. برای بازخوانی از همان «بازکردن پرونده» موجود استفاده کنید؛ این بخش درخواست یا ثبت مستقلی نمی‌فرستد.</p>
  </section>;
}
