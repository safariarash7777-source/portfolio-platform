"use client";

// ۶ خروجی نموداری WP4 — قرارداد قطعی بریف §WP4-۳ + روایت template-ای زیر هر چارت.
// اصل حاکم (قانون ۳/۷): چارتی که دادهٔ واقعی‌اش هنوز نیامده (فصلی، ن-۳۰، نرخ دلار)
// با کارت «به‌زودی» و توضیحِ «منتظر چه داده‌ای است» رندر می‌شود — عدد جایگزین ممنوع.
// با دادهٔ ن-۱۰ فعلی (سالانه) چارت‌های ۲ و ۳ در «نمای سالانه» با اعداد واقعی
// رندر می‌شوند و نمای فصلی‌شان بعد از رسیدن گزارش‌های میان‌دوره‌ای فعال می‌شود.

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link2, Check, Info } from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import type { SymbolFundamentals } from "@/lib/fundamental/types";
import {
  deriveN10,
  deriveN30,
  narrativeConsecutiveGrowth,
  narrativeFxShare,
  narrativeGrossMargin,
  narrativeNetProfit,
  narrativeRevenueGrowth,
  type N10Derived,
  type N30Derived,
} from "@/lib/fundamental/calc";

/* ---------- ابزارهای نمایش (فقط فرمت؛ محاسبه در lib/fundamental/calc) ---------- */

/** میلیون ریال → متن کوتاه فارسی («۳۲۱۹ همت» مقیاس هزار میلیارد تومان). */
function fmtMillionRial(v: number): string {
  // v بر حسب میلیون ریال است. 1 همت = 10^12 تومان = 10^7 میلیون ریال.
  const hemat = v / 10_000_000;
  if (Math.abs(hemat) >= 1) {
    const body = Math.abs(hemat) >= 100 ? Math.round(hemat).toString() : hemat.toFixed(1);
    return `${toPersianDigits(body).replace(".", "٫")} همت`;
  }
  const milT = v / 10_000; // میلیارد تومان
  return `${toPersianDigits(Math.round(milT).toLocaleString("en-US")).replace(/,/g, "٬")} میلیارد تومان`;
}

function fmtPctFa(v: number): string {
  const body = Math.abs(v) % 1 === 0 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1);
  return `${v < 0 ? "−" : ""}٪${toPersianDigits(body).replace(".", "٫")}`;
}

/** فرمتر برچسب نمودار — ورودی recharts ممکن است غیرعددی باشد. */
function fmtLabelPct(label: unknown): string {
  const n = Number(label);
  return isFinite(n) ? fmtPctFa(n) : "";
}

function fmtLabelMillionRial(label: unknown): string {
  const n = Number(label);
  return isFinite(n) ? fmtMillionRial(n) : "";
}

/** میلیون ریال → دلار (با نرخ تومان) — فقط وقتی نرخ رسمی fx_rates موجود است. */
function millionRialToUsd(v: number, usdToman: number): number {
  // v میلیون ریال = v × 10^5 تومان
  return (v * 100_000) / usdToman;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  let body: string;
  if (abs >= 1e9) body = `${(v / 1e9).toFixed(1)} میلیارد`;
  else if (abs >= 1e6) body = `${(v / 1e6).toFixed(1)} میلیون`;
  else body = Math.round(v).toLocaleString("en-US");
  return `${toPersianDigits(body).replace(".", "٫")} دلار`;
}

/* ------------------------------ اجزای مشترک ------------------------------ */

function Narrative({ text }: { text: string | null }) {
  if (!text) return null;
  // ممیز فارسی: فقط نقطهٔ بین دو رقم را به ٫ تبدیل می‌کند (مثل ۵۴.۹ ← ۵۴٫۹).
  const fa = toPersianDigits(text).replace(/([۰-۹])\.([۰-۹])/g, "$1٫$2");
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-6"
      style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }}
    >
      <Info size={15} className="mt-1 shrink-0" style={{ color: "var(--gold)" }} aria-hidden />
      <span>{fa}</span>
    </p>
  );
}

