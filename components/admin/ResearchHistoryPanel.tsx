import React from 'react';
import { formatJalali, toPersianDigits } from '@/lib/format';
import { projectIntentHistory, projectWorkbookHistory, type WorkbookHistoryRead, type WorkbookIntentHistoryRead } from '@/lib/intelligence/research-history-metadata';

const MESSAGES = {
  not_supplied: 'هنوز متادیتای یک پروندهٔ ذخیره‌شده تحویل نشده است؛ بازکردن موجود پرونده منبع این بخش است.',
  loading: 'در حال خواندن همان پرونده؛ تاریخچهٔ قبلی به درخواست تازه نسبت داده نمی‌شود.',
  error: 'خواندن متادیتای تاریخچه کامل نشد؛ این خطا به معنی خالی‌بودن تاریخچه نیست.',
  stale: 'پس از آخرین بازخوانی، ثبت یا بازبینی تازه‌ای اعلام شده است؛ تا بازکردن دوبارهٔ موجود پرونده، این بخش نتیجهٔ تازه را بازسازی نمی‌کند.',
  uncertain: 'نتیجهٔ ثبت نامعلوم است؛ این بخش موفقیت، نبود رکورد یا اقدام تازه‌ای از آن استنباط نمی‌کند.',
  metadata_unavailable: 'پرونده باز شده، اما پاسخ فعلی متادیتای مرجع‌دار ندارد؛ UUID یا نویسنده از شمارهٔ نسخه ساخته نمی‌شود.',
  invalid: 'مرجع یا قرارداد متادیتا تطبیق ندارد؛ تاریخچهٔ پروندهٔ دیگری نمایش داده نمی‌شود.',
};

const INTENT_MESSAGES = {
  not_supplied: 'metadata مربوط به intentها در پاسخ موجود تحویل نشده است؛ این وضعیت به معنی نبود intent نیست.',
  loading: 'در حال خواندن پاسخ موجود R2؛ صفحهٔ قبلی تاریخچهٔ کامل تلقی نمی‌شود.',
  error: 'خواندن صفحهٔ intentها موفق نشد؛ این خطا فهرست خالی نیست.',
  unavailable: 'خواندن metadata مربوط به intentها در R2 در دسترس نبود؛ نبود رکورد احراز نشده است.',
  invalid: 'قرارداد صفحه یا cursor مربوط به intentها معتبر نیست؛ فهرست خالی جای آن ساخته نمی‌شود.',
};
const NO_INTENTS: WorkbookIntentHistoryRead = { state: 'not_supplied' };

