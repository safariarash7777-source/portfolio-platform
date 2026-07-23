"use client";
// ابر داشبورد ارز ادمین — /admin/fx (پورت TS داشبورد Streamlit آرش)
//
// ۶ تب: ① نرخ زنده + مقایسهٔ مدل‌ها ② پیش‌بینی رو به جلو ③ تحلیل حساسیت
// ④ حباب طلا/سکه ⑤ رصد بازار (اتصال به /admin/radar) ⑥ به‌روزرسانی دیتا.
// اصل «اتصال، نه دوباره‌سازی»: هم‌پوشانی با امکانات موجود سایت لینک می‌شود.
// مدل‌های سنگین (PSY/GARCH/MC) در مرحلهٔ ۲ (پیش‌محاسبهٔ پایتون + Supabase).

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  pppSeries,
  pppMultiBase,
  monetarySeries,
  ensembleValuation,
  bubbleGap,
  forecastForward,
  oilSensitivity,
  deficitSensitivity,
  buildHeatmap,
  tornadoData,
  type SensitivityBase,
} from "@/lib/fx/engine";
import type { FxDashboardData, HeavyAnalytics } from "@/lib/fx/dataLoader";
import { gregorianYmdToJalali } from "@/lib/fx/jalaliConvert";
import FxSeedManager from "./FxSeedManager";
import FxBacktestTab from "./FxBacktestTab";
import { toPersianDigits } from "@/lib/format";

/* ── فرمت‌کننده‌ها ── */
function fa(v: number, digits = 0): string {
  return toPersianDigits(
    v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
  );
}
function faPct(v: number, digits = 1): string {
  return `${toPersianDigits(v.toFixed(digits))}٪`;
}

/* ── تب‌ها ── */
const TABS = [
  { key: "models", label: "نرخ زنده و مدل‌ها" },
  { key: "forecast", label: "پیش‌بینی رو به جلو" },
  { key: "sensitivity", label: "تحلیل حساسیت" },
  { key: "stats", label: "آزمون‌های آماری" },
  { key: "gold", label: "حباب طلا و سکه" },
  { key: "watch", label: "رصد بازار" },
  { key: "backtest", label: "صحت پیش‌بینی" },
  { key: "data", label: "به‌روزرسانی دیتا" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const CHART_COLORS = {
  market: "#0f3d5c",
  ppp: "#b8860b",
  monetary: "#7c3aed",
  ensemble: "#0d9488",
};

/* پایه‌های چندگانهٔ PPP — همان ۳ پایهٔ آزمون‌شدهٔ پایتون */
const MULTI_BASES = [1381, 1390, 1396];

function Card({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | null;
}) {
  const color = tone === "pos" ? "var(--green-strong, #15803d)" : tone === "neg" ? "var(--red-strong, #b91c1c)" : "var(--navy-deep)";
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-1"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-3)" }}>{title}</span>
      <span className="font-display text-xl font-bold" style={{ color }}>{value}</span>
      {sub ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{sub}</span> : null}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "٪",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-2)" }}>
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <b style={{ color: "var(--navy-deep)" }}>{toPersianDigits(String(value))}{suffix}</b>
      </span>
      <input
        type="range"
        dir="ltr"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--navy-deep)]"
      />
    </label>
  );
}

