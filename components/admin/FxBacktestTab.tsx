"use client";
// تب «صحت پیش‌بینی» — ارزیابی گذشته‌نگر: «اگر در سال t پیش‌بینی می‌کردیم چه می‌شد؟»
//
// دو نما:
//  ۱) بازپخش یک سال شروع: مسیر PPP و پولی از لنگر واقعی سال t در برابر نرخ
//     واقعی بازار سال‌های بعد + جدول خطای هر افق.
//  ۲) جمع‌بندی همهٔ سال‌های شروع: MAPE و سوگیری هر مدل به تفکیک افق ۱..۵ سال.
//
// برچسب صداقت: شبه‌برون‌نمونه‌ای — فرضیات کلان سال‌های بعد «واقعیِ پسین»اند؛
// خطای گزارش‌شده خطای ساختار مدل است، نه خطای پیش‌بینی فرضیات.

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { backtestRun, accuracyByHorizon, validStartYears } from "@/lib/fx/backtest";
import type { MacroRow } from "@/lib/fx/engine";
import { toPersianDigits } from "@/lib/format";

function fa(v: number, digits = 0): string {
  return toPersianDigits(
    v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
  );
}
function faSigned(v: number, digits = 1): string {
  const s = `${toPersianDigits(Math.abs(v).toFixed(digits))}٪`;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

const COLORS = { actual: "#0f3d5c", ppp: "#b8860b", monetary: "#7c3aed" };

export default function FxBacktestTab({
  macro,
  baseRates,
  marketAnnual,
}: {
  macro: MacroRow[];
  baseRates: Record<string, number>;
  marketAnnual: Record<number, number>;
}) {
  // actual = نرخ‌های پایهٔ تاریخی + میانگین زندهٔ بازار برای سال‌هایی که seed ندارند
  const actual = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(baseRates)) if (v > 0) out[Number(k)] = v;
    for (const [k, v] of Object.entries(marketAnnual)) {
      const y = Number(k);
      if (out[y] == null && v > 0) out[y] = v;
    }
    return out;
  }, [baseRates, marketAnnual]);

  const starts = useMemo(() => validStartYears(actual, 1357), [actual]);
  const defaultStart = starts.includes(1398) ? 1398 : starts[starts.length - 1] ?? 1398;
  const [startYear, setStartYear] = useState<number>(defaultStart);
  const [horizon, setHorizon] = useState<number>(5);

  const pppRun = useMemo(() => backtestRun(macro, actual, "ppp", startYear, horizon), [macro, actual, startYear, horizon]);
  const monRun = useMemo(() => backtestRun(macro, actual, "monetary", startYear, horizon), [macro, actual, startYear, horizon]);

  const chartData = useMemo(() => {
    const years = new Set<number>([startYear]);
    for (const p of pppRun?.points ?? []) years.add(p.year);
    for (const p of monRun?.points ?? []) years.add(p.year);
    return [...years].sort((a, b) => a - b).map((y) => ({
      year: toPersianDigits(String(y)),
      actual: actual[y] ?? null,
      ppp: y === startYear ? actual[y] ?? null : pppRun?.points.find((p) => p.year === y)?.predicted ?? null,
      monetary: y === startYear ? actual[y] ?? null : monRun?.points.find((p) => p.year === y)?.predicted ?? null,
    }));
  }, [pppRun, monRun, actual, startYear]);

  const accPpp = useMemo(() => accuracyByHorizon(macro, actual, "ppp", starts, 5), [macro, actual, starts]);
  const accMon = useMemo(() => accuracyByHorizon(macro, actual, "monetary", starts, 5), [macro, actual, starts]);

  return (
    <div className="space-y-4">
      {/* برچسب روش‌شناسی — صداقت */}
      <div
        className="rounded-xl border p-3 text-[12px]"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}
      >
        روش: شبه‌برون‌نمونه‌ای — مدل از نرخ واقعی بازار در سال شروع لنگر می‌شود و با دادهٔ کلان
        واقعیِ سال‌های بعد جلو می‌رود؛ خطای گزارش‌شده «خطای ساختار مدل» است، نه خطای پیش‌بینی
        فرضیات کلان (که در آن زمان معلوم نبودند). منبع واقعیت: نرخ‌های پایهٔ تاریخی + میانگین زندهٔ بازار.
      </div>

      {/* انتخاب سال شروع و افق */}
      <div className="rounded-xl border p-4 flex flex-wrap items-center gap-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <label className="text-sm flex items-center gap-2" style={{ color: "var(--text-2)" }}>
          سال شروع پیش‌بینی:
          <select
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
            className="rounded-lg border px-2 py-1 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-1)" }}
          >
            {[...starts].reverse().map((y) => (
              <option key={y} value={y}>{toPersianDigits(String(y))}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2" style={{ color: "var(--text-2)" }}>
          افق (سال):
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="rounded-lg border px-2 py-1 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-1)" }}
          >
            {[1, 2, 3, 4, 5, 7, 10].map((h) => (
              <option key={h} value={h}>{toPersianDigits(String(h))}</option>
            ))}
          </select>
        </label>
        {pppRun ? (
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            لنگر: نرخ واقعی {toPersianDigits(String(startYear))} = {fa(pppRun.anchorRate)} تومان
          </span>
        ) : null}
      </div>

      {/* نمودار بازپخش */}
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: "var(--navy-deep)" }}>
          بازپخش پیش‌بینی از سال {toPersianDigits(String(startYear))} — مدل در برابر واقعیت
        </h3>
        <div style={{ height: 320 }} dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fa(v)} width={70} />
              <Tooltip formatter={(v) => (typeof v === "number" ? `${fa(v)} تومان` : "—")} />
              <Legend />
              <Line type="monotone" dataKey="actual" name="واقعیت (بازار)" stroke={COLORS.actual} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="ppp" name="PPP (تورم نسبی)" stroke={COLORS.ppp} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="monetary" name="پولی (نقدینگی نسبی)" stroke={COLORS.monetary} strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* جدول خطای بازپخش */}
        <table className="w-full text-[12px] mt-3">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th className="text-right p-1 font-normal">سال</th>
              <th className="text-right p-1 font-normal">واقعیت</th>
              <th className="text-right p-1 font-normal">PPP</th>
              <th className="text-right p-1 font-normal">خطای PPP</th>
              <th className="text-right p-1 font-normal">پولی</th>
              <th className="text-right p-1 font-normal">خطای پولی</th>
            </tr>
          </thead>
          <tbody style={{ color: "var(--text-1)" }}>
            {(pppRun?.points ?? []).map((p) => {
              const mp = monRun?.points.find((x) => x.year === p.year);
              return (
                <tr key={p.year} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-1">{toPersianDigits(String(p.year))}</td>
                  <td className="p-1">{fa(p.actual)}</td>
                  <td className="p-1">{fa(p.predicted)}</td>
                  <td className="p-1" dir="ltr" style={{ textAlign: "right" }}>{faSigned(p.errorPct)}</td>
                  <td className="p-1">{mp ? fa(mp.predicted) : "—"}</td>
                  <td className="p-1" dir="ltr" style={{ textAlign: "right" }}>{mp ? faSigned(mp.errorPct) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* جمع‌بندی همهٔ سال‌های شروع */}
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
          جمع‌بندی تاریخی — میانگین قدر مطلق خطا (MAPE) و سوگیری به تفکیک افق
        </h3>
        <p className="text-[11px] mb-2" style={{ color: "var(--text-3)" }}>
          روی همهٔ {toPersianDigits(String(starts.length))} سال شروع ممکن ({toPersianDigits(String(starts[0] ?? ""))}..{toPersianDigits(String(starts[starts.length - 1] ?? ""))}).
          سوگیری مثبت = مدل به‌طور متوسط بالاتر از واقعیت.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th className="text-right p-1 font-normal">افق</th>
              <th className="text-right p-1 font-normal">MAPE مدل PPP</th>
              <th className="text-right p-1 font-normal">سوگیری PPP</th>
              <th className="text-right p-1 font-normal">MAPE مدل پولی</th>
              <th className="text-right p-1 font-normal">سوگیری پولی</th>
              <th className="text-right p-1 font-normal">n</th>
            </tr>
          </thead>
          <tbody style={{ color: "var(--text-1)" }}>
            {accPpp.map((a) => {
              const m = accMon.find((x) => x.horizon === a.horizon);
              return (
                <tr key={a.horizon} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-1">{toPersianDigits(String(a.horizon))} سال</td>
                  <td className="p-1">{toPersianDigits(a.mape.toFixed(1))}٪</td>
                  <td className="p-1" dir="ltr" style={{ textAlign: "right" }}>{faSigned(a.bias)}</td>
                  <td className="p-1">{m ? `${toPersianDigits(m.mape.toFixed(1))}٪` : "—"}</td>
                  <td className="p-1" dir="ltr" style={{ textAlign: "right" }}>{m ? faSigned(m.bias) : "—"}</td>
                  <td className="p-1">{toPersianDigits(String(a.n))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
          خوانش: خطا با افق افزایش می‌یابد (تجمعی). این سنجه توصیفی است — نه توصیهٔ سرمایه‌گذاری.
        </p>
      </div>
    </div>
  );
}
