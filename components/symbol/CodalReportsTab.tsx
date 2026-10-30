"use client";

// T5-2 — تب «گزارش‌های کدال» نماد:
// ۱) فهرست گزارش‌های پردازش‌شده (codal_reports — از سرور به‌صورت prop می‌آید).
// ۲) دکمهٔ «دریافت فهرست» → /api/codal-list که metadata جدول codal_feed را می‌خواند.
//    اطلاعیه‌ها و گزارش‌های مالیِ پردازش‌شده دو مجموعهٔ جدا هستند؛ این مسیر رله را فراخوانی نمی‌کند.
// ۳) لینک جست‌وجوی رسمی codal.ir همیشه نمایش داده می‌شود — صادقانه و بدون دادهٔ ساختگی.
// لینک‌ها به codal.ir؛ هیچ واژهٔ تجویزی.

import { useEffect, useRef, useState } from "react";
import { CODAL_FEED_READ_LIMIT, CODAL_FEED_DISPLAY_LIMIT } from "@/lib/codal-feed";
import { toPersianDigits } from "@/lib/format";
import CodalSourceLink from "@/components/symbol/CodalSourceLink";
import { companyReportKinds, discoverCompanyReports, EMPTY_REPORT_FILTER, type CompanyAnnouncement, type CompanyReportFilter } from "@/lib/core/companyReportDiscovery";

export type StoredReport = {
  kind: string;          // «ن-۳۰» | «ن-۱۰» | ...
  title: string;
  periodEnd: string | null; // پایان دورهٔ مالی، نه تاریخ انتشار
  url: string | null;    // لینک صفحهٔ کدال
};

type LiveItem = CompanyAnnouncement;
const DEFAULT_VISIBLE_FIELDS = { kind: true, sentAt: true };

function normalizeLive(j: unknown): LiveItem[] {
  const root = (j && typeof j === "object" ? (j as Record<string, unknown>) : {});
  if (!Array.isArray(root.data)) throw new Error("invalid_stored_announcements");
  const arr = root.data;
  return arr
    .map((a): LiveItem | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      const title = s(o.title);
      if (!title) return null;
      return { title, kind: s(o.kind), date: s(o.date), time: s(o.time), publishedDate: s(o.publishedDate), url: s(o.url) };
    })
    .filter((x): x is LiveItem => x !== null);
}

