"use client";

// جدول پنل رصد ادمین (اسکرینر گلوگاه) — SPEC-admin-market-radar §2.
// عدد خام کامل چندبعدی (نمای ادمین — ماسک کیفی ندارد؛ این پنل هرگز عمومی نمی‌شود).
// سورت چندبعدی: کلیک = ستون اول سورت؛ Shift+کلیک = افزودن ستون به زنجیرهٔ سورت.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  multiSort,
  matchesPreset,
  PRESETS,
  type PresetKey,
  type RadarRow,
  type SortSpec,
} from "@/lib/core/marketRadar";
import { toPersianDigits, formatJalaliShort } from "@/lib/format";

/* ── تعریف ستون‌ها ── */

interface Col {
  key: keyof RadarRow;
  label: string;
  hint: string;
  fmt: (v: number) => string;
  /** رنگ‌گذاری علامت‌دار (سبز/قرمز) */
  signed?: boolean;
}

function n(v: number, digits = 2): string {
  return toPersianDigits(
    v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
  );
}

const COLS: Col[] = [
  { key: "perCapitaBuy", label: "سرانهٔ خرید", hint: "میلیون تومان به‌ازای هر خریدار حقیقی", fmt: (v) => n(v, 1) },
  { key: "buyerPower", label: "قدرت خریدار", hint: "> ۱ = قدرت خریدار بالاتر", fmt: (v) => n(v, 2), signed: false },
  { key: "realMoneyFlow", label: "ورود پول حقیقی", hint: "میلیون تومان — مثبت = ورود", fmt: (v) => n(v, 0), signed: true },
  { key: "legalSellShare", label: "سهم حقوقی از فروش", hint: "نسبت از ارزش کل معاملات", fmt: (v) => n(v * 100, 1) + "٪" },
  { key: "divergence", label: "واگرایی پایانی/آخرین", hint: "(آخرین − پایانی) ÷ پایانی", fmt: (v) => n(v * 100, 2) + "٪", signed: true },
  { key: "volumeRatio", label: "نسبت حجم (۱۰ر)", hint: "> ۲ ≈ حجم مشکوک", fmt: (v) => n(v, 2) },
  { key: "yoyMonthly", label: "YoY فروش ماهانه", hint: "ن-۳۰ — همان ماه سال قبل", fmt: (v) => n(v, 1) + "٪", signed: true },
  { key: "prodSalesGap", label: "شکاف تولید−فروش", hint: "منفی = تخلیهٔ انبار (واحد مقداری شرکت)", fmt: (v) => n(v, 0), signed: true },
  { key: "exportSharePct", label: "سهم صادرات", hint: "از فروش آخرین ماه ن-۳۰", fmt: (v) => n(v, 1) + "٪" },
];

/* ── فیلتر آستانه ── */

interface Threshold {
  key: keyof RadarRow;
  min: string;
}

