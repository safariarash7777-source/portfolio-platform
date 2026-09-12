// پنلِ تحلیلِ صندوق — حباب (جاری و تاریخی)، جایگاه در هم‌گروه، نقدشوندگی.
//
// این کامپوننت **فقط نمایش** است؛ هر عدد از `lib/core/fundBubble` و
// `lib/core/fundPeers` می‌آید (اصلِ «یک موتور، دو نما»).
//
// سه قاعده‌ای که ظاهرِ این پنل را تعیین می‌کند:
// ۱) دادهٔ ناموجود «—» است و علتش نوشته می‌شود؛ هرگز صفر یا خط‌تیرهٔ بی‌توضیح.
// ۲) بازهٔ واقعیِ پوشش همیشه دیده می‌شود، تا کسی «میانگینِ حباب» را به‌اشتباه
//    مالِ دورهٔ بلندتری نگیرد.
// ۳) NAV کهنه حذف نمی‌شود — نشان داده می‌شود، با برچسبِ کهنه.

import type { BubbleSeries, BubbleSummary, LiveBubble } from "@/lib/core/fundBubble";
import type { PeerPosition, LiquidityStats } from "@/lib/core/fundPeers";
import { toPersianDigits, formatJalali } from "@/lib/format";

function fa(x: string | number): string {
  return toPersianDigits(String(x));
}

function pct(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return fa(v > 0 ? `+${s}٪` : `${s}٪`);
}

/** مثبت = گران‌تر از NAV (هشدار) · منفی = زیرِ NAV. */
function bubbleColor(v: number | null | undefined): string {
  if (typeof v !== "number" || !isFinite(v)) return "var(--text-3)";
  if (v > 2) return "var(--danger, #B91C1C)";
  if (v < -2) return "var(--success, #15803D)";
  return "var(--text-2)";
}

function Cell({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="text-base font-bold tabular-nums">{children}</span>
      {note ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{note}</span> : null}
    </div>
  );
}

export interface FundAnalysisPanelProps {
  live: LiveBubble;
  series: BubbleSeries;
  summary: BubbleSummary | null;
  /** خلاصهٔ پنجره‌های استاندارد — مقدارِ null یعنی پوشش کافی نبود و ساخته نشد */
  windows: { days: number; label: string; summary: BubbleSummary | null }[];
  peer: PeerPosition | null;
  liquidity: LiquidityStats | null;
}

