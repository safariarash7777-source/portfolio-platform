"use client";
// T1 — بخش «شناسنامهٔ بنیادی نماد» (دادهٔ ماهانهٔ ن-۳۰): پنج چارت سؤال‌محور.
// فقط وقتی دادهٔ ن-۳۰ هست رندر می‌شود (والد سرور تصمیم می‌گیرد).
// همهٔ محاسبات در lib/core/monthlyReport.ts (خالص، تست‌دار) — این‌جا فقط نمایش.
// قواعد: گپ واقعی برای ماه غایب (connectNulls=false)، واحد صریح روی محور،
// روایت template‌ای قطعی زیر هر چارت، رنگ فقط از توکن‌ها.

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toPersianDigits } from "@/lib/format";
import type { CodalN30Data } from "@/lib/fundamental/types";
import {
  buildMonthlySales,
  narrativeCumulative,
  narrativeMix,
  narrativeMonthlyVsAvg,
  narrativeProdVsSales,
  narrativeRate,
  type MonthlySales,
} from "@/lib/core/monthlyReport";

/* ── فرمت‌های نمایشی (فقط فرمت؛ محاسبه در lib/core) ─────────────────────── */

/** میلیون ریال → متن کوتاه فارسی (میلیارد تومان / همت). */
function fmtMR(v: number): string {
  const hemat = v / 10_000_000; // ۱ همت = 10^7 میلیون ریال
  if (Math.abs(hemat) >= 1) {
    const body = Math.abs(hemat) >= 100 ? Math.round(hemat).toString() : hemat.toFixed(1);
    return `${toPersianDigits(body).replace(".", "٫")} همت`;
  }
  const milT = v / 10_000; // میلیارد تومان
  return `${toPersianDigits(Math.round(milT).toLocaleString("en-US")).replace(/,/g, "٬")} میلیارد تومان`;
}

function fmtAxisMR(v: number): string {
  const hemat = v / 10_000_000;
  if (Math.abs(hemat) >= 1) return `${toPersianDigits(Math.round(hemat).toString())} همت`;
  return `${toPersianDigits(Math.round(v / 10_000).toLocaleString("en-US")).replace(/,/g, "٬")}`;
}

function fmtQty(v: number): string {
  return toPersianDigits(Math.round(v).toLocaleString("en-US")).replace(/,/g, "٬");
}

function faDigits(v: string | number): string {
  return toPersianDigits(String(v));
}

/* ── اجزای مشترک کارت (هم‌خانوادهٔ FundamentalCharts) ───────────────────── */

function Narrative({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p
      className="mt-3 rounded-lg px-3 py-2 text-[13px] leading-6"
      style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }}
    >
      {toPersianDigits(text)}
    </p>
  );
}

function QCard({
  id,
  question,
  subtitle,
  children,
  narrative,
}: {
  id: string;
  question: string;
  subtitle?: string;
  children: React.ReactNode;
  narrative: string | null;
}) {
  return (
    <section id={id} className="card p-4 sm:p-5 scroll-mt-24">
      <header className="mb-3">
        <h3 className="text-[15px] font-bold" style={{ color: "var(--navy)" }}>
          {question}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
            {subtitle}
          </p>
        ) : null}
      </header>
      {children}
      <Narrative text={narrative} />
    </section>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "inherit",
} as const;

/* ── چارت ۱: فروش ماهانه سال جاری در برابر سال قبل + خط میانگین ─────────── */

