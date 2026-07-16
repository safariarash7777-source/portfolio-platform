// ترمینال › تخصیص دارایی — بک‌تست سبدهای چنددارایی با ریبالانس فصلی.
// سه سبد پیش‌فرض (محافظه‌کار/متعادل/تهاجمی) از نمادهای دارای تاریخچهٔ واقعی؛
// هر عدد با فروض شفاف؛ هیچ توصیه‌ای — فقط چارچوب تحلیلی.

import Link from "next/link";
import { getSymbolHistory } from "@/lib/core/history";
import { runAllocation, type AssetSeries, type AllocationResult } from "@/lib/core/allocation";
import { IRAN_EQUITY_COSTS, IRAN_FUND_COSTS } from "@/lib/core/backtest";
import AllocationChart from "@/components/terminal/AllocationChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "تخصیص دارایی | ترمینال تحلیلگر" };

const HISTORY_DAYS = 1500; // ~۶ سال معاملاتی

interface PresetAsset {
  symbol: string;
  label: string;
  weight: number;
  kind: "equity" | "fund";
}
interface Preset {
  key: string;
  title: string;
  desc: string;
  assets: PresetAsset[];
}

// نمادها از universe دارای تاریخچهٔ ۲۰ ساله در symbol_history انتخاب شده‌اند.
const PRESETS: Preset[] = [
  {
    key: "conservative",
    title: "محافظه‌کار",
    desc: "درآمد ثابت‌محور با پوشش طلا و کمی سهام بزرگ",
    assets: [
      { symbol: "اعتماد", label: "درآمد ثابت (اعتماد)", weight: 0.5, kind: "fund" },
      { symbol: "طلا", label: "صندوق طلا (طلا)", weight: 0.3, kind: "fund" },
      { symbol: "فولاد", label: "سهام (فولاد)", weight: 0.2, kind: "equity" },
    ],
  },
  {
    key: "balanced",
    title: "متعادل",
    desc: "توزیع نزدیک به سبد نمونهٔ سایت: سهام/طلا/درآمد ثابت",
    assets: [
      { symbol: "فولاد", label: "سهام (فولاد)", weight: 0.25, kind: "equity" },
      { symbol: "فملی", label: "سهام (فملی)", weight: 0.2, kind: "equity" },
      { symbol: "عیار", label: "صندوق طلا (عیار)", weight: 0.3, kind: "fund" },
      { symbol: "اعتماد", label: "درآمد ثابت (اعتماد)", weight: 0.25, kind: "fund" },
    ],
  },
  {
    key: "aggressive",
    title: "تهاجمی",
    desc: "سهام‌محور با پوشش طلا",
    assets: [
      { symbol: "فملی", label: "سهام (فملی)", weight: 0.3, kind: "equity" },
      { symbol: "فولاد", label: "سهام (فولاد)", weight: 0.25, kind: "equity" },
      { symbol: "شپنا", label: "سهام (شپنا)", weight: 0.2, kind: "equity" },
      { symbol: "عیار", label: "صندوق طلا (عیار)", weight: 0.25, kind: "fund" },
    ],
  },
];

const fmtPct = (x: number | null): string =>
  x == null ? "—" : `${x > 0 ? "+" : ""}${x.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;
const fmtNum = (x: number | null): string =>
  x == null ? "—" : x.toLocaleString("fa-IR", { maximumFractionDigits: 2 });

async function buildPreset(p: Preset): Promise<{ preset: Preset; result: AllocationResult }> {
  const series: AssetSeries[] = await Promise.all(
    p.assets.map(async (a) => ({
      name: a.label,
      weight: a.weight,
      days: await getSymbolHistory(a.symbol, HISTORY_DAYS),
      costs: a.kind === "fund" ? IRAN_FUND_COSTS : IRAN_EQUITY_COSTS,
    }))
  );
  return { preset: p, result: runAllocation(series, 63) };
}

export default async function AllocationPage() {
  const built = await Promise.all(PRESETS.map(buildPreset));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black" style={{ color: "var(--navy-deep)" }}>
            تخصیص دارایی — بک‌تست سبدهای چنددارایی
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
            ریبالانس هر ۶۳ روز معاملاتی (≈ فصلی) · هزینهٔ واقعی معاملات · فقط تاریخ‌های مشترک همهٔ دارایی‌ها
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/terminal" className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
            ترمینال
          </Link>
          <Link href="/terminal/watchlist" className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
            واچ‌لیست
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-8">
        {built.map(({ preset, result }) => {
          const m = result.metrics;
          return (
            <section
              key={preset.key}
              className="rounded-2xl border p-5 sm:p-6"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
                    سبد {preset.title}
                  </h2>
                  <p className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                    {preset.desc}
                  </p>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-3)" }} dir="rtl">
                  {preset.assets.map((a) => `${a.label} ${Math.round(a.weight * 100)}٪`).join(" · ")}
                </p>
              </div>

              {m == null ? (
                <p className="mt-4 text-sm" style={{ color: "var(--text-3)" }}>
                  دادهٔ کافی برای بک‌تست این سبد موجود نیست
                  {result.dropped.length > 0 && ` (دادهٔ ناکافی: ${result.dropped.join("، ")})`}.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {[
                      { l: "بازده سبد (با ریبالانس)", v: fmtPct(m.totalReturnPct) },
                      { l: "بازده بدون ریبالانس", v: fmtPct(m.holdReturnPct) },
                      { l: "CAGR", v: fmtPct(m.cagrPct) },
                      { l: "حداکثر افت", v: `−${fmtNum(m.maxDrawdownPct)}٪` },
                      { l: "نوسان سالانه", v: m.annualVolatilityPct == null ? "—" : `${fmtNum(m.annualVolatilityPct)}٪` },
                      { l: "شارپ", v: fmtNum(m.sharpe) },
                      { l: "هزینهٔ کل ریبالانس", v: m.totalCostPct == null ? "—" : `${fmtNum(m.totalCostPct)}٪` },
                    ].map((s) => (
                      <div
                        key={s.l}
                        className="rounded-xl px-3 py-2.5"
                        style={{ background: "var(--surface-2)" }}
                      >
                        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                          {s.l}
                        </p>
                        <p
                          className="mt-0.5 text-sm font-extrabold"
                          style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
                        >
                          {s.v}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <AllocationChart
                      points={result.points.map((pt) => ({
                        time: Math.floor(new Date(pt.date + "T00:00:00Z").getTime() / 1000),
                        value: pt.value,
                        holdValue: pt.holdValue,
                      }))}
                    />
                  </div>

                  <p className="mt-3 text-[11.5px] leading-6" style={{ color: "var(--text-3)" }}>
                    بازهٔ {m.startDate} تا {m.endDate} ({m.tradingDays.toLocaleString("fa-IR")} روز معاملاتی مشترک) ·{" "}
                    {m.rebalanceCount.toLocaleString("fa-IR")} ریبالانس · فروض: {result.assumptions.join("؛ ")}.
                  </p>
                </>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-[11.5px] leading-6" style={{ color: "var(--text-3)" }}>
        این صفحه چارچوب تحلیلی داخلی است؛ عملکرد گذشته تضمین آینده نیست و هیچ‌کدام از اعداد توصیهٔ
        خرید یا فروش نیست. منبع داده: symbol_history (تاریخچهٔ رسمی معاملات).
      </p>
    </div>
  );
}
