import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getIrMarket } from "@/lib/market-ir";
import { buildMarketHeadline } from "@/lib/core/marketHeadline";
import { computeFreshness } from "@/lib/market-freshness";
import { toPersianDigits, formatPercent, formatTomanShort, formatCount } from "@/lib/format";

/**
 * Hero — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * جهت: Premium Financial Editorial. سرصفحهٔ یک نشریه، نه صفحهٔ فروش.
 *
 * حذف‌شده نسبت به نسخهٔ قبل:
 *  - `WaitlistForm` از داخل هیرو (هیرو صفحهٔ فروش نیست) — فرم با همان `id="waitlist"`
 *    به ناحیهٔ «مشاورهٔ اختصاصی» منتقل شد تا همهٔ لینک‌های `/#waitlist` سالم بمانند.
 *  - سه کارتِ TRUST_PILLARS (عیناً در WhyArash و /about تکرار شده بودند)
 *  - CTAی سومِ «ورود به داشبورد» (ورود در ناوبری هست)
 *  - بافتِ گرید، هالهٔ طلایی و کمانِ تزئینی — سه افکتِ هم‌زمانِ تزئینی
 *
 * باقی‌مانده: یک خطِ طلاییِ نازک به‌عنوان نشانهٔ سرصفحه. همین.
 *
 * ── بازطراحیِ بنر (بستهٔ فرانتِ بازار) ────────────────────────────────────
 * نسخهٔ قبل یک بنرِ بلند و کم‌محتوا بود: نامِ بزرگ، سه جمله، دو دکمه — و در
 * دسکتاپ **هیچ تکه‌ای از خودِ محصول** بدونِ اسکرول دیده نمی‌شد. حالا کنارِ
 * معرفی، یک نمای **واقعیِ** بازار می‌نشیند که از همان موتورِ `/market`
 * (`buildMarketHeadline`) می‌آید.
 *
 * ⚠️ این پنل تصویرِ ساختگیِ داشبورد نیست و عددِ نمونه ندارد: اگر اسنپ‌شات
 * نباشد، سنجه‌ها «—» می‌شوند و برچسبِ تازگیِ داده همان را می‌گوید. ارتفاعِ
 * عمودیِ بنر هم کم شده تا محصول زودتر دیده شود.
 */