export default function CodalReportsTab({
  symbol,
  stored,
  readFailed = false,
}: {
  symbol: string;
  stored: StoredReport[];
  readFailed?: boolean;
}) {
  const [received, setReceived] = useState<{ symbol: string; items: LiveItem[] } | null>(null);
  const live = received?.symbol === symbol ? received.items : null;
  const [liveState, setLiveState] = useState<"idle" | "loading" | "error">("idle");
  const [filter, setFilter] = useState<CompanyReportFilter>(EMPTY_REPORT_FILTER);
  const [visibleFields, setVisibleFields] = useState(DEFAULT_VISIBLE_FIELDS);
  const activeRequest = useRef({ version: 0 });
  useEffect(() => {
    const requests = activeRequest.current;
    requests.version++;
    setReceived(null); setLiveState('idle'); setFilter(EMPTY_REPORT_FILTER);
    setVisibleFields(DEFAULT_VISIBLE_FIELDS);
    // A reused dossier must ignore a late response belonging to the old company.
    return () => { requests.version++; };
  }, [symbol]);
  const discovered = discoverCompanyReports(live ?? [], filter);
  const kinds = companyReportKinds(live ?? []);

  const codalSearchUrl = `https://codal.ir/ReportList.aspx?search&Symbol=${encodeURIComponent(symbol)}`;

  const loadAll = () => {
    const request = ++activeRequest.current.version;
    setLiveState("loading");
    fetch(`/api/codal-list?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (request !== activeRequest.current.version) return;
        setReceived({ symbol, items: normalizeLive(j) });
        setLiveState("idle");
      })
      .catch(() => { if (request === activeRequest.current.version) setLiveState("error"); });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        فهرست اطلاعیه‌ها حداکثر {toPersianDigits(CODAL_FEED_DISPLAY_LIMIT)} مورد از {toPersianDigits(CODAL_FEED_READ_LIMIT)} رکورد اخیر ذخیره‌شده را نشان می‌دهد؛ تاریخچه کامل نیست. فیلترها فقط همین فهرست را بررسی می‌کنند. دریافت دوباره، تازگی انتشار یا کامل‌بودن ارقام مالی را ثابت نمی‌کند.
      </p>
      <div className="card p-4">
        <h3 className="text-sm font-bold">گزارش‌های پردازش‌شده</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          گزارش‌هایی که موتور دادهٔ ما از کدال دریافت و پردازش کرده است (منبع نمودارهای بنیادی).
        </p>
        {readFailed ? (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            خواندن گزارش‌های پردازش‌شده موفق نشد؛ نبود فهرست به معنی پردازش‌نشدن گزارش نیست. دوباره صفحه را باز کنید.
          </p>
        ) : stored.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {stored.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{r.kind}</span>
                  <CodalSourceLink url={r.url} className="font-medium hover:underline" fallback={<span className="font-medium">{r.title}</span>}>
                    {r.title}
                  </CodalSourceLink>
                </div>
                <span className="shrink-0 text-muted-foreground">دورهٔ مالی: {r.periodEnd ? toPersianDigits(r.periodEnd) : "نامعلوم"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            هنوز گزارشی برای این نماد پردازش نشده است. صف بک‌فیل آرشیو کدال به‌تدریج پوشش را گسترش می‌دهد.
          </p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">اطلاعیه‌های ذخیره‌شدهٔ کدال</h3>
          {live === null && (
            <button
              type="button"
              onClick={loadAll}
              disabled={liveState === "loading"}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              {liveState === "loading" ? "در حال دریافت…" : "دریافت فهرست"}
            </button>
          )}
        </div>
        {liveState === "error" && (
          <p className="mt-3 text-xs text-muted-foreground">
            دریافت فهرست ذخیره‌شده ممکن نشد. کمی بعد دوباره تلاش کنید.
          </p>
        )}
        {live !== null && (
          live.length > 0 ? (<>
            <p className="mt-3 text-xs text-muted-foreground">
              جست‌وجو فقط در همین فهرست دریافت‌شده است: حداکثر ۳۰ اطلاعیهٔ ذخیره‌شده، نه تاریخچهٔ کامل شرکت. تاریخ ارسال با پایان دورهٔ مالی متفاوت است.
            </p>
            <fieldset className="mt-3 grid gap-3 sm:grid-cols-3">
              <legend className="sr-only">فیلتر اطلاعیه‌های دریافت‌شده</legend>
              <label className="grid gap-1 text-xs">
                جست‌وجو در عنوان
                <input type="search" value={filter.query} maxLength={200}
                  onChange={event => setFilter(previous => ({ ...previous, query: event.target.value }))}
                  className="min-h-11 min-w-0 rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
              </label>
              <label className="grid gap-1 text-xs">
                نوع اطلاعیه
                <select value={filter.kind === null ? "all" : `kind:${filter.kind}`}
                  onChange={event => setFilter(previous => ({ ...previous, kind: event.target.value === "all" ? null : event.target.value.slice(5) }))}
                  className="min-h-11 min-w-0 rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                  <option value="all">همهٔ انواع</option>
                  {kinds.map(kind => <option key={kind.value} value={`kind:${kind.value}`}>{kind.label}</option>)}
                  <option value="kind:">نوع ثبت‌نشده</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                ثبت تاریخ ارسال
                <select value={filter.sentDate}
                  onChange={event => setFilter(previous => ({ ...previous, sentDate: event.target.value as CompanyReportFilter['sentDate'] }))}
                  className="min-h-11 min-w-0 rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                  <option value="all">همهٔ تاریخ‌ها</option>
                  <option value="present">تاریخ ثبت‌شده</option>
                  <option value="missing">تاریخ ثبت‌نشده</option>
                </select>
              </label>
            </fieldset>
            <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <legend className="font-medium">اطلاعات نمایشی</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" aria-label="نمایش نوع اطلاعیه" checked={visibleFields.kind}
                  onChange={event => setVisibleFields(previous => ({ ...previous, kind: event.target.checked }))}
                  className="h-4 w-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
                نمایش نوع اطلاعیه
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" aria-label="نمایش زمان ارسال" checked={visibleFields.sentAt}
                  onChange={event => setVisibleFields(previous => ({ ...previous, sentAt: event.target.checked }))}
                  className="h-4 w-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
                نمایش زمان ارسال
              </label>
              <p className="w-full text-muted-foreground">انتخاب نمایش، فیلترها را تغییر نمی‌دهد؛ عنوان، منبع، تاریخ انتشار و هشدارهای نقص اطلاعات همیشه باقی می‌مانند.</p>
            </fieldset>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {toPersianDigits(discovered.items.length)} نتیجه از {toPersianDigits(discovered.total)} اطلاعیهٔ دریافت‌شده؛ {toPersianDigits(discovered.excluded.length)} مورد با فیلتر کنار گذاشته شد. تاریخ ارسال {toPersianDigits(discovered.missingSentDate)} مورد ثبت نشده است.
              </p>
              <button type="button" onClick={() => setFilter(EMPTY_REPORT_FILTER)}
                disabled={!filter.query && filter.kind === null && filter.sentDate === 'all'}
                className="min-h-11 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">
                پاک‌کردن فیلترها
              </button>
            </div>
            {discovered.excluded.length > 0 && <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer py-3">علت کنارگذاری از نتیجه</summary>
              <p>عنوان: {toPersianDigits(discovered.reasonCounts.title_mismatch)}؛ نوع: {toPersianDigits(discovered.reasonCounts.kind_mismatch)}؛ ثبت تاریخ: {toPersianDigits(discovered.reasonCounts.sent_date_presence_mismatch)}. یک اطلاعیه ممکن است چند علت داشته باشد.</p>
              <ul className="mt-2 space-y-2">{discovered.excluded.map(entry => <li key={entry.index} className="break-words">
                {entry.row.title} — {entry.reasons.map(reason => ({ title_mismatch: 'عنوان منطبق نیست', kind_mismatch: 'نوع منطبق نیست', sent_date_presence_mismatch: 'وضعیت ثبت تاریخ منطبق نیست' })[reason]).join('؛ ')}
              </li>)}</ul>
            </details>}
            {discovered.items.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {discovered.items.map((a, i) => (
                <li key={i} className="py-2 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 break-words">
                      {visibleFields.kind && a.kind && (
                        <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{a.kind}</span>
                      )}
                      <CodalSourceLink url={a.url} className="font-medium hover:underline" fallback={<span className="font-medium">{a.title}</span>}>
                        {a.title}
                      </CodalSourceLink>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {(!a.date || visibleFields.sentAt) && <>{a.date ? `ارسال: ${toPersianDigits(a.date)}${a.time ? ` ${toPersianDigits(a.time)}` : ""}` : "زمان ارسال نامعلوم"}<br /></>}
                      {a.publishedDate ? `انتشار: ${toPersianDigits(a.publishedDate)} (ساعت نامعلوم)` : "تاریخ انتشار نامعلوم"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>) : <p className="mt-3 text-sm">در فهرست دریافت‌شده موردی با این فیلتر پیدا نشد. فیلترها را پاک کنید یا در کدال جست‌وجو کنید.</p>}
          </>) : (
            <p className="mt-3 text-xs text-muted-foreground">
              هنوز اطلاعیهٔ ذخیره‌شده‌ای برای این نماد نداریم؛ فهرست کامل را در خود کدال ببینید.
            </p>
          )
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          منبع: codal.ir —{" "}
          <a href={codalSearchUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] hover:underline">
            مشاهدهٔ همهٔ اطلاعیه‌های «{symbol}» در سایت کدال
          </a>
        </p>
      </div>
    </div>
  );
}
