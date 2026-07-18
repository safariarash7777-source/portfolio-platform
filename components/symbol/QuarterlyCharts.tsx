"use client";

// T3 — تحلیل فصلی نماد از گزارش‌های تجمیعی ن-۱۰ (فصل‌سازی با تفاضل زنجیره‌ای).
// سه پرسش: ۱) روند درآمد و سود فصلی؟ ۲) روند حاشیه‌ها؟ ۳) P/E TTM نسبت به تاریخچه؟
// قواعد سخت: فصل بدون زنجیرهٔ کامل → بدون ستون/نقطه (هیچ درون‌یابی)؛
// P/E فقط با ۴ فصل کامل متوالی؛ EPS منفی نقطه ندارد.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DerivedQuarter, TtmPoint } from "@/lib/core/quarterly";

const nf = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });

function faDigits(x: string | number): string {
  return String(x).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** "Q1 1404" → «ف۱ ۱۴۰۴». */
function faQ(label: string): string {
  const m = label.match(/^Q(\d) (\d{4})$/);
  if (!m) return label;
  return `ف${faDigits(m[1])} ${faDigits(m[2])}`;
}

function Card({
  title,
  question,
  note,
  children,
}: {
  title: string;
  question: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <header className="mb-3">
        <h4 className="text-[14px] font-bold" style={{ color: "var(--navy)" }}>
          {title}
        </h4>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          {question}
        </p>
      </header>
      {children}
      {note ? (
        <p className="mt-2 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export default function QuarterlyCharts({
  quarters,
  ttm,
  peSeries,
  currentPe,
  sourceTitle,
}: {
  quarters: DerivedQuarter[];
  ttm: TtmPoint[];
  /** نقاط P/E پایان فصل؛ pe=null یعنی قیمت تاریخی موجود نبود. */
  peSeries: Array<{ label: string; pe: number | null }>;
  /** P/E جاری از قیمت روز و آخرین EPS TTM؛ null اگر محاسبه‌پذیر نبود. */
  currentPe: number | null;
  sourceTitle: string;
}) {
  if (quarters.length === 0) return null;

  const last12 = quarters.slice(-12);
  const revData = last12.map((q) => ({
    name: faQ(q.label),
    درآمد: q.revenue != null ? q.revenue / 10_000 : null,
    "سود خالص": q.netProfit != null ? q.netProfit / 10_000 : null,
  }));

  const marginData = last12.map((q) => ({
    name: faQ(q.label),
    ناخالص: q.grossMargin,
    عملیاتی: q.operatingMargin,
    خالص: q.netMargin,
  }));

  const peData = peSeries.map((p) => ({ name: faQ(p.label), pe: p.pe }));
  const peVals = peSeries.map((p) => p.pe).filter((x): x is number => x != null && isFinite(x));
  const peAvg = peVals.length >= 2 ? peVals.reduce((s, x) => s + x, 0) / peVals.length : null;

  const anyAdjusted = last12.some((q) => q.adjusted);
  const anyGap = last12.some((q) => q.revenue === null && !q.adjusted);

  const tooltipStyle = {
    direction: "rtl" as const,
    fontSize: 12,
    background: "var(--surface, #fff)",
    border: "1px solid var(--line)",
    borderRadius: 8,
  };

  return (
    <section className="card p-4 sm:p-5 scroll-mt-24" id="quarterly">
      <header className="mb-3">
        <h3 className="text-[15px] font-bold" style={{ color: "var(--navy)" }}>
          تحلیل فصلی (ن-۱۰)
        </h3>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          فصل‌سازی با تفاضل گزارش‌های تجمیعی ۳/۶/۹/۱۲ماهه — منبع: {sourceTitle}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="درآمد و سود خالص فصلی"
          question="فروش و سودآوری فصل‌به‌فصل چگونه تغییر کرده است؟"
          note={[
            "واحد: میلیارد تومان.",
            anyGap ? "فصل‌هایی که گزارش زنجیرهٔ کامل ندارند بدون ستون‌اند (هیچ درون‌یابی نمی‌شود)." : "",
            anyAdjusted ? "فصل‌های دارای تعدیل گزارش قبلی (تفاضل منفی درآمد) حذف شده‌اند." : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div style={{ width: "100%", height: 250 }} dir="ltr">
            <ResponsiveContainer>
              <BarChart data={revData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} height={50} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} width={54} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [v == null ? "—" : `${nf1.format(Number(v))} میلیارد تومان`, String(name)]}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="درآمد" fill="var(--navy)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="سود خالص" fill="var(--gold)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="روند حاشیه‌های سود"
          question="کیفیت سودآوری (حاشیهٔ ناخالص، عملیاتی، خالص) رو به بهبود است یا افت؟"
          note="حاشیه = نسبت به درآمد همان فصل (٪)؛ فصل بدون درآمد مثبت نقطه ندارد."
        >
          <div style={{ width: "100%", height: 250 }} dir="ltr">
            <ResponsiveContainer>
              <LineChart data={marginData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} height={50} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} width={38} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [v == null ? "—" : `٪${nf1.format(Number(v))}`, String(name)]}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ناخالص" stroke="var(--navy)" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="عملیاتی" stroke="var(--gold)" dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="خالص" stroke="var(--success)" dot={{ r: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        {peData.filter((p) => p.pe != null).length >= 2 ? (
          <Card
            title="P/E دوازده‌ماهه (TTM)"
            question="نسبت قیمت به سود ۱۲ماهه اکنون کجای تاریخچهٔ خودش است؟"
            note={[
              "هر نقطه = قیمت پایانی نزدیکِ پایان فصل ÷ EPS دوازده‌ماههٔ منتهی به همان فصل.",
              "EPS TTM = مجموع سود خالص ۴ فصل متوالی × ۱۰۰۰ ÷ سرمایهٔ آخرین گزارش (سهم ۱۰۰۰ریالی).",
              "فقط پنجره‌های دارای هر ۴ فصل کامل محاسبه شده‌اند؛ EPS منفی نقطه ندارد.",
              currentPe != null ? `P/E جاری با قیمت روز: ${nf1.format(currentPe)}.` : "",
              peAvg != null ? `میانگین نقاط موجود: ${nf1.format(peAvg)}.` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div style={{ width: "100%", height: 230 }} dir="ltr">
              <ResponsiveContainer>
                <LineChart data={peData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} height={50} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} width={38} />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [v == null ? "—" : nf1.format(Number(v)), String(name)]}
                    contentStyle={tooltipStyle}
                  />
                  {peAvg != null ? (
                    <ReferenceLine y={peAvg} stroke="var(--line-strong)" strokeDasharray="6 4" />
                  ) : null}
                  <Line type="monotone" dataKey="pe" name="P/E TTM" stroke="var(--navy)" dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : ttm.length > 0 ? (
          <p className="text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
            EPS دوازده‌ماهه محاسبه شد ({faDigits(ttm.length)} نقطه) اما قیمت تاریخی پایان فصل برای رسم
            نمودار P/E در دسترس نیست.
          </p>
        ) : (
          <p className="text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
            برای محاسبهٔ P/E دوازده‌ماهه، ۴ فصل متوالیِ کامل لازم است که هنوز در گزارش‌های موجود این
            نماد فراهم نیست.
          </p>
        )}
      </div>
    </section>
  );
}