function ShareButton({ anchor }: { anchor: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors"
      style={{ color: copied ? "var(--success)" : "var(--text-3)", border: "1px solid var(--line)" }}
      title="کپی لینک این نمودار"
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
      {copied ? "کپی شد" : "اشتراک"}
    </button>
  );
}

function CurrencyToggle({
  usd,
  onChange,
  enabled,
}: {
  usd: boolean;
  onChange: (v: boolean) => void;
  enabled: boolean;
}) {
  // سوییچ ریالی/دلاری (WP4-۵ / T6): با فید fx_rates فعال می‌شود؛
  // بدون نرخ رسمی دکمهٔ دلاری غیرفعال می‌ماند — هیچ تبدیل تقریبی بی‌منبع.
  const seg = (label: string, active: boolean, props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      type="button"
      className="px-2 py-1 transition-colors"
      style={
        active
          ? { background: "var(--navy)", color: "var(--text-on-navy)", fontWeight: 600 }
          : { color: "var(--text-3)" }
      }
      {...props}
    >
      {label}
    </button>
  );
  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-md text-[12px]"
      style={{ border: "1px solid var(--line)" }}
      role="group"
      aria-label="واحد نمایش"
    >
      {seg("ریالی", !usd, { onClick: () => onChange(false) })}
      {enabled
        ? seg("دلاری", usd, { onClick: () => onChange(true), title: "تبدیل با آخرین نرخ دلار بازار آزاد (fx_rates)" })
        : (
          <span
            className="cursor-not-allowed px-2 py-1"
            style={{ color: "var(--text-3)" }}
            title="به‌زودی — پس از جمع‌شدن نرخ رسمی دلار (fx_rates)"
            aria-disabled
          >
            دلاری
          </span>
        )}
    </div>
  );
}

function ChartCard({
  id,
  title,
  subtitle,
  children,
  narrative,
  currencyToggle,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  narrative?: string | null;
  currencyToggle?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="card p-4 sm:p-5 scroll-mt-24"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold" style={{ color: "var(--navy)" }}>
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {currencyToggle}
          <ShareButton anchor={id} />
        </div>
      </header>
      {children}
      {narrative !== undefined ? <Narrative text={narrative ?? null} /> : null}
    </section>
  );
}

/** کارت «به‌زودی» — برای چارتی که دادهٔ واقعی‌اش هنوز موجود نیست (قانون ۳). */
function ComingSoon({ id, title, waitingFor }: { id: string; title: string; waitingFor: string }) {
  return (
    <section
      id={id}
      className="flex flex-col justify-between rounded-xl p-4 sm:p-5 scroll-mt-24"
      style={{ background: "var(--surface-2)", border: "1px dashed var(--line-strong)" }}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold" style={{ color: "var(--text-2)" }}>
            {title}
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            به‌زودی
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-3)" }}>
          {waitingFor}
        </p>
      </div>
      <p className="mt-4 text-[11px]" style={{ color: "var(--text-3)" }}>
        طبق قواعد پلتفرم، تا رسیدن دادهٔ واقعی هیچ عدد جایگزینی نمایش داده نمی‌شود.
      </p>
    </section>
  );
}

/* --------------------------------- چارت‌ها --------------------------------- */

const TICK = { fontSize: 11, fill: "var(--text-3)" } as const;

function faTick(v: number): string {
  return toPersianDigits(String(v));
}