export default function AdminFxDashboard({ data, heavy }: { data: FxDashboardData; heavy: HeavyAnalytics | null }) {
  const [tab, setTab] = useState<TabKey>("models");

  /* ── سری‌های مدل (یک‌بار محاسبه) ── */
  const series = useMemo(() => {
    const bases: Record<number, number> = {};
    for (const y of MULTI_BASES) {
      const r = data.baseRates[String(y)];
      if (r > 0) bases[y] = r;
    }
    const br1381 = data.baseRates["1381"] ?? 799;
    const ppp = pppSeries(data.macro, 1381, br1381);
    const pppMulti = pppMultiBase(data.macro, bases).mean;
    const monetary = monetarySeries(data.macro, 1381, br1381);
    return { ppp, pppMulti, monetary };
  }, [data.macro, data.baseRates]);

  /* ── ردیف‌های نمودار مقایسهٔ مدل‌ها (۱۳۸۱..آخرین سال) ── */
  const modelRows = useMemo(() => {
    const years = [...series.ppp.keys()].sort((a, b) => a - b);
    return years.map((y) => ({
      year: y,
      market: data.marketAnnual[y] ?? (data.baseRates[String(y)] > 0 ? data.baseRates[String(y)] : null),
      ppp: series.pppMulti.get(y) ?? null,
      monetary: series.monetary.get(y) ?? null,
    }));
  }, [series, data.marketAnnual, data.baseRates]);

  /* ── ارزش‌گذاری امروز (آخرین سال داده) ── */
  const valuation = useMemo(() => {
    const lastYear = Math.max(...series.ppp.keys());
    const ppp = series.pppMulti.get(lastYear) ?? null;
    const mon = series.monetary.get(lastYear) ?? null;
    const vals: Record<string, number> = {};
    if (ppp != null && ppp > 0) vals.ppp = ppp;
    if (mon != null && mon > 0) vals.monetary = mon;
    const ens = ensembleValuation(vals);
    const live = data.liveUsdToman;
    return {
      lastYear,
      ppp,
      mon,
      ens,
      gapPpp: bubbleGap(live, ppp),
      gapMon: bubbleGap(live, mon),
      gapEns: bubbleGap(live, ens),
    };
  }, [series, data.liveUsdToman]);

  /* ── فرضیات پیش‌بینی (sliders) ── */
  const lastMacro = data.macro[data.macro.length - 1];
  const [inflIran, setInflIran] = useState(Math.round(lastMacro?.infl_cbi ?? 40));
  const [inflUsa, setInflUsa] = useState(3);
  const [m2Iran, setM2Iran] = useState(Math.round(lastMacro?.m2_growth ?? 35));
  const [gdpIran, setGdpIran] = useState(Math.round(lastMacro?.gdp_growth ?? 0));
  const [deltaV, setDeltaV] = useState(0);
  const [horizon, setHorizon] = useState(12);

  const forecast = useMemo(() => {
    if (data.liveUsdToman == null || !data.liveRateShamsi) return [];
    return forecastForward(data.liveUsdToman, data.liveRateShamsi, horizon, {
      inflIran,
      inflUsa,
      m2Iran,
      m2Usa: 5,
      gdpIran,
      gdpUsa: 2,
      deltaV,
    });
  }, [data.liveUsdToman, data.liveRateShamsi, horizon, inflIran, inflUsa, m2Iran, gdpIran, deltaV]);

  /* ── حساسیت ── */
  const [oilPrice, setOilPrice] = useState(70);
  const [oilElast, setOilElast] = useState(-0.3);
  const sensBase: SensitivityBase | null = useMemo(() => {
    if (data.liveUsdToman == null) return null;
    return {
      baseRate: data.liveUsdToman,
      baseInflation: inflIran,
      baseOilPrice: oilPrice,
      baseMoneyGrowth: m2Iran,
      oilElasticityPer5usd: oilElast,
      deficitToInflation: 0.6,
    };
  }, [data.liveUsdToman, inflIran, m2Iran, oilPrice, oilElast]);

  const oilRows = useMemo(() => (sensBase ? oilSensitivity(sensBase) : []), [sensBase]);
  const defRows = useMemo(() => (sensBase ? deficitSensitivity(sensBase) : []), [sensBase]);
  const heat = useMemo(() => (sensBase ? buildHeatmap(sensBase) : null), [sensBase]);
  const tornado = useMemo(() => (sensBase ? tornadoData(sensBase) : []), [sensBase]);

  /* ── حباب طلا (اونس جهانی معادل) ── */
  const gold18 = data.gold.find((g) => g.id === "IR_GOLD_18K") ?? null;
  const coinEmami = data.gold.find((g) => g.id === "IR_COIN_EMAMI") ?? null;
  // ارزش ذاتی سکهٔ امامی: وزن ناخالص ۸.۱۳۳ گرم با عیار ۹۰۰ → طلای خالص ۷.۳۱۹۷ گرم (۲۴ عیار)
  // = معادل ۹.۷۵۹۶ گرم ۱۸ عیار (×24/18). قبلاً به‌اشتباه کل ۸.۱۳۳ گرم، ۲۴ عیار فرض شده بود.
  const COIN_GROSS_GRAMS = 8.133;
  const COIN_FINENESS = 0.9; // عیار ۹۰۰ سکهٔ بهار آزادی/امامی
  const coinPureGold24 = COIN_GROSS_GRAMS * COIN_FINENESS; // 7.3197 گرم طلای خالص
  const coinIntrinsic = gold18 ? gold18.priceToman * (coinPureGold24 * (24 / 18)) : null;
  const coinGap = coinEmami && coinIntrinsic ? bubbleGap(coinEmami.priceToman, coinIntrinsic) : null;

  const heatColor = (v: number, min: number, max: number) => {
    const t = max > min ? (v - min) / (max - min) : 0.5;
    // سبز (ارزان) → قرمز (گران)
    const r = Math.round(178 + t * (185 - 178));
    const g = Math.round(220 - t * (220 - 76));
    const b = Math.round(190 - t * (190 - 60));
    return `rgb(${r},${g},${b})`;
  };

  const liveDateFa = data.liveRateShamsi ? toPersianDigits(data.liveRateShamsi) : "—";

  /* برچسب منبع هر seed در جدول وضعیت — override زنده یا seed ریپو */
  const srcLabel = (kind: string): string => {
    const s = data.seedSources?.find((x) => x.kind === kind);
    return s?.source === "supabase" ? "آپلود زنده (Supabase)" : "seed در ریپو — از همین تب قابل به‌روزرسانی";
  };

  return (
    <div className="space-y-6">
      {/* نوار تب‌ها */}
      <div
        className="flex flex-wrap gap-1 rounded-xl border p-1"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: tab === t.key ? "var(--navy-deep)" : "transparent",
              color: tab === t.key ? "var(--text-on-navy, #fff)" : "var(--text-2)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* بنر دامنهٔ پوشش — شفافیت نیمهٔ سبک/سنگین */}
      <div
        className="rounded-lg border px-3 py-2 text-[12px]"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}
      >
        پوشش فعلی = نیمهٔ سبک (زنده): PPP چندپایه · مدل پولی · حساسیت · پیش‌بینی رو به جلو · حباب سکه.
        آزمون آماری حباب (PSY/GSADF)، GARCH و مونت‌کارلو هنوز زنده نیستند — مرحلهٔ ۲ (پیش‌محاسبهٔ پایتون + Supabase).
        همهٔ سنجه‌ها توصیفی‌اند، نه توصیه — این کارت‌ها بدون حذف رنگ‌بندی/قضاوت نباید به صفحات عمومی منتقل شوند.
      </div>

      {/* ── تب ۱: نرخ زنده + مقایسهٔ مدل‌ها ── */}
      {tab === "models" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card
              title="نرخ زندهٔ دلار (تومان)"
              value={data.liveUsdToman != null ? fa(data.liveUsdToman) : "—"}
              sub={`آخرین ثبت: ${liveDateFa}`}
            />
            <Card
              title={`PPP چندپایه (${toPersianDigits(String(valuation.lastYear))})`}
              value={valuation.ppp != null ? fa(valuation.ppp) : "—"}
              sub={valuation.gapPpp != null ? `شکاف بازار: ${faPct(valuation.gapPpp)} (توصیفی)` : undefined}
            />
            <Card
              title={`مدل پولی (${toPersianDigits(String(valuation.lastYear))})`}
              value={valuation.mon != null ? fa(valuation.mon) : "—"}
              sub={valuation.gapMon != null ? `شکاف بازار: ${faPct(valuation.gapMon)} (توصیفی)` : undefined}
            />
            <Card
              title="میانگین هندسی مدل‌ها"
              value={valuation.ens != null ? fa(valuation.ens) : "—"}
              sub={valuation.gapEns != null ? `شکاف بازار: ${faPct(valuation.gapEns)} (توصیفی)` : undefined}
            />
          </div>

          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
              مسیر تاریخی مدل‌ها در برابر بازار (۱۳۸۱ تاکنون — مقیاس لگاریتمی)
            </h3>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>
              PPP چندپایه (میانگین هندسی پایه‌های ۱۳۸۱/۱۳۹۰/۱۳۹۶) · مدل پولی (پایهٔ ۱۳۸۱) ·
              بازار = میانگین سالانهٔ fx_rates + نرخ‌های پایهٔ تاریخی. منبع: اکسل کلان آرش + رلهٔ زنده.
              توجه: دنبالهٔ زندهٔ fx_rates هنوز کم‌عمق است (رله روزانه یک ردیف می‌افزاید و به‌مرور عمیق می‌شود)؛
              سال‌های گذشتهٔ خط «بازار» عمدتاً از نرخ‌های پایهٔ تاریخی (seed) است.
            </p>
            <div dir="ltr" style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer>
                <LineChart data={modelRows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    tickFormatter={(v) => toPersianDigits(String(v))}
                  />
                  <YAxis
                    orientation="right"
                    scale="log"
                    domain={["auto", "auto"]}
                    tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    tickFormatter={(v) => fa(Number(v))}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")}
                    labelFormatter={(l) => `سال ${toPersianDigits(String(l))}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="market" name="بازار" stroke={CHART_COLORS.market} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="ppp" name="PPP چندپایه" stroke={CHART_COLORS.ppp} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="monetary" name="مدل پولی" stroke={CHART_COLORS.monetary} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── تب ۲: پیش‌بینی رو به جلو ── */}
      {tab === "forecast" && (
        <div className="space-y-6">
          <div
            className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <SliderRow label="تورم ایران (سالانه)" value={inflIran} min={10} max={90} step={1} onChange={setInflIran} />
            <SliderRow label="تورم آمریکا (سالانه)" value={inflUsa} min={0} max={10} step={0.5} onChange={setInflUsa} />
            <SliderRow label="رشد نقدینگی ایران" value={m2Iran} min={10} max={60} step={1} onChange={setM2Iran} />
            <SliderRow label="رشد GDP ایران" value={gdpIran} min={-10} max={10} step={0.5} onChange={setGdpIran} />
            <SliderRow label="Δ سرعت گردش پول" value={deltaV} min={-10} max={15} step={0.5} onChange={setDeltaV} />
            <SliderRow label="افق پیش‌بینی (ماه)" value={horizon} min={3} max={24} step={1} onChange={setHorizon} suffix=" ماه" />
          </div>

          {forecast.length === 0 ? (
            <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}>
              نرخ زندهٔ دلار در دسترس نیست — پیش‌بینی بدون نقطهٔ شروع ممکن نیست.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card title="نقطهٔ شروع (نرخ زنده)" value={fa(data.liveUsdToman!)} sub={liveDateFa} />
                <Card title={`مسیر PPP — ماه ${toPersianDigits(String(Math.min(6, horizon)))}`} value={fa(forecast[Math.min(5, forecast.length - 1)].ppp)} />
                <Card title={`مسیر PPP — ماه ${toPersianDigits(String(horizon))}`} value={fa(forecast[forecast.length - 1].ppp)} />
                <Card title={`مسیر پولی — ماه ${toPersianDigits(String(horizon))}`} value={fa(forecast[forecast.length - 1].monetary)} />
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
                  مسیر ماهانهٔ پیش‌بینی (ترکیب ماهانه از فرضیات سالانه)
                </h3>
                <div dir="ltr" style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    <LineChart data={forecast} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="monthLabel" tick={{ fill: "var(--text-3)", fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => fa(Number(v))} width={70} />
                      <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} />
                      <Legend />
                      <ReferenceLine y={data.liveUsdToman!} stroke="var(--text-3)" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="ppp" name="مسیر PPP" stroke={CHART_COLORS.ppp} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="monetary" name="مسیر پولی" stroke={CHART_COLORS.monetary} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── تب ۳: تحلیل حساسیت ── */}
      {tab === "sensitivity" && (
        <div className="space-y-6">
          {!sensBase ? (
            <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}>
              نرخ زندهٔ دلار در دسترس نیست.
            </div>
          ) : (
            <>
              <div
                className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <SliderRow label="قیمت پایهٔ نفت (دلار/بشکه)" value={oilPrice} min={40} max={120} step={5} onChange={setOilPrice} suffix=" $" />
                <SliderRow label="کشش نفت (٪ به‌ازای ۵ دلار)" value={oilElast} min={-2} max={0} step={0.1} onChange={setOilElast} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>حساسیت به قیمت نفت</h3>
                  <div dir="ltr" style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={oilRows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="oil" tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => `$${toPersianDigits(String(v))}`} />
                        <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => fa(Number(v))} width={70} />
                        <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} labelFormatter={(l) => `نفت $${toPersianDigits(String(l))}`} />
                        <Line type="monotone" dataKey="rate" name="نرخ دلار" stroke={CHART_COLORS.market} strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>حساسیت به کسری بودجه (٪ از بودجه)</h3>
                  <div dir="ltr" style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={defRows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="deficit" tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => faPct(Number(v), 0)} />
                        <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => fa(Number(v))} width={70} />
                        <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} labelFormatter={(l) => `کسری ${faPct(Number(l), 0)}`} />
                        <Line type="monotone" dataKey="rate" name="نرخ دلار" stroke={CHART_COLORS.monetary} strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
                  نمودار تورنادو — دامنهٔ اثر شوک ±۲۰٪ هر عامل
                </h3>
                <div dir="ltr" style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={tornado} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                      <XAxis type="number" domain={["auto", "auto"]} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => fa(Number(v))} />
                      <YAxis type="category" dataKey="factor" orientation="right" tick={{ fill: "var(--text-2)", fontSize: 12 }} width={90} />
                      <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} />
                      <Bar dataKey="range" name="دامنهٔ نرخ (پایین تا بالا)" radius={[0, 4, 4, 0]}>
                        {tornado.map((t) => (
                          <Cell key={t.factor} fill={CHART_COLORS.ppp} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {heat && (
                <div className="rounded-xl border p-4 overflow-x-auto" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
                    نقشهٔ حرارتی سناریو — نفت (ستون) × کسری بودجه (ردیف)، نرخ دلار (تومان)
                  </h3>
                  {(() => {
                    const flat = heat.matrix.flat();
                    const mn = Math.min(...flat);
                    const mx = Math.max(...flat);
                    return (
                      <table className="text-[11px] w-full border-collapse" dir="rtl">
                        <thead>
                          <tr>
                            <th className="p-1 text-right" style={{ color: "var(--text-3)" }}>کسری \ نفت</th>
                            {heat.oils.map((o) => (
                              <th key={o} className="p-1 font-normal" style={{ color: "var(--text-3)" }}>${toPersianDigits(String(o))}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {heat.deficits.map((d, i) => (
                            <tr key={d}>
                              <td className="p-1" style={{ color: "var(--text-3)" }}>{faPct(d, 0)}</td>
                              {heat.matrix[i].map((v, j) => (
                                <td key={j} className="p-1 text-center rounded" style={{ background: heatColor(v, mn, mx), color: "#1a2233" }}>
                                  {fa(v / 1000, 1)}K
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── تب: آزمون‌های آماری (مدل‌های سنگین — پیش‌محاسبهٔ پایتون) ── */}
      {tab === "stats" && (
        <div className="space-y-6">
          {!heavy ? (
            <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}>
              هنوز هیچ محاسبهٔ سنگینی ثبت نشده است. اسکریپت{" "}
              <code dir="ltr">scripts/fx-precompute-heavy.py</code>{" "}
              را روی PC اجرا کن تا آزمون حباب (PSY)، نوسان (GARCH) و بازهٔ احتمالاتی (مونت‌کارلو) اینجا نمایش داده شود.
            </div>
          ) : (
            <>
              {/* بنر تازگی — این نتایج «زنده» نیستند */}
              <div
                className="rounded-xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs"
                style={{ borderColor: "var(--gold)", background: "var(--surface)", color: "var(--text-2)" }}
              >
                <span>محاسبه‌شده در: <b style={{ color: "var(--navy-deep)" }}>{toPersianDigits(gregorianYmdToJalali(heavy.computed_at.slice(0, 10)) ?? heavy.computed_at.slice(0, 10))}</b></span>
                <span>فرکانس داده: <b style={{ color: "var(--navy-deep)" }}>{heavy.frequency === "monthly" ? "ماهانه" : heavy.frequency === "daily" ? "روزانه" : "سالانه"}</b></span>
                <span>مشاهده: <b style={{ color: "var(--navy-deep)" }}>{heavy.n_obs != null ? toPersianDigits(String(heavy.n_obs)) : "—"}</b></span>
                <span>seed: <b dir="ltr" style={{ color: "var(--navy-deep)" }}>{heavy.mc_seed ?? "—"}</b></span>
                <span style={{ color: "var(--text-3)" }}>— پیش‌محاسبهٔ پایتون؛ توصیفی، نه توصیه.</span>
              </div>

              {/* PSY / GSADF */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
                  آزمون حباب PSY / GSADF — {heavy.results.psy?.series ?? "—"}
                </h3>
                {heavy.results.psy?.available ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card title="آمارهٔ GSADF" value={heavy.results.psy.gsadf_stat != null ? fa(heavy.results.psy.gsadf_stat, 3) : "—"} />
                      <Card title="مقدار بحرانی ۹۵٪" value={heavy.results.psy.crit ? fa(heavy.results.psy.crit["95"], 3) : "—"} />
                      <Card title="مقدار بحرانی ۹۹٪" value={heavy.results.psy.crit ? fa(heavy.results.psy.crit["99"], 3) : "—"} />
                      <Card title="مشاهده / شبیه‌سازی" value={`${toPersianDigits(String(heavy.results.psy.n_obs ?? "—"))} / ${toPersianDigits(String(heavy.results.psy.sim_reps ?? "—"))}`} />
                    </div>
                    {heavy.results.psy.verdict && (
                      <p className="mt-3 text-sm" style={{ color: "var(--text-1)" }}>
                        <b style={{ color: "var(--navy-deep)" }}>نتیجه:</b> {heavy.results.psy.verdict}
                      </p>
                    )}
                    {heavy.results.psy.note && (
                      <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>{heavy.results.psy.note}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>غیرفعال — {heavy.results.psy?.reason}</p>
                )}
              </div>

              {/* GARCH(1,1) */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>نوسان GARCH(1,1)</h3>
                {heavy.results.garch?.available ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card
                        title="نوسان جاری (سالانه)"
                        value={heavy.results.garch.current_cond_vol_annual_pct != null ? faPct(heavy.results.garch.current_cond_vol_annual_pct) : (heavy.results.garch.annualized_vol_pct != null ? faPct(heavy.results.garch.annualized_vol_pct) : "—")}
                        sub="از σ ماهانهٔ آخر ×√۱۲"
                      />
                      <Card title="پایداری (α+β)" value={heavy.results.garch.persistence != null ? fa(heavy.results.garch.persistence, 3) : "—"} />
                      <Card title="α (اثر شوک)" value={heavy.results.garch.alpha != null ? fa(heavy.results.garch.alpha, 3) : "—"} />
                      <Card title="β (پایداری واریانس)" value={heavy.results.garch.beta != null ? fa(heavy.results.garch.beta, 3) : "—"} />
                    </div>
                    {heavy.results.garch.note && (
                      <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>{heavy.results.garch.note}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>غیرفعال — {heavy.results.garch?.reason}</p>
                )}
              </div>

              {/* مونت‌کارلو */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-1" style={{ color: "var(--navy-deep)" }}>مونت‌کارلو — بازهٔ احتمالاتیِ نرخ دلار</h3>
                {heavy.results.montecarlo?.available && heavy.results.montecarlo.months ? (
                  (() => {
                    const mc = heavy.results.montecarlo!;
                    const rows = (mc.months ?? []).map((m, i) => ({
                      month: m,
                      p05: mc.p05?.[i] ?? null,
                      p50: mc.p50?.[i] ?? null,
                      p95: mc.p95?.[i] ?? null,
                    }));
                    const a = mc.assumptions ?? {};
                    return (
                      <>
                        <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>
                          شروع {mc.start_rate != null ? fa(mc.start_rate) : "—"} تومان · افق {toPersianDigits(String(mc.horizon_months ?? "—"))} ماه ·{" "}
                          {toPersianDigits(String(mc.n_sims ?? "—"))} مسیر · دریفت: {a.drift_model ?? "—"} · نوسان{" "}
                          {a.vol_source === "estimated" ? "برآوردی" : "فرضیِ"} {a.annual_vol != null ? faPct(a.annual_vol * 100, 0) : "—"}
                        </p>
                        <div dir="ltr" style={{ width: "100%", height: 300 }}>
                          <ResponsiveContainer>
                            <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                              <XAxis dataKey="month" tick={{ fill: "var(--text-3)", fontSize: 10 }} interval="preserveStartEnd" />
                              <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => fa(Number(v))} width={70} />
                              <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} />
                              <Legend />
                              <Line type="monotone" dataKey="p95" name="صدک ۹۵" stroke={CHART_COLORS.ppp} strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
                              <Line type="monotone" dataKey="p50" name="میانه" stroke={CHART_COLORS.market} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                              <Line type="monotone" dataKey="p05" name="صدک ۵" stroke={CHART_COLORS.monetary} strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        {mc.note && <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>{mc.note}</p>}
                      </>
                    );
                  })()
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>غیرفعال — داده کافی نیست.</p>
                )}
              </div>

              {/* هم‌جمعی */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>هم‌جمعی PPP (اعتبار بلندمدت)</h3>
                {heavy.results.cointegration?.available ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card title="آمارهٔ آزمون" value={heavy.results.cointegration.tstat != null ? fa(heavy.results.cointegration.tstat, 3) : "—"} />
                    <Card title="p-value" value={heavy.results.cointegration.pvalue != null ? fa(heavy.results.cointegration.pvalue, 3) : "—"} />
                    <div className="md:col-span-2 rounded-xl border p-4 flex flex-col justify-center" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>{heavy.results.cointegration.method}</span>
                      <span className="text-sm font-medium mt-1" style={{ color: "var(--navy-deep)" }}>{heavy.results.cointegration.verdict}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>غیرفعال — {heavy.results.cointegration?.reason}</p>
                )}
              </div>

              {/* یادداشت‌های صداقتِ داده */}
              {heavy.results.warnings && heavy.results.warnings.length > 0 && (
                <div className="rounded-xl border p-4 text-[12px]" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}>
                  <b style={{ color: "var(--navy-deep)" }}>یادداشت‌های صداقتِ داده:</b>
                  <ul className="list-disc pr-5 mt-1 space-y-1">
                    {heavy.results.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── تب ۴: حباب طلا و سکه ── */}
      {tab === "gold" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="طلای ۱۸ عیار (گرم)" value={gold18 ? fa(gold18.priceToman) : "—"} sub={gold18?.changePercent != null ? `تغییر: ${faPct(gold18.changePercent)}` : undefined} />
            <Card title="سکهٔ امامی (بازار)" value={coinEmami ? fa(coinEmami.priceToman) : "—"} />
            <Card title="ارزش ذاتی سکه (از گرم ۱۸)" value={coinIntrinsic != null ? fa(coinIntrinsic) : "—"} sub="۸.۱۳۳ گرم ناخالص × عیار ۹۰۰ = ۷.۳۲ گرم طلای خالص" />
            <Card
              title="حباب سکهٔ امامی"
              value={coinGap != null ? faPct(coinGap) : "—"}
              sub="سنجهٔ توصیفی — نه توصیه"
            />
          </div>

          {data.gold.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: "var(--navy-deep)" }}>نرخ‌های زندهٔ طلا و سکه (اسنپشات رله)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: "var(--text-3)" }}>
                    <th className="text-right p-2 font-normal">قلم</th>
                    <th className="text-left p-2 font-normal">قیمت (تومان)</th>
                    <th className="text-left p-2 font-normal">تغییر ٪</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gold.map((g) => (
                    <tr key={g.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="p-2" style={{ color: "var(--text-1)" }}>{g.faName}</td>
                      <td className="p-2 text-left font-medium" style={{ color: "var(--navy-deep)" }}>{fa(g.priceToman)}</td>
                      <td className="p-2 text-left" style={{ color: g.changePercent != null ? (g.changePercent >= 0 ? "#15803d" : "#b91c1c") : "var(--text-3)" }}>
                        {g.changePercent != null ? faPct(g.changePercent) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-2)" }}>
            <b style={{ color: "var(--navy-deep)" }}>اتصال، نه دوباره‌سازی:</b> تحلیل کامل حباب و NAV صندوق‌های طلا
            در تابلوی صندوق‌ها موجود است —{" "}
            <Link href="/market/funds" className="underline" style={{ color: "var(--navy-deep)" }}>
              تابلوی کامل صندوق‌ها (شامل صندوق‌های طلا)
            </Link>
            . سنجهٔ حباب این تب صرفاً سکهٔ فیزیکی در برابر ارزش ذاتی گرمی است.
          </div>
        </div>
      )}

      {/* ── تب ۵: رصد بازار (اتصال) ── */}
      {tab === "watch" && (
        <div className="space-y-4">
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <h3 className="text-base font-bold mb-2" style={{ color: "var(--navy-deep)" }}>رصد بازار — اسکرینر گلوگاه</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
              پنل رصد بازار (جریان پول حقیقی، قدرت خریدار، واگرایی تابلو، حجم نسبی و مشتق‌های ن-۳۰)
              به‌صورت مستقل در پنل ادمین فعال است. برای جلوگیری از دوباره‌سازی، این تب فقط میان‌بر است.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/radar"
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--navy-deep)", color: "var(--text-on-navy, #fff)" }}
              >
                رفتن به پنل رصد بازار
              </Link>
              <Link
                href="/market/funds"
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: "var(--line)", color: "var(--navy-deep)" }}
              >
                تابلوی صندوق‌ها
              </Link>
              <Link
                href="/market"
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: "var(--line)", color: "var(--navy-deep)" }}
              >
                نمای کل بازار
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── تب ۶: صحت پیش‌بینی (بک‌تست گذشته‌نگر) ── */}
      {tab === "backtest" && (
        <FxBacktestTab macro={data.macro} baseRates={data.baseRates} marketAnnual={data.marketAnnual} />
      )}

      {/* ── تب ۷: به‌روزرسانی دیتا ── */}
      {tab === "data" && (
        <div className="space-y-4">
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <h3 className="text-base font-bold mb-2" style={{ color: "var(--navy-deep)" }}>وضعیت منابع داده</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ color: "var(--text-3)" }}>
                  <th className="text-right p-2 font-normal">منبع</th>
                  <th className="text-right p-2 font-normal">پوشش</th>
                  <th className="text-right p-2 font-normal">به‌روزرسانی</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--text-1)" }}>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">نرخ زندهٔ دلار (fx_rates)</td>
                  <td className="p-2">{data.fxRates.length > 0 ? `${fa(data.fxRates.length)} ردیف — آخرین: ${liveDateFa}` : "—"}</td>
                  <td className="p-2">خودکار (رله، روزانه)</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">طلا/سکه (اسنپشات رله)</td>
                  <td className="p-2">{data.gold.length > 0 ? `${fa(data.gold.length)} قلم زنده` : "—"}</td>
                  <td className="p-2">خودکار (رله، لحظه‌ای)</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">دادهٔ کلان سالانه (macro_annual)</td>
                  <td className="p-2">{fa(data.macro.length)} سال — تا {toPersianDigits(String(Math.max(...data.macro.map((m) => m.year_shamsi))))}</td>
                  <td className="p-2">{srcLabel("macro_annual")}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">تورم ماهانه (CPI — مرکز آمار، نقطه‌به‌نقطه)</td>
                  <td className="p-2">{fa(data.cpiMonthly.length)} ماه — تا {toPersianDigits(data.cpiMonthly[data.cpiMonthly.length - 1]?.ym ?? "—")}</td>
                  <td className="p-2">{srcLabel("cpi_monthly")}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">بازده اخزا (YTM)</td>
                  <td className="p-2">{fa(data.ytmMonthly.length)} ماه — تا {toPersianDigits(data.ytmMonthly[data.ytmMonthly.length - 1]?.ym ?? "—")}</td>
                  <td className="p-2">{srcLabel("ytm_monthly")}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-2">نرخ‌های پایهٔ تاریخی دلار (base_rates)</td>
                  <td className="p-2">{fa(Object.keys(data.baseRates).length)} سال</td>
                  <td className="p-2">{srcLabel("base_rates")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "var(--navy-deep)" }}>به‌روزرسانی از همین‌جا — آپلود اکسل (بدون نیاز به deploy)</h3>
            <p className="text-[12px] mb-3" style={{ color: "var(--text-3)" }}>
              همان اکسل‌های همیشگی‌ات را اینجا آپلود کن؛ سرور با همان منطق اسکریپت پایتون پارس می‌کند،
              در Supabase ذخیره می‌شود و داشبورد بلافاصله از دادهٔ جدید استفاده می‌کند. مسیر جایگزین
              (استقلال کامل): <code dir="ltr">scripts/fx-refresh-seeds.py</code> روی PC + commit + push.
            </p>
            <FxSeedManager seedSources={data.seedSources} />
          </div>

          <div className="rounded-xl border p-6 text-sm space-y-2" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-2)" }}>
            <h3 className="text-base font-bold" style={{ color: "var(--navy-deep)" }}>یادداشت‌های ممیزی دیتا</h3>
            <p className="text-[12px]">
              سال‌های آینده در دادهٔ کلان (مثل ۱۴۰۵/۱۴۰۶) برآورد/فرض سناریوی اکسل خودت هستند، نه دادهٔ قطعی.
              تورم ماهانه (مرکز آمار، نقطه‌به‌نقطه/سالانهٔ پایان دوره) با تورم متوسط سالانهٔ CBI در دادهٔ کلان
              تعریف متفاوتی دارد — اختلاف چند واحد درصدی طبیعی است و خطا نیست.
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              مدل‌های سنگین (PSY/GSADF، GARCH، مونت‌کارلو) در مرحلهٔ ۲ به‌صورت پیش‌محاسبهٔ پایتون روی PC و
              آپسرت به Supabase اضافه می‌شوند — طبق تصمیم معماری سه‌جانبه.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
