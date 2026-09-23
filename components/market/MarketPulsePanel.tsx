/**
 * نبضِ بازار و جریانِ پول — ستونِ مکملِ ردیفِ سوم (یک‌سومِ عرض).
 *
 * محتوایش از `TodayDashboard` آمده، ولی **فشرده** شده تا کنارِ نمودارِ منتخب
 * جا بگیرد: هیستوگرام + خالصِ پولِ حقیقی، بدونِ کارت‌های سرانه که به بخشِ
 * جزئیات منتقل شده‌اند. هیچ محاسبه‌ای اینجا نیست؛ هر دو ورودی از
 * `lib/core/marketToday.ts` می‌آیند.
 */
import type { MarketPulse, MoneyFlowToday } from "@/lib/core/marketToday";
import { toPersianDigits, formatTomanShort } from "@/lib/format";
import PulseHistogram from "./PulseHistogram";

export default function MarketPulsePanel({
  pulse,
  flow,
  /** جامعهٔ کلِ اسنپ‌شات — برای گفتنِ «از چند نماد» */
  universe,
}: {
  pulse: MarketPulse;
  flow: MoneyFlowToday;
  universe: number;
}) {
  const hasMarket = pulse.totalTraded > 0;

  return (
    <div className="card flex flex-col gap-4 px-4 py-4 sm:px-5">
      <div>
        <h2 className="font-display text-[15px] font-bold" style={{ color: "var(--heading)" }}>
          نبض بازار سهام
        </h2>
        {/* جامعهٔ نسبت صریح است. «٪۷۷ نمادها مثبت» بدونِ گفتنِ «از کدام نمادها»
            همان چیزی است که دو عددِ متفاوت در یک صفحه می‌سازد. */}
        <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
          {hasMarket
            ? `از ${toPersianDigits(pulse.totalTraded)} نمادِ معامله‌شدهٔ امروز (کلِ اسنپ‌شات: ${toPersianDigits(universe)})`
            : "پس از شروع معاملات به‌روز می‌شود"}
        </p>
      </div>

      {hasMarket ? (
        <PulseHistogram pulse={pulse} />
      ) : (
        <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
          خارج از ساعاتِ بازار — هنوز نمادی معامله نشده است.
        </p>
      )}

      <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
          خالص خرید حقیقی
        </p>
        {flow.netRealFlowToman != null ? (
          <p
            className="mt-0.5 font-display text-lg font-extrabold"
            style={{
              color: flow.netRealFlowToman >= 0 ? "var(--success)" : "var(--danger)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {/* واژهٔ «ورود/خروج» توصیف است، نه تجویز — و رنگ تنها حاملِ معنا نیست. */}
            {flow.netRealFlowToman >= 0 ? "ورود " : "خروج "}
            {formatTomanShort(Math.abs(flow.netRealFlowToman))}
          </p>
        ) : (
          <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--text-3)" }}>
            —
            <span className="mr-2 text-[11px] font-normal">
              دادهٔ حقیقی/حقوقی در اسنپ‌شات امروز نیامده
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
