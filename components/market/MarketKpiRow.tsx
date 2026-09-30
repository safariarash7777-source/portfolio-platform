import Link from "next/link";
import { marketCardContract } from "@/lib/core/marketCards";
import type { MarketProvenance } from "@/lib/market-quality";
import { formatJalali } from "@/lib/format";
/**
 * نوارِ سنجه‌های سرصفحه — ردیفِ دومِ نمای کلان.
 *
 * دادهٔ این نوار **ساخته نمی‌شود**؛ از `lib/core/marketHeadline.ts` می‌آید.
 * این فایل فقط نماست: هر سنجه واحدش را از موتور می‌گیرد و همان را رندر می‌کند،
 * پس «تومان به‌جای ریال» یا «امتیازِ شاخص با پسوندِ تومان» اینجا ممکن نیست.
 *
 * ── چیدمان ───────────────────────────────────────────────────────────────
 * موبایل ۲ ستون · تبلت ۳ · دسکتاپ ۶. در عرضِ متوسط عمداً ۳×۲ می‌شود تا عدد
 * و واحد جا بگیرند و با ellipsis بریده نشوند (معیارِ پذیرش: «عنوان و عددِ مهم
 * بریده نشوند»).
 */
import type { HeadlineMetric } from "@/lib/core/marketHeadline";
import { toPersianDigits, formatPercent, formatTomanShort, formatCount } from "@/lib/format";

/** عددِ سنجه با واحدِ خودش. واحد از موتور می‌آید، نه از حدسِ نما. */
function renderValue(m: HeadlineMetric): string {
  if (m.value == null) return "—";
  if (m.unit === "index") return formatCount(Math.round(m.value));
  if (m.unit === "percent") return formatPercent(m.value);
  // تومان: ارقامِ بزرگ خلاصه، ارقامِ قیمتی کامل — هر دو با پسوندِ «تومان».
  return Math.abs(m.value) >= 1_000_000
    ? formatTomanShort(m.value)
    : `${toPersianDigits(Math.round(m.value).toLocaleString("en-US")).replace(/,/g, "٬")} تومان`;
}

function MetricCard({ m, provenance }: { m: HeadlineMetric; provenance: MarketProvenance }) {
  const contract = marketCardContract(m, provenance);
  const has = m.value != null;
  const chg = m.changePercent;
  const hasChg = typeof chg === "number" && isFinite(chg);

  return (
    <div
      className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--line)", minHeight: 104 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] leading-5" style={{ color: "var(--text-3)" }}>
          {m.label}
        </p>
        {hasChg ? (
          <span
            className="flex flex-shrink-0 items-center gap-0.5 text-[11.5px] font-bold"
            style={{
              color: chg > 0 ? "var(--success)" : chg < 0 ? "var(--danger)" : "var(--text-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {/* رنگ تنها حاملِ معنا نیست — نشانهٔ جهت هم هست، و متنِ صفحه‌خوان جدا. */}
            <span aria-hidden>{chg > 0 ? "▲" : chg < 0 ? "▼" : "•"}</span>
            <span className="sr-only">{chg > 0 ? "افزایش" : chg < 0 ? "کاهش" : "بدون تغییر"} </span>
            {formatPercent(Math.abs(chg))}
          </span>
        ) : null}
      </div>

      <p
        className="font-display font-bold leading-tight"
        style={{
          color: has ? "var(--heading)" : "var(--text-3)",
          fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
          fontVariantNumeric: "tabular-nums",
          // عدد و واحد نباید بریده شوند: اجازهٔ شکستنِ سطر می‌دهیم، نه ellipsis.
          overflowWrap: "anywhere",
        }}
      >
        {renderValue(m)}
      </p>

      <p className="text-[10.5px] leading-4" style={{ color: "var(--text-3)" }}>
        {has ? m.note ?? " " : m.absentReason}
        {has && m.coverage && m.coverage.covered < m.coverage.population ? (
          <>
            {m.note ? " · " : ""}
            {`از ${toPersianDigits(m.coverage.covered)} نماد از ${toPersianDigits(m.coverage.population)}`}
          </>
        ) : null}
      </p>
      <details className="text-xs leading-6" style={{ color: "var(--text-2)" }}>
        <summary className="min-h-11 cursor-pointer py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--navy-ink)]">اعتبار و جزئیات</summary>
        <p>{contract.question}</p>
        <p>زمان معتبر: {contract.validAt == null ? "نامشخص" : formatJalali(contract.validAt)}{contract.quality === "stale" ? " · کهنه" : ""}</p>
        <Link className="inline-flex min-h-11 items-center underline" href={contract.detailHref}>مشاهدهٔ جزئیات</Link>
      </details>
    </div>
  );
}

export default function MarketKpiRow({ metrics, provenance }: { metrics: readonly HeadlineMetric[]; provenance: MarketProvenance }) {
  return (
    <section aria-label="سنجه‌های اصلی بازار">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <MetricCard key={m.key} m={m} provenance={provenance} />
        ))}
      </div>
    </section>
  );
}