function MonthlyBars({ m }: { m: MonthlySales }) {
  const data = m.currentMonths.map((cm, i) => ({
    label: cm.monthLabel,
    current: cm.amount,
    prior: m.priorMonths ? m.priorMonths[i].amount : null,
  }));
  return (
    <div style={{ height: 280 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-3)" }} reversed />
          <YAxis
            tickFormatter={fmtAxisMR}
            tick={{ fontSize: 10, fill: "var(--text-3)" }}
            width={58}
            orientation="right"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: unknown, name: unknown) => [v == null ? "—" : fmtMR(Number(v)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {m.priorMonths ? (
            <Bar dataKey="prior" name={`سال ${faDigits(m.priorFY ?? "")}`} fill="var(--line-strong)" radius={[3, 3, 0, 0]} />
          ) : null}
          <Bar dataKey="current" name={`سال ${faDigits(m.currentFY)}`} fill="var(--navy)" radius={[3, 3, 0, 0]} />
          {m.avgCurrent !== null ? (
            <ReferenceLine
              y={m.avgCurrent}
              stroke="var(--gold)"
              strokeDasharray="6 4"
              label={{ value: `میانگین ${faDigits(m.currentFY)}`, fontSize: 10, fill: "var(--text-2)", position: "insideTopLeft" }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── چارت ۲: تجمیعی از ابتدای سال مالی، جاری در برابر قبل ──────────────── */

function CumulativeChart({ m }: { m: MonthlySales }) {
  const data = m.currentMonths.map((cm, i) => ({
    label: cm.monthLabel,
    current: cm.cumulative,
    prior: m.priorMonths ? m.priorMonths[i].cumulative : null,
  }));
  return (
    <div style={{ height: 280 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-3)" }} reversed />
          <YAxis
            tickFormatter={fmtAxisMR}
            tick={{ fontSize: 10, fill: "var(--text-3)" }}
            width={58}
            orientation="right"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: unknown, name: unknown) => [v == null ? "—" : fmtMR(Number(v)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {m.priorMonths ? (
            <Line
              dataKey="prior"
              name={`تجمیعی ${faDigits(m.priorFY ?? "")}`}
              stroke="var(--line-strong)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
            />
          ) : null}
          <Line
            dataKey="current"
            name={`تجمیعی ${faDigits(m.currentFY)}`}
            stroke="var(--navy)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── چارت ۳: روند نرخ فروش ۱–۳ محصول پرسهم (داخلی/صادراتی جدا) ─────────── */

const RATE_COLORS = ["var(--navy)", "var(--gold)", "var(--success)"] as const;

function RateChart({ m }: { m: MonthlySales }) {
  const labels = m.rateSeries[0]?.points.map((p) => p.monthLabel) ?? [];
  const data = labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    m.rateSeries.forEach((s, si) => {
      row[`s${si}`] = s.points[i]?.rate ?? null;
    });
    return row;
  });
  return (
    <div style={{ height: 280 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-3)" }} reversed />
          <YAxis
            tickFormatter={(v: number) => faDigits(Math.round(v).toLocaleString("en-US")).replace(/,/g, "٬")}
            tick={{ fontSize: 10, fill: "var(--text-3)" }}
            width={64}
            orientation="right"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: unknown, name: unknown) => [
              v == null ? "—" : `${faDigits(Math.round(Number(v)).toLocaleString("en-US")).replace(/,/g, "٬")} ریال`,
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {m.rateSeries.map((s, si) => (
            <Line
              key={s.label}
              dataKey={`s${si}`}
              name={s.label}
              stroke={RATE_COLORS[si % RATE_COLORS.length]}
              strokeWidth={2}
              strokeDasharray={s.market === "صادراتی" ? "6 4" : undefined}
              dot={{ r: 2.5 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── چارت ۴: ترکیب فروش آخرین ماه (نوار انباشته + فهرست سهم‌ها) ─────────── */

const MIX_COLORS = [
  "var(--navy)",
  "var(--gold)",
  "var(--success)",
  "var(--danger)",
  "var(--line-strong)",
  "var(--text-3)",
  "var(--line)",
] as const;

function MixChart({ m }: { m: MonthlySales }) {
  const total = m.latestMix.reduce((a, x) => a + x.amount, 0);
  return (
    <div>
      {/* نوار انباشتهٔ سهم محصولات */}
      <div
        className="flex h-8 w-full overflow-hidden rounded-md"
        dir="ltr"
        role="img"
        aria-label="سهم محصولات از فروش آخرین ماه"
      >
        {m.latestMix.map((x, i) => (
          <div
            key={x.name + (x.market ?? "")}
            style={{
              width: `${total > 0 ? (x.amount / total) * 100 : 0}%`,
              background: MIX_COLORS[i % MIX_COLORS.length],
            }}
            title={`${x.name} — ${x.sharePct !== null ? `٪${x.sharePct}` : ""}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {m.latestMix.map((x, i) => (
          <li key={x.name + (x.market ?? "") + "l"} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
                aria-hidden
              />
              {x.name}
              {x.market ? (
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  ({x.market})
                </span>
              ) : null}
            </span>
            <span className="tabular-nums" style={{ color: "var(--navy)" }}>
              {x.sharePct !== null ? `٪${faDigits(String(x.sharePct)).replace(".", "٫")}` : "—"}
              <span className="mr-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                {fmtMR(x.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {m.latestDomesticAmount !== null && m.latestExportAmount !== null ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
        >
          <span>
            داخلی: <b style={{ color: "var(--navy)" }}>{fmtMR(m.latestDomesticAmount)}</b>
          </span>
          <span>
            صادراتی: <b style={{ color: "var(--navy)" }}>{fmtMR(m.latestExportAmount)}</b>
          </span>
          {m.latestExportSharePct !== null ? (
            <span>
              سهم صادرات: <b style={{ color: "var(--navy)" }}>٪{faDigits(String(m.latestExportSharePct)).replace(".", "٫")}</b>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── چارت ۵: تولید در برابر فروش محصول اصلی ─────────────────────────────── */

function ProdSalesChart({ m }: { m: MonthlySales }) {
  return (
    <div style={{ height: 280 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={m.prodVsSales} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "var(--text-3)" }} reversed />
          <YAxis
            tickFormatter={(v: number) => fmtQty(v)}
            tick={{ fontSize: 10, fill: "var(--text-3)" }}
            width={64}
            orientation="right"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: unknown, name: unknown) => [v == null ? "—" : fmtQty(Number(v)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="production" name="مقدار تولید" fill="var(--line-strong)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="sales" name="مقدار فروش" fill="var(--navy)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── بخش اصلی ────────────────────────────────────────────────────────────── */

export default function MonthlySalesCharts({
  reports,
  sourceTitle,
  sourceUrl,
}: {
  reports: CodalN30Data[];
  sourceTitle: string;
  sourceUrl: string | null;
}) {
  const m = useMemo(() => buildMonthlySales(reports), [reports]);
  if (!m) return null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-extrabold" style={{ color: "var(--navy-deep)" }}>
            شناسنامهٔ بنیادی — فروش ماهانه
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
            {toPersianDigits(String(m.reportCount))} گزارش فعالیت ماهانه (ن-۳۰) کدال · واحد مبالغ: میلیون ریال (نمایش: میلیارد تومان/همت)
            {sourceUrl ? (
              <>
                {" · "}
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--navy)" }}>
                  {sourceTitle}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <QCard
          id="q-monthly-sales"
          question="فروش ماهانه چطور حرکت می‌کند؟"
          subtitle={`درآمد ماهانهٔ سال ${faDigits(m.currentFY)}${m.priorFY ? ` در کنار سال ${faDigits(m.priorFY)}` : ""} · خط طلایی: میانگین سال جاری · ماه بدون گزارش خالی است`}
          narrative={narrativeMonthlyVsAvg(m)}
        >
          <MonthlyBars m={m} />
        </QCard>

        <QCard
          id="q-cumulative"
          question="از ابتدای سال مالی کجاییم؟"
          subtitle={`فروش تجمیعی (fy_cumulative از خود گزارش) — سال ${faDigits(m.currentFY)}${m.priorFY ? ` در برابر ${faDigits(m.priorFY)}` : ""}`}
          narrative={narrativeCumulative(m)}
        >
          <CumulativeChart m={m} />
        </QCard>

        {m.rateSeries.length > 0 && m.rateSeries.some((s) => s.points.some((p) => p.rate !== null)) ? (
          <QCard
            id="q-rate-trend"
            question="نرخ فروش چه روندی دارد؟"
            subtitle="نرخ فروش (ریال بر واحد) محصولات پرسهم · خط‌چین = صادراتی · ماه بدون رکورد = گپ واقعی"
            narrative={narrativeRate(m)}
          >
            <RateChart m={m} />
          </QCard>
        ) : null}

        {m.latestMix.length > 0 ? (
          <QCard
            id="q-sales-mix"
            question="چه می‌فروشد؟"
            subtitle={`ترکیب فروش ${m.latestMonthLabel ?? ""} (آخرین ماه دارای گزارش) — سهم محصولات و داخلی/صادراتی`}
            narrative={narrativeMix(m)}
          >
            <MixChart m={m} />
          </QCard>
        ) : null}

        {m.prodVsSales.length > 0 && m.mainProductName ? (
          <QCard
            id="q-prod-vs-sales"
            question="تولید و فروش هم‌خوان‌اند؟"
            subtitle={`مقدار تولید و فروش «${m.mainProductName}» (محصول اصلی) — فقط ماه‌های دارای هر دو مقدار`}
            narrative={narrativeProdVsSales(m)}
          >
            <ProdSalesChart m={m} />
          </QCard>
        ) : null}
      </div>
    </div>
  );
}