/** چارت روند فروش و حاشیهٔ ناخالص ۵ساله — دادهٔ واقعی جدول رسمی گزارش. */
function TrendChart({ derived, usdRate }: { derived: N10Derived; usdRate: number | null }) {
  const fmtVal = usdRate ? fmtUsd : fmtMillionRial;
  const data = derived.trend.map((t) => ({
    fy: toPersianDigits(String(t.fy)),
    revenue: usdRate ? millionRialToUsd(t.revenue, usdRate) : t.revenue,
    grossMargin: t.grossMarginPct,
  }));
  return (
    <div dir="ltr" className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="fy" tick={TICK} />
          <YAxis
            yAxisId="rev"
            tick={TICK}
            tickFormatter={(v: number) => fmtVal(v)}
            width={80}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            domain={[0, 100]}
            tick={TICK}
            tickFormatter={(v: number) => fmtPctFa(v)}
            width={50}
          />
          <Tooltip
            formatter={(value, name) =>
              name === "حاشیهٔ ناخالص"
                ? [fmtPctFa(Number(value)), name]
                : [fmtVal(Number(value)), name]
            }
            contentStyle={{ direction: "rtl", fontSize: 12, borderColor: "var(--line)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="rev" dataKey="revenue" name="فروش" fill="var(--navy)" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="margin"
            type="monotone"
            dataKey="grossMargin"
            name="حاشیهٔ ناخالص"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** چارت حاشیه‌های سه‌گانه، سال جاری در برابر سال قبل — نمای سالانهٔ چارت ۲. */
function MarginsChart({ derived, fyLabel, priorLabel }: { derived: N10Derived; fyLabel: string; priorLabel: string }) {
  const m = derived.margins;
  const p = derived.priorMargins;
  if (!p) return null;
  const rows = [
    { name: "ناخالص", cur: m.gross, prior: p.gross },
    { name: "عملیاتی", cur: m.operating, prior: p.operating },
    { name: "خالص", cur: m.net, prior: p.net },
  ].filter((r) => r.cur !== null && r.prior !== null);
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ ...TICK, fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={TICK} tickFormatter={(v: number) => fmtPctFa(v)} width={50} />
          <Tooltip
            formatter={(value, name) => [fmtPctFa(Number(value)), name]}
            contentStyle={{ direction: "rtl", fontSize: 12, borderColor: "var(--line)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="prior" name={priorLabel} fill="var(--line)" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="prior" position="top" formatter={fmtLabelPct} style={{ fontSize: 11, fill: "var(--text-3)" }} />
          </Bar>
          <Bar dataKey="cur" name={fyLabel} fill="var(--navy)" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="cur" position="top" formatter={fmtLabelPct} style={{ fontSize: 11, fill: "var(--navy)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** چارت سود خالص، سال جاری در برابر سال قبل — نمای سالانهٔ چارت ۳. */
function NetProfitChart({
  cur,
  prior,
  fyLabel,
  priorLabel,
  usdRate,
}: {
  cur: number;
  prior: number;
  fyLabel: string;
  priorLabel: string;
  usdRate: number | null;
}) {
  const fmtVal = usdRate ? fmtUsd : fmtMillionRial;
  const fmtLabel = (label: unknown) => {
    const n = Number(label);
    return isFinite(n) ? fmtVal(n) : "";
  };
  const rows = [
    { name: priorLabel, value: usdRate ? millionRialToUsd(prior, usdRate) : prior, key: "prior" },
    { name: fyLabel, value: usdRate ? millionRialToUsd(cur, usdRate) : cur, key: "cur" },
  ];
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ ...TICK, fontSize: 12 }} />
          <YAxis tick={TICK} tickFormatter={(v: number) => fmtVal(v)} width={80} />
          <Tooltip
            formatter={(value) => [fmtVal(Number(value)), "سود خالص"]}
            contentStyle={{ direction: "rtl", fontSize: 12, borderColor: "var(--line)" }}
          />
          <Bar dataKey="value" name="سود خالص" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="value" position="top" formatter={fmtLabel} style={{ fontSize: 11, fill: "var(--navy)" }} />
            {rows.map((r) => (
              <Cell key={r.key} fill={r.key === "cur" ? "var(--navy)" : "var(--line)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------ چارت‌های ن-۳۰ (۴–۶) ------------------------------ */

const FA_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** "1404-10" ← «دی ۰۴» — برچسب کوتاه محور ماهانه. */
function faMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return toPersianDigits(month);
  return `${FA_MONTHS[m - 1]} ${toPersianDigits(String(y).slice(2))}`;
}

// C4: رمپ چارت از توکن‌های برند (navy/gold) با color-mix — بدون hex خام.
const MIX_COLORS = [
  "var(--navy-deep)",
  "var(--gold)",
  "color-mix(in srgb, var(--navy) 70%, white)",
  "color-mix(in srgb, var(--gold) 70%, black)",
  "color-mix(in srgb, var(--navy) 50%, white)",
  "var(--gold-soft)",
  "color-mix(in srgb, var(--navy) 30%, white)",
  "var(--text-3)",
];

/** چارت ۴ — ترکیب فروش: سهم محصولات (میلهٔ افقی) در بازهٔ ماه‌های موجود. */
function SalesMixChart({ d30 }: { d30: N30Derived }) {
  const data = d30.productMix.map((p) => ({
    name: p.name,
    share: p.sharePct ?? 0,
    amount: p.amount,
  }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
          <XAxis type="number" tick={TICK} tickFormatter={(v) => `٪${faTick(v as number)}`} domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" width={110} tick={{ ...TICK, fontSize: 11 }} />
          <Tooltip
            formatter={(v: unknown, _n, item) => [
              `٪${toPersianDigits(String(v))} (${fmtMillionRial((item?.payload as { amount: number })?.amount ?? 0)})`,
              "سهم از فروش",
            ]}
            labelFormatter={(l) => String(l)}
          />
          <Bar dataKey="share" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
            ))}
            <LabelList dataKey="share" position="right" formatter={(v: unknown) => `٪${toPersianDigits(String(v))}`} style={{ fontSize: 11, fill: "var(--text-2)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** چارت ۵ — نرخ فروش محصول پرفروش (خط) + مقدار فروش (میله) به تفکیک ماه. */
function ProductRateChart({ d30 }: { d30: N30Derived }) {
  const data = d30.topProductMonths.map((m) => ({
    month: faMonthLabel(m.month),
    rate: m.rate,
    qty: m.salesQty,
  }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="month" tick={TICK} />
          <YAxis yAxisId="qty" tick={TICK} tickFormatter={(v) => toPersianDigits(Number(v).toLocaleString("en-US")).replace(/,/g, "٬")} />
          <YAxis yAxisId="rate" orientation="left" hide />
          <Tooltip
            formatter={(v: unknown, name) =>
              name === "نرخ فروش (ریال)"
                ? [toPersianDigits(Number(v).toLocaleString("en-US")).replace(/,/g, "٬") + " ریال", name]
                : [toPersianDigits(Number(v).toLocaleString("en-US")).replace(/,/g, "٬"), name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="qty" dataKey="qty" name="مقدار فروش" fill="color-mix(in srgb, var(--navy) 70%, white)" radius={[4, 4, 0, 0]} barSize={22} />
          <Line yAxisId="rate" dataKey="rate" name="نرخ فروش (ریال)" stroke="var(--gold)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** چارت ۶ — تولید در برابر فروش (مقدار، ماهانه) — تشخیص انبارش/تخلیه. */
function ProdVsSalesChart({ d30 }: { d30: N30Derived }) {
  const data = d30.prodVsSales.map((m) => ({
    month: faMonthLabel(m.month),
    production: m.production,
    sales: m.sales,
  }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="month" tick={TICK} />
          <YAxis tick={TICK} tickFormatter={(v) => toPersianDigits(Number(v).toLocaleString("en-US")).replace(/,/g, "٬")} />
          <Tooltip formatter={(v: unknown, name) => [toPersianDigits(Number(v).toLocaleString("en-US")).replace(/,/g, "٬"), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="production" name="تولید" fill="var(--navy-deep)" radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="sales" name="فروش" fill="var(--gold)" radius={[4, 4, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------- کامپوننت اصلی ------------------------------- */

export default function FundamentalCharts({
  fundamentals,
  fxRate = null,
  fxRateDate = null,
}: {
  fundamentals: SymbolFundamentals;
  /** آخرین نرخ دلار بازار آزاد (تومان) از fx_rates — null یعنی فید هنوز داده ندارد. */
  fxRate?: number | null;
  fxRateDate?: string | null;
}) {
  const n10 = fundamentals.n10;
  const derived = useMemo(() => (n10 ? deriveN10(n10.data) : null), [n10]);
  const n30 = fundamentals.n30;
  const n30d = useMemo(() => (n30 ? deriveN30(n30.data) : null), [n30]);
  const [usd, setUsd] = useState(false);
  const fxEnabled = typeof fxRate === "number" && fxRate > 0;
  const usdRate = usd && fxEnabled ? fxRate : null;
  const currencyToggle = (
    <CurrencyToggle usd={usd && fxEnabled} onChange={setUsd} enabled={fxEnabled} />
  );

  if (!n10 || !derived) {
    return (
      <div
        className="rounded-xl p-6 text-center text-[14px]"
        style={{ background: "var(--surface-2)", border: "1px dashed var(--line-strong)", color: "var(--text-3)" }}
      >
        برای این نماد هنوز گزارش بنیادی پردازش‌شده‌ای ثبت نشده است. پس از آپلود گزارش کدال
        توسط ادمین، ۶ نمودار استاندارد این‌جا نمایش داده می‌شود.
      </div>
    );
  }

  const d = n10.data;
  const fyLabel = toPersianDigits(String(Number(d.period_end.slice(0, 4))));
  const priorLabel = toPersianDigits(String(Number(d.period_end.slice(0, 4)) - 1));
  const s = d.standalone;

  return (
    <div className="space-y-5">
      {/* شناسنامهٔ منبع داده — شفافیت مبدأ (قانون ۳) */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-3 text-[12px]"
        style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text-2)" }}
        role="note"
      >
        <span className="font-bold" style={{ color: "var(--navy)" }}>
          منبع: {n10.source.title}
        </span>
        <span>واحد ارقام: {d.unit}</span>
        {d.audited ? <span style={{ color: "var(--success)" }}>حسابرسی‌شده ✓</span> : null}
        {n10.source.verified ? <span title={n10.source.verification_note}>اعتبارسنجی متقاطع ✓</span> : null}
        {!n10.source.source_url ? (
          <span style={{ color: "var(--text-3)" }}>(لینک اطلاعیهٔ کدال به‌زودی)</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* چارت ۱ — P/E فصلی TTM: نیازمند EPS فصلی + قیمت روز → به‌زودی */}
        <ComingSoon
          id="chart-pe-ttm"
          title="۱) روند P/E فصلی TTM"
          waitingFor="نیازمند EPS فصلی (گزارش‌های میان‌دوره‌ای) و قیمت روز نماد (فید WP1) است؛ پس از اتصال، به‌صورت خودکار محاسبه و رندر می‌شود."
        />

        {/* چارت ۲ — حاشیهٔ سود: نمای سالانه با دادهٔ واقعی؛ فصلی بعداً */}
        <ChartCard
          id="chart-margins"
          title="۲) حاشیه‌های سود (ناخالص / عملیاتی / خالص)"
          subtitle={`مقایسهٔ سال ${fyLabel} با سال ${priorLabel} (تجدید ارائه) · نمای فصلی پس از گزارش‌های میان‌دوره‌ای فعال می‌شود`}
          narrative={narrativeGrossMargin(derived)}
        >
          <MarginsChart derived={derived} fyLabel={fyLabel} priorLabel={priorLabel} />
        </ChartCard>

        {/* چارت ۳ — سود خالص: نمای سالانه با دادهٔ واقعی؛ فصلی ۳ سال بعداً */}
        <ChartCard
          id="chart-net-profit"
          title="۳) سود خالص"
          subtitle={`سال ${fyLabel} در برابر ${priorLabel} · نمای فصلی ۳ساله پس از گزارش‌های میان‌دوره‌ای`}
          narrative={narrativeNetProfit(derived, fyLabel)}
          currencyToggle={currencyToggle}
        >
          {s.prior ? (
            <NetProfitChart
              cur={s.net_profit}
              prior={s.prior.net_profit}
              fyLabel={fyLabel}
              priorLabel={priorLabel}
              usdRate={usdRate}
            />
          ) : null}
          {usdRate && fxRateDate ? (
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              تبدیل با نرخ {toPersianDigits(Math.round(usdRate).toLocaleString("en-US")).replace(/,/g, "٬")} تومان (آخرین نرخ ثبت‌شده {toPersianDigits(fxRateDate)}) — تقریبی و صرفاً برای مقیاس.
            </p>
          ) : null}
        </ChartCard>

        {/* چارت ۴ — ترکیب فروش و سهم محصولات — از ن-۳۰ واقعی (T5) */}
        {n30d && n30d.productMix.length > 0 ? (
          <ChartCard
            id="chart-sales-mix"
            title="۴) سهم محصولات از فروش"
            subtitle={`جمع ${toPersianDigits(String(n30d.months.length))} ماه گزارش فعالیت ماهانه (ن-۳۰) کدال${n30d.exportSharePct !== null && n30d.exportSharePct > 0 ? ` · سهم صادرات ٪${toPersianDigits(String(n30d.exportSharePct))}` : " · در این بازه فروش صادراتی گزارش نشده"}`}
          >
            <SalesMixChart d30={n30d} />
          </ChartCard>
        ) : (
          <ComingSoon
            id="chart-sales-mix"
            title="۴) ترکیب فروش داخلی/صادراتی و سهم محصولات"
            waitingFor="نیازمند جدول «فروش به تفکیک محصول» از اکسل گزارش‌های ماهانهٔ ن-۳۰ است — برای این نماد هنوز گزارش ن-۳۰ پردازش نشده است."
          />
        )}

        {/* چارت ۵ — نرخ و مقدار فروش محصول پرفروش — از ن-۳۰ واقعی (T5) */}
        {n30d && n30d.topProductName && n30d.topProductMonths.some((m) => m.rate !== null) ? (
          <ChartCard
            id="chart-product-rates"
            title={`۵) نرخ و مقدار فروش ماهانه — ${n30d.topProductName}`}
            subtitle="پرفروش‌ترین محصول بازه · میله: مقدار فروش · خط: نرخ فروش (ریال) — منبع: ن-۳۰ کدال"
          >
            <ProductRateChart d30={n30d} />
          </ChartCard>
        ) : (
          <ComingSoon
            id="chart-product-rates"
            title="۵) نرخ و مقدار فروش هر محصول (ماهانه)"
            waitingFor="نیازمند سری ماهانهٔ ن-۳۰ به تفکیک محصول است — برای این نماد هنوز گزارش ن-۳۰ پردازش نشده است."
          />
        )}

        {/* چارت ۶ — تولید در برابر فروش — از ن-۳۰ واقعی (T5) */}
        {n30d && n30d.prodVsSales.length > 0 ? (
          <ChartCard
            id="chart-prod-vs-sales"
            title="۶) مقدار تولید در برابر مقدار فروش (ماهانه)"
            subtitle="جمع مقادیر همهٔ محصولات هر ماه — تولید بیشتر از فروش یعنی انبارش، کمتر یعنی تخلیهٔ موجودی — منبع: ن-۳۰ کدال"
          >
            <ProdVsSalesChart d30={n30d} />
          </ChartCard>
        ) : (
          <ComingSoon
            id="chart-prod-vs-sales"
            title="۶) مقدار تولید در برابر مقدار فروش"
            waitingFor="نیازمند مقادیر تولید و فروش ماهانه از ن-۳۰ است — برای این نماد هنوز گزارش ن-۳۰ پردازش نشده است."
          />
        )}
      </div>

      {/* روند ۵ساله — دادهٔ واقعی جدول رسمی خود گزارش (مکمل چارت‌های بالا) */}
      <ChartCard
        id="chart-5y-trend"
        title="روند ۵سالهٔ فروش و حاشیهٔ ناخالص"
        subtitle="از جدول رسمی خود گزارش — ستون: فروش (میلیون ریال) · خط: حاشیهٔ ناخالص"
        narrative={[narrativeRevenueGrowth(derived, fyLabel), narrativeConsecutiveGrowth(derived)]
          .filter(Boolean)
          .join(" ") || null}
        currencyToggle={currencyToggle}
      >
        <TrendChart derived={derived} usdRate={usdRate} />
        {usdRate && fxRateDate ? (
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            تبدیل همهٔ سال‌ها با نرخ روز {toPersianDigits(Math.round(usdRate).toLocaleString("en-US")).replace(/,/g, "٬")} تومان ({toPersianDigits(fxRateDate)}) — برای مقایسهٔ تاریخی دقیق، میانگین نرخ هر سال پس از تجمیع دادهٔ تاریخی fx_rates فعال می‌شود.
          </p>
        ) : null}
      </ChartCard>

      {/* کیفیت سود — روایت تسعیر ارز (شفافیت، نه توصیه) */}
      <Narrative text={narrativeFxShare(derived)} />
    </div>
  );
}