/** پنلِ نمای واقعیِ بازار — چهار سنجهٔ اول از موتورِ مشترک. */
async function MarketGlance() {
  const ir = await getIrMarket().catch(() => null);
  const headline = buildMarketHeadline({
    indices: ir?.indices ?? null,
    stocks: ir?.stocks ?? [],
    gold: ir?.gold ?? [],
    currency: ir?.currency ?? [],
  });
  const metrics = headline.metrics.slice(0, 4);
  const fresh = computeFreshness({
    irFetchedAt: ir?.fetchedAt ?? null,
    usesIr: true,
    usesGlobal: false,
    now: Date.now(),
  });

  const show = (m: (typeof metrics)[number]) => {
    if (m.value == null) return "—";
    if (m.unit === "index") return formatCount(Math.round(m.value));
    return Math.abs(m.value) >= 1_000_000
      ? formatTomanShort(m.value)
      : `${toPersianDigits(Math.round(m.value).toLocaleString("en-US")).replace(/,/g, "٬")} تومان`;
  };

  return (
    <div
      className="anim-rise anim-d3 rounded-2xl border p-4"
      style={{ background: "rgba(248,250,252,0.06)", borderColor: "rgba(248,250,252,0.16)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold" style={{ color: "var(--gold-light)" }}>
          میز بازار — همین حالا
        </p>
        <span className="text-[10.5px]" style={{ color: "rgba(248,250,252,0.62)" }}>
          {fresh.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2.5">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="rounded-xl p-2.5"
            style={{ background: "rgba(13,31,74,0.45)", border: "1px solid rgba(248,250,252,0.10)" }}
          >
            <dt className="text-[10.5px]" style={{ color: "rgba(248,250,252,0.66)" }}>
              {m.label}
            </dt>
            <dd
              className="mt-0.5 font-display text-[15px] font-bold"
              style={{
                color: "var(--text-on-navy)",
                fontVariantNumeric: "tabular-nums",
                overflowWrap: "anywhere",
              }}
            >
              {show(m)}
            </dd>
            {typeof m.changePercent === "number" ? (
              <dd
                className="text-[11px] font-bold"
                style={{
                  color: m.changePercent >= 0 ? "#6EE7A8" : "#FCA5A5",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span aria-hidden>{m.changePercent >= 0 ? "▲" : "▼"}</span>{" "}
                <span className="sr-only">{m.changePercent >= 0 ? "افزایش" : "کاهش"} </span>
                {formatPercent(Math.abs(m.changePercent))}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      <Link
        href="/market"
        className="mt-3 flex items-center justify-between rounded-xl px-3 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-light)]"
        style={{ minHeight: 44, background: "rgba(248,250,252,0.10)", color: "var(--text-on-navy)" }}
      >
        همهٔ بازار — شاخص، سهام، صندوق‌ها، طلا و ارز
        <ArrowLeft size={14} aria-hidden />
      </Link>
    </div>
  );
}

export default function Hero() {
  return (
    <section
      className="relative"
      style={{ background: "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)" }}
    >
      {/* ارتفاعِ بنر عمداً کم شد تا در ۱۴۴۰×۹۰۰ پنلِ بازار هم توی نمای اول بیاید. */}
      <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-12 sm:pb-16 sm:pt-16">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="max-w-2xl">
          <p
            className="anim-rise anim-d1 text-xs sm:text-sm font-bold tracking-wide"
            style={{ color: "var(--gold-light)" }}
          >
            تحلیلگر و مشاور سرمایه‌گذاری · بازار سرمایهٔ ایران
          </p>

          <div
            aria-hidden
            className="anim-rise anim-d1 my-5"
            style={{ height: 2, width: 56, background: "var(--gold)", borderRadius: 2 }}
          />

          <h1
            className="font-display anim-rise anim-d2"
            style={{
              color: "var(--text-on-navy)",
              fontSize: "clamp(2.1rem, 5.2vw, 3.25rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            آرش صفری
          </h1>

          {/*
            ── ادعای همگانی‌ای که اینجا بود و حذف شد ─────────────────────────
            «هر تحلیل فرض‌ها و سناریوهایش را همراه دارد» یک گزارهٔ **همگانی**
            بود که همین صفحه نقضش می‌کرد: `InsightsPreview` مطالبِ خامِ تلگرام
            و اینستاگرام را از `content_hub` رندر می‌کند و آن‌ها فقط عنوان،
            پلتفرم و تاریخ دارند — نه فرض، نه سناریو. پس «هر تحلیل» روی همین
            صفحه غلط بود.

            جایش گزارهٔ **شرطی** آمده: «تحلیلی که وارد کارنامه شود…». این دربارهٔ
            کارنامه است، نه دربارهٔ هر چیزی که در صفحه دیده می‌شود، و پشتوانه‌اش
            append-only بودنِ `signals` است — نه یک وعده.

            هر سه جمله روی همین صفحه قابلِ راستی‌آزمایی‌اند:
              ۱ وضعیتِ بازار + زمانِ به‌روزرسانی → MarketTicker و LiveMarket
              ۲ مطالبِ منتشرشده + منبع و تاریخ   → InsightsPreview
              ۳ تغییرناپذیریِ کارنامه            → Method و /analyses
          */}
          <p
            className="anim-rise anim-d3 mt-5 text-base"
            style={{ color: "rgba(248,250,252,0.82)", lineHeight: 1.9 }}
          >
            وضعیتِ روزِ بازار با زمانِ به‌روزرسانی، و مطالبِ منتشرشده با منبع و
            تاریخ. تحلیلی که وارد کارنامه شود، پس از انتشار تغییر نمی‌کند.
            بدونِ وعدهٔ سود.
          </p>

          <div className="anim-rise anim-d4 mt-7 flex flex-wrap items-center gap-3">
            <Link href="/market" className="btn btn-gold">
              ورود به میز بازار
              <ArrowLeft size={16} />
            </Link>
            <Link href="/about" className="btn btn-on-navy">
              آشنایی با روش تحلیل آرش
            </Link>
          </div>
        </div>

        {/* نمای واقعیِ محصول — نه تصویرِ ساختگیِ داشبورد. */}
        <div className="min-w-0">
          <MarketGlance />
        </div>
        </div>
      </div>
    </section>
  );
}