function IntentHistorySection({ read, workbookId }: { read: WorkbookIntentHistoryRead; workbookId: string | null }) {
  const view = projectIntentHistory(read, workbookId);
  const invalid = view.history.sources.reduce((sum, source) => sum + source.invalidRows, 0);
  const conflict = view.history.conflictingReferences.length;
  return <section className="min-w-0 space-y-2 border-t pt-3" style={{ borderColor: 'var(--line)' }} aria-labelledby="intent-history-title">
    <h4 id="intent-history-title" className="font-bold">intentهای ثبت‌شده در پاسخ موجود</h4>
    <p className="text-sm leading-7">ثبت intent فقط شاهد آماده‌سازی درخواست است؛ اجرای ذخیره، موفقیت، شروع یا پایان را ثابت نمی‌کند.</p>
    {view.state !== 'read' ? <p role="status" className="text-sm leading-7">{INTENT_MESSAGES[view.state]}</p> : <>
      <p className="text-sm leading-7">فقط آخرین صفحهٔ خوانده‌شده، با offset {toPersianDigits(view.window!.offset)} و {toPersianDigits(view.window!.rowsReceived)} ردیف metadata؛ تاریخچهٔ کامل نیست. {view.window!.nextOffset === null ? 'در این پاسخ ادامه‌ای اعلام نشده است؛ این به معنی کامل‌بودن تاریخچه نیست.' : 'صفحه‌های قدیمی‌تر هنوز خوانده نشده‌اند.'}</p>
      <p className="text-sm leading-7">{view.workbookId ? 'فقط intentهای دارای همان workbookId واقعیِ پروندهٔ خوانده‌شده نمایش داده می‌شوند.' : 'این صفحه مستقل است؛ intentها به متن بازشده نسبت داده نمی‌شوند و مرجع R2 هر پرونده جدا نمایش داده می‌شود.'}</p>
      {view.excludedByWorkbook > 0 && <p className="text-sm">{toPersianDigits(view.excludedByWorkbook)} مرجع مربوط به پروندهٔ دیگر در این نمایش کنار گذاشته شد.</p>}
      {(invalid > 0 || conflict > 0) && <p role="status" className="text-sm">{toPersianDigits(invalid)} ردیف نامعتبر و {toPersianDigits(conflict)} مرجع متعارض intent کنار گذاشته شد؛ وجود یا نبود intent از آن حدس زده نمی‌شود.</p>}
      {view.history.duplicatesDropped > 0 && <p className="text-sm">{toPersianDigits(view.history.duplicatesDropped)} مشاهدهٔ تکراری intent، اقدام تازه شمرده نشد.</p>}
      {view.history.events.length === 0 && invalid === 0 && conflict === 0 && <p role="status" className="text-sm">در همین برش و محدودهٔ نمایش، intent ثبت‌شده‌ای تحویل نشده است؛ این نتیجه دربارهٔ همهٔ تاریخچه یا نتیجهٔ ذخیره نیست.</p>}
      <ol className="space-y-2">{view.history.events.map(event => <li key={event.id} className="min-w-0 rounded-lg border p-3 text-sm leading-7" style={{ borderColor: 'var(--line)' }}>
        <p className="font-medium">intent ثبت‌شده</p>
        <p>نسخهٔ هدفِ اعلام‌شده در R2: {toPersianDigits(event.targetVersion!)}؛ پایهٔ اعلام‌شده در درخواست: {toPersianDigits(event.baseVersion!)}. این عدد، مرجع نسخهٔ ذخیره‌شده نیست.</p>
        <p>زمان ثبت intent: {event.times.preparedAt ? <time dateTime={event.times.preparedAt}>{formatJalali(event.times.preparedAt)}</time> : 'نامعلوم؛ زمان جایگزین ساخته نشده است'}</p>
        <p>actor: نامعلوم؛ هویت از نشست یا نتیجهٔ درخواست حدس زده نشده است.</p>
        <dl className="min-w-0"><dt>intentId واقعی</dt><dd dir="ltr" className="break-all">{event.intentId}</dd><dt>مرجع پرونده در R2</dt><dd dir="ltr" className="break-all">{event.workbookId}</dd></dl>
      </li>)}</ol>
    </>}
  </section>;
}

export default function ResearchHistoryPanel({ read, intents = NO_INTENTS }: { read: WorkbookHistoryRead; intents?: WorkbookIntentHistoryRead }) {
  const view = projectWorkbookHistory(read);
  const events = view.history.events;
  const invalidRows = view.history.sources.reduce((sum, source) => sum + source.invalidRows, 0);
  return <section className="card min-w-0 space-y-3 p-4" aria-labelledby="research-history-title">
    <h3 id="research-history-title" className="text-base font-bold">تاریخچهٔ مرجع‌دار پژوهش</h3>
    <p className="text-sm leading-7">نسخه‌ها و بازبینی‌ها از آخرین بازکردن پرونده می‌آیند؛ intentها از صفحهٔ metadata موجود R2. متن خصوصی، یادداشت بازبین و بدنهٔ تحلیل اینجا کپی نمی‌شوند. ترتیب نمایش براساس مرجع است، نه بازسازی ترتیب همهٔ اقدام‌ها. این فهرست، دفتر زندهٔ همهٔ اقدام‌ها یا ارزیابی تحلیلگران نیست.</p>
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
    <IntentHistorySection read={intents} workbookId={view.state === 'read' && read.state === 'read' ? read.workbookId : null} />
    <p className="text-sm leading-7">worker محلی: داده‌ای تحویل نشده است. زمان خواندن، شروع و پایان چرخه نامعلوم‌اند؛ جای آن‌ها با زمان ثبت نسخه یا intent پر نمی‌شود. برای بازخوانی از کنترل‌های موجود استفاده کنید؛ این بخش درخواست یا ثبت مستقلی نمی‌فرستد.</p>
  </section>;
}