export default function FundAnalysisPanel(p: FundAnalysisPanelProps) {
  const { live, series, summary, windows, peer, liquidity } = p;
  const cov = series.coverage;

  // «فاصلهٔ امروز از میانه» فقط وقتی معنا دارد که حبابِ امروز واقعاً عددی باشد.
  // اگر نباشد «—» می‌شود، نه اینکه بی‌صدا جای آن عددِ تاریخی بنشیند.
  const todayVsMedian =
    summary != null && typeof live.bubblePercent === "number"
      ? live.bubblePercent - summary.median
      : null;

  return (
    <section
      className="rounded-xl border p-5 space-y-5"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
          حباب، هم‌گروه و نقدشوندگی
        </h2>
        {live.state === "stale" ? (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: "var(--warning-bg, #FEF3C7)", color: "var(--warning-fg, #92400E)" }}
          >
            {fa(live.reason ?? "دادهٔ کهنه")}
          </span>
        ) : null}
      </header>

      {/* ── حبابِ جاری ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Cell
          label="حبابِ امروز"
          note={
            live.state === "unavailable"
              ? (live.reason ?? "در دسترس نیست")
              : [
                  live.navAgeHours != null
                    ? `NAV ${fa(Math.round(live.navAgeHours))} ساعت پیش${live.navTimePrecision === "day" ? " (ساعت ثبت نشده)" : ""}`
                    : null,
                  live.priceAgeHours != null ? `قیمت ${fa(Math.round(live.priceAgeHours))} ساعت پیش` : null,
                  live.pairingGapHours != null ? `فاصلهٔ دو ورودی ${fa(Math.round(live.pairingGapHours))} ساعت` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
          }
        >
          <span style={{ color: bubbleColor(live.bubblePercent) }}>{pct(live.bubblePercent)}</span>
        </Cell>

        {summary ? (
          <>
            <Cell label="میانهٔ بازهٔ موجود">
              <span style={{ color: bubbleColor(summary.median) }}>{pct(summary.median)}</span>
            </Cell>
            <Cell label="کمینه — بیشینه">
              <span className="text-sm">{pct(summary.min)} … {pct(summary.max)}</span>
            </Cell>
            {/* دو عددِ متفاوت، دو خانهٔ متفاوت. قبلاً «فاصله از میانه» از آخرین
                نقطهٔ تاریخی حساب می‌شد ولی زیرِ عنوانِ «حبابِ امروز» می‌نشست. */}
            <Cell
              label="فاصلهٔ امروز از میانه"
              note={todayVsMedian == null ? "حبابِ امروز در دسترس نیست" : "حبابِ امروز منهای میانهٔ بازه"}
            >
              {todayVsMedian == null ? "—" : pct(todayVsMedian)}
            </Cell>
            <Cell
              label="آخرین ثبتِ تاریخچه"
              note={`${fa(formatJalali(summary.lastObservedDate, false))} · فاصله از میانه ${pct(summary.lastVsMedian)}`}
            >
              <span style={{ color: bubbleColor(summary.lastObserved) }}>{pct(summary.lastObserved)}</span>
            </Cell>
          </>
        ) : (
          <div className="col-span-3 self-center text-sm" style={{ color: "var(--text-3)" }}>
            تاریخچهٔ NAV برای این صندوق ثبت نشده است.
          </div>
        )}
      </div>

      {/* ── صداقتِ پوشش ────────────────────────────────────────────── */}
      {cov ? (
        <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>
          بازهٔ واقعی: {fa(formatJalali(cov.firstDate, false))} تا {fa(formatJalali(cov.lastDate, false))}
          {" — "}
          {fa(cov.observedDays)} روزِ دارای هم‌زمانِ قیمت و NAV
          {cov.calendarSpanDays !== cov.observedDays
            ? ` (در ${fa(cov.calendarSpanDays)} روزِ تقویمی)`
            : null}
          {series.skipped.missingNav + series.skipped.missingPrice + series.skipped.implausibleRatio > 0 ? (
            <>
              {/* جداکنندهٔ «·» کنارِ رقمِ فارسی از «۰» قابلِ تشخیص نیست — رقمِ صفرِ
                  فارسی خودش یک نقطه است. در رندرِ آزمایشی این ابهام دیده شد. */}
              {" — کنارگذاشته: "}
              {series.skipped.missingNav > 0 ? `${fa(series.skipped.missingNav)} روز بدونِ NAV` : null}
              {series.skipped.missingPrice > 0 ? ` ${fa(series.skipped.missingPrice)} روز بدونِ قیمت` : null}
              {series.skipped.implausibleRatio > 0 ? ` ${fa(series.skipped.implausibleRatio)} روز با نسبتِ نامعتبر` : null}
            </>
          ) : null}
        </p>
      ) : null}

      {/* ── پنجره‌ها؛ پنجرهٔ فاقدِ پوشش ساخته نمی‌شود ───────────────── */}
      {windows.length > 0 ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          {windows.map((w) => (
            <div key={w.days} className="flex items-baseline gap-2 text-sm">
              <span style={{ color: "var(--text-3)" }}>میانهٔ {w.label}:</span>
              {w.summary ? (
                <span className="font-bold tabular-nums" style={{ color: bubbleColor(w.summary.median) }}>
                  {pct(w.summary.median)}
                </span>
              ) : (
                <span style={{ color: "var(--text-3)" }}>دادهٔ کافی نیست</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── هم‌گروه ────────────────────────────────────────────────── */}
      <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: "var(--navy-deep)" }}>جایگاه در هم‌گروه</h3>
        {peer ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Cell label="گروه" note={`${fa(peer.of)} صندوقِ دارای حباب`}>
              <span className="text-sm">{peer.type}</span>
            </Cell>
            <Cell label="رتبهٔ حباب" note="از کم‌حباب‌ترین به پرحباب‌ترین">
              {fa(peer.rank)} از {fa(peer.of)}
            </Cell>
            <Cell label="میانهٔ گروه">
              <span style={{ color: bubbleColor(peer.median) }}>{pct(peer.median)}</span>
            </Cell>
            <Cell label="فاصله از میانهٔ گروه">{pct(peer.vsMedian)}</Cell>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            مقایسه ساخته نشد — یا این صندوق حبابِ معتبر ندارد، یا اعضای هم‌نوعِ دارای حباب کمتر از حدِ لازم‌اند.
          </p>
        )}
      </div>

      {/* ── نقدشوندگی ─────────────────────────────────────────────── */}
      <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: "var(--navy-deep)" }}>نقدشوندگی</h3>
        {liquidity ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Cell label="میانهٔ ارزشِ معاملاتِ روزانه" note="میلیون تومان">
                {fa(Math.round(liquidity.medianDailyValueMTom).toLocaleString("en-US"))}
              </Cell>
              <Cell label="کم‌ترین روز" note="میلیون تومان">
                {fa(Math.round(liquidity.minDailyValueMTom).toLocaleString("en-US"))}
              </Cell>
              <Cell label="روزهای بدونِ معامله">
                {fa(liquidity.zeroVolumeDays)} از {fa(liquidity.observedDays)}
              </Cell>
              <Cell label="نسبتِ روزهای دارای معامله">
                {fa((liquidity.tradedDayRatio * 100).toFixed(0))}٪
              </Cell>
            </div>
            <p className="mt-3 text-xs leading-6" style={{ color: "var(--text-3)" }}>
              مبنا: ارزشِ معاملاتِ ثبت‌شدهٔ {fa(liquidity.observedDays)} روزِ اخیر
              {liquidity.daysWithoutRecord > 0
                ? ` (${fa(liquidity.daysWithoutRecord)} روز رکورد نداشت و صفر گرفته نشد)`
                : null}
              . این سنجه اندازهٔ صندوق را در نظر نمی‌گیرد (خالص دارایی در فید ثبت نمی‌شود)
              و اثرِ سفارش یا شکافِ عرضه و تقاضا را نمی‌سنجد.
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            روزهای دارای رکوردِ ارزشِ معاملات برای محاسبهٔ میانه کافی نیست.
          </p>
        )}
      </div>
    </section>
  );
}