export default function AdminMarketRadar({ rows }: { rows: RadarRow[] }) {
  const [sorts, setSorts] = useState<SortSpec[]>([{ key: "volumeRatio", dir: "desc" }]);
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [query, setQuery] = useState("");

  const onHeaderClick = (key: keyof RadarRow, additive: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (!additive) {
        // کلیک ساده: همین ستون تنها معیار؛ کلیک دوباره جهت را برمی‌گرداند
        if (existing && prev[0]?.key === key) {
          return [{ key, dir: existing.dir === "desc" ? "asc" : "desc" }];
        }
        return [{ key, dir: "desc" }];
      }
      // Shift+کلیک: افزودن/تغییر جهت در زنجیره
      if (existing) {
        return prev.map((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : s));
      }
      return [...prev, { key, dir: "desc" }];
    });
  };

  const setThreshold = (key: keyof RadarRow, min: string) => {
    setThresholds((prev) => {
      const rest = prev.filter((t) => t.key !== key);
      return min.trim() === "" ? rest : [...rest, { key, min }];
    });
  };

  const visible = useMemo(() => {
    let out = rows;
    if (query.trim()) {
      const q = query.trim();
      out = out.filter((r) => r.symbol.includes(q));
    }
    if (preset) out = out.filter((r) => matchesPreset(r, preset));
    for (const t of thresholds) {
      const min = Number(t.min.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
      if (!isFinite(min)) continue;
      out = out.filter((r) => {
        const v = r[t.key];
        return typeof v === "number" && v > min;
      });
    }
    return multiSort(out, sorts);
  }, [rows, sorts, preset, thresholds, query]);

  const latestDate = rows.reduce((a, r) => (r.tradeDate > a ? r.tradeDate : a), "");

  return (
    <div className="space-y-4">
      {/* پریست‌ها + جست‌وجو */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset((p) => (p === k ? null : k))}
            title={PRESETS[k].description}
            className="rounded-full px-4 py-1.5 text-sm font-bold border transition-colors"
            style={{
              background: preset === k ? "var(--navy-deep)" : "var(--surface)",
              color: preset === k ? "var(--text-on-navy)" : "var(--text-2)",
              borderColor: "var(--line)",
            }}
          >
            {PRESETS[k].label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی نماد…"
          className="mr-auto rounded-xl border px-3 py-1.5 text-sm w-40"
          style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text-1)" }}
        />
      </div>

      {/* فیلترهای آستانه */}
      <details className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text-2)" }}>
          فیلتر آستانه (بزرگ‌تر از…)
        </summary>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {COLS.map((c) => (
            <label key={c.key} className="text-xs" style={{ color: "var(--text-3)" }}>
              <span className="block mb-1">{c.label}</span>
              <input
                inputMode="decimal"
                dir="ltr"
                value={thresholds.find((t) => t.key === c.key)?.min ?? ""}
                onChange={(e) => setThreshold(c.key, e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border px-2 py-1 text-sm"
                style={{ background: "var(--bg)", borderColor: "var(--line)", color: "var(--text-1)" }}
              />
            </label>
          ))}
        </div>
      </details>

      {/* شمارنده + راهنمای سورت */}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {toPersianDigits(visible.length)} نماد از {toPersianDigits(rows.length)} (پس از فیلتر زیرنماد/حق‌تقدم) —
        آخرین روز داده: {latestDate ? formatJalaliShort(latestDate) : "—"} · کلیک = سورت؛ Shift+کلیک = سورت چندستونه ·
        «—» یعنی دادهٔ غایب (null صادق، نه صفر)
      </p>

      {/* جدول */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-sm" style={{ background: "var(--surface)" }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="sticky right-0 px-3 py-2 text-right font-bold" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
                نماد
              </th>
              {COLS.map((c) => {
                const idx = sorts.findIndex((s) => s.key === c.key);
                const s = idx >= 0 ? sorts[idx] : null;
                return (
                  <th
                    key={c.key}
                    onClick={(e) => onHeaderClick(c.key, e.shiftKey)}
                    title={c.hint}
                    className="px-3 py-2 text-left font-bold cursor-pointer select-none whitespace-nowrap"
                    style={{ color: s ? "var(--navy-deep)" : "var(--text-2)" }}
                  >
                    {c.label}
                    {s && (
                      <span className="mr-1 text-[10px]">
                        {s.dir === "desc" ? "▼" : "▲"}
                        {sorts.length > 1 && toPersianDigits(idx + 1)}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 300).map((r) => (
              <tr key={r.symbol} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="sticky right-0 px-3 py-2 font-bold" style={{ background: "var(--surface)" }}>
                  <Link href={`/symbol/${encodeURIComponent(r.symbol)}`} style={{ color: "var(--navy-deep)" }}>
                    {r.symbol}
                  </Link>
                </td>
                {COLS.map((c) => {
                  const v = r[c.key];
                  const isNum = typeof v === "number";
                  const color =
                    isNum && c.signed
                      ? v > 0
                        ? "var(--success, #16a34a)"
                        : v < 0
                          ? "var(--danger, #dc2626)"
                          : "var(--text-1)"
                      : "var(--text-1)";
                  return (
                    <td key={c.key} dir="ltr" className="px-3 py-2 text-left whitespace-nowrap" style={{ color }}>
                      {isNum ? c.fmt(v) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                  هیچ نمادی با این شرایط پیدا نشد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length > 300 && (
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          نمایش ۳۰۰ ردیف اول — برای دیدن بقیه، فیلتر یا سورت را دقیق‌تر کنید.
        </p>
      )}
    </div>
  );
}
