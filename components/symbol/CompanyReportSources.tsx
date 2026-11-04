import type { SymbolFundamentals } from "@/lib/fundamental/types";
import { toPersianDigits } from "@/lib/format";
import CodalSourceLink from "./CodalSourceLink";
import styles from "./SymbolDossier.module.css";

/** A view of the already-read bundle; never fetches or fills report metadata. */
export default function CompanyReportSources({ fundamentals, readFailed }: {
  fundamentals: SymbolFundamentals | null; readFailed: boolean;
}) {
  const reports = [
    fundamentals?.n30 ? { kind: "فعالیت ماهانه", source: fundamentals.n30.source,
      period: fundamentals.n30.data[0]?.period_end, unit: fundamentals.n30.data[0]?.unit } : null,
    fundamentals?.n10 ? { kind: "صورت‌های مالی", source: fundamentals.n10.source,
      period: fundamentals.n10.data.period_end, unit: fundamentals.n10.data.unit } : null,
  ].filter(report => report !== null);
  return <section id="company-sources" className={styles.previewSources} aria-label="شناسنامهٔ منابع شرکت">
    <h2>این بررسی به کدام گزارش‌ها متکی است؟</h2>
    <p>تاریخ دوره، انتشار و دریافت یکی نیستند. جزئیات هر نسخه در تب گزارش‌ها قابل بررسی است.</p>
    {!reports.length ? <p role="status">{readFailed ? "خواندن گزارش‌ها موفق نشد؛ نبود داده اثبات نشده است." : "در بستهٔ فعلی، گزارش قابل استفاده‌ای برای نمودارها موجود نیست."}</p> : null}
    <div className={styles.previewSourceGrid}>{reports.map(report => <article key={report.kind}>
      <h3>{report.kind}</h3>
      <p>{report.source.title}</p>
      <dl>
        <dt>پایان دوره</dt><dd>{report.period ? toPersianDigits(report.period) : "نامشخص"}</dd>
        <dt>واحد مبلغ گزارش</dt><dd>{report.unit || "نامشخص"}</dd>
        <dt>انتشار در منبع</dt><dd>{report.source.publishedAt ? toPersianDigits(report.source.publishedAt) : "نامشخص"}</dd>
        <dt>دامنهٔ ارقام</dt><dd>{report.source.scope === "company" ? "شرکت اصلی" : report.source.scope === "consolidated_ambiguous" ? "تلفیقی؛ انتساب به شرکت قطعی نیست" : "نامشخص"}</dd>
        <dt>اعتبارسنجی حسابی</dt><dd>{report.source.verified ? "انجام شده؛ اعتبار زمانی مستقل است" : "تأیید نشده"}</dd>
      </dl>
      <CodalSourceLink url={report.source.source_url} className={styles.sourceLink} fallback={<p>پیوند معتبر اطلاعیه در دسترس نیست.</p>}>مشاهدهٔ اطلاعیهٔ کدال</CodalSourceLink>
    </article>)}</div>
  </section>;
}
