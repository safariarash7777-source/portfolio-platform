"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useUrlState, useUrlBackedText } from "@/lib/useUrlState";
import IndustryDesk from "./IndustryDesk";
import { BarChart3, Search, ArrowUpDown, ChevronDown, Clock, TrendingUp, TrendingDown } from "lucide-react";
import {
  toPersianDigits,
  formatToman,
  formatTomanShort,
  formatSignedPercent,
  formatRialAsToman,
  deltaColor,
  describeDelta,
  formatJalali,
} from "@/lib/format";
import type { IrIndices } from "@/lib/market-ir";

export interface StockRow {
  id: string;
  faName: string;
  price: number;
  unit: "toman" | "usd";
  change?: number | null;
  changePercent?: number | null;
  closingPrice?: number;
  closingChangePercent?: number | null;
  volume?: number;
  value?: number;
  marketValue?: number | null;
  industry?: string | null;
  industryId?: number | null;
  eps?: number | null;
  pe?: number | null;
  buyI?: number;
  buyN?: number;
  sellI?: number;
  sellN?: number;
}

type SortKey = "faName" | "price" | "changePercent" | "value" | "marketValue" | "pe";
type SortDir = "asc" | "desc";

/** ارزش معاملات → متن فارسی */
/**
 * ارزشِ ریالیِ فید → متنِ تومانی.
 *
 * ── باگی که بسته شد ──────────────────────────────────────────────────────
 * دو تابعِ محلیِ قبلی (`fmtValue` و `fmtMarketCap`) عددِ **ریالِ** خامِ فید را
 * می‌گرفتند، بر ۱۰⁹ یا ۱۰¹² تقسیم می‌کردند و بدونِ هیچ واحدِ پولی «میلیارد» یا
 * «هزار میلیارد» می‌نوشتند. نتیجه دو خطا با هم بود: عدد **ده برابر** واقعیت
 * می‌شد، و کاربر نمی‌دانست ریال است یا تومان — در حالی که ستونِ قیمتِ همان
 * جدول تومان بود. حالا هر دو از یک نقطهٔ تبدیل می‌گذرند و همیشه «تومان» را
 * در متن حمل می‌کنند.
 */
const fmtValue = formatRialAsToman;
const fmtMarketCap = formatRialAsToman;

/** پس‌زمینه/متنِ کاشیِ نقشهٔ بازار */
function tile(change: number | null) {
  if (change == null) return { bg: "var(--surface-2)", fg: "var(--text-2)" };
  const mag = Math.min(Math.abs(change), 5) / 5;
  const a = 0.16 + mag * 0.64;
  const base = change > 0 ? "21,128,61" : change < 0 ? "185,28,28" : "100,116,139";
  return { bg: `rgba(${base},${a.toFixed(2)})`, fg: a > 0.5 ? "var(--text-on-navy)" : "var(--text)" };
}

function rowsOf<T>(arr: T[], cols: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += cols) result.push(arr.slice(i, i + cols));
  return result;
}

interface Props {
  stocks: StockRow[];
  indices: IrIndices | null;
  fetchedAt: number | null;
}

type ViewKey = "table" | "map" | "industry";

const VIEWS: Array<{ key: ViewKey; label: string }> = [
  { key: "table", label: "جدول" },
  { key: "map", label: "نقشهٔ نمادها" },
  { key: "industry", label: "صنایع" },
];

const isViewKey = (v: string): v is ViewKey => VIEWS.some((x) => x.key === v);

export default function StocksBoard({ stocks, indices, fetchedAt }: Props) {
  // نما، جست‌وجو و فیلترِ صنعت در URL می‌نشینند تا back/forward و برگشت از
  // صفحهٔ نماد وضعیت را حفظ کنند. مرتب‌سازی عمداً محلی می‌ماند: حالتِ گذرایی
  // است که کاربر انتظارِ اشتراک‌گذاری‌اش را ندارد.
  const url = useUrlState();
  const rawView = url.get("view", "table");
  const view: ViewKey = isViewKey(rawView) ? rawView : "table";
  const [search, setSearch] = useUrlBackedText("q");
  const industryFilter = url.get("industry", "همه");

  const setView = (v: ViewKey) => url.set({ view: v === "table" ? null : v });
  const setIndustryFilter = (v: string) => url.set({ industry: v === "همه" ? null : v });

  const tableAnchorRef = useRef<HTMLDivElement | null>(null);

  /** کلیک روی صنعت در نقشه/میز → فیلتر جدول نمادها (M2/M3) */
  const selectIndustry = (industry: string) => {
    const next = industryFilter === industry ? "همه" : industry;
    // انتخابِ صنعت از نمای «صنایع» کاربر را به جدولِ همان صنعت می‌برد — وگرنه
    // فیلتر عوض می‌شود ولی نتیجه‌اش در نمای فعلی دیده نمی‌شود.
    url.set({ industry: next === "همه" ? null : next, view: null });
    tableAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Industries
  const industries = useMemo(() => {
    const s = new Set<string>();
    for (const st of stocks) if (st.industry) s.add(st.industry);
    return ["همه", ...[...s].sort()];
  }, [stocks]);

  // Filter
  const filtered = useMemo(() => {
    let rows = stocks;
    if (industryFilter !== "همه") {
      rows = rows.filter((s) => s.industry === industryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((s) => s.faName.includes(q) || s.id.toLowerCase().includes(q));
    }
    return rows;
  }, [stocks, industryFilter, search]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "faName":
          return sortDir === "asc"
            ? a.faName.localeCompare(b.faName, "fa")
            : b.faName.localeCompare(a.faName, "fa");
        case "price":
          av = a.price; bv = b.price; break;
        case "changePercent":
          av = a.changePercent ?? a.closingChangePercent ?? 0;
          bv = b.changePercent ?? b.closingChangePercent ?? 0;
          break;
        case "value":
          av = a.value ?? 0; bv = b.value ?? 0; break;
        case "marketValue":
          av = a.marketValue ?? 0; bv = b.marketValue ?? 0; break;
        case "pe":
          av = a.pe ?? 9999; bv = b.pe ?? 9999; break;
        default:
          av = 0; bv = 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Heatmap cells (top 30 by market value)
  const mapCells = useMemo(
    () => [...filtered].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0, 30),
    [filtered]
  );

  // Empty state
  if (stocks.length === 0) {
    return (
      <div className="card p-6 flex items-start gap-3">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--gold-tint)", color: "var(--heading)" }}
        >
          <BarChart3 size={18} />
        </span>
        <div>
          <h3 className="font-display font-bold" style={{ color: "var(--heading)" }}>
            نمای بازار سهام
          </h3>
          <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
            به‌محضِ اتصالِ منبعِ دادهٔ بازارِ ایران، جدول نمادها و شاخص‌ها همین‌جا نمایش داده می‌شود.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── سربرگ ────────────────────────────────────────────────────────────
          عنوانِ صفحه، تاریخ و وضعیتِ تابلو حالا در پوستهٔ مشترک (`MarketShell`)
          هستند. تکرارشان اینجا یعنی دو عنوان و دو مهرِ زمانی روی یک صفحه — پس
          فقط چیزی می‌ماند که پوسته نمی‌گوید: شمارِ نمادها و راهِ بانکِ داده. */}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {toPersianDigits(stocks.length)} نماد در آخرین اسنپ‌شات
        {" · "}
        <Link href="/data" className="font-bold hover:underline" style={{ color: "var(--navy-ink)" }}>
          تاریخچه و خروجی CSV در بانک داده
        </Link>
      </p>

      {/* Indices */}
      {indices && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IndexCard
            label="شاخص کل"
            value={indices.total}
            change={indices.totalChange}
          />
          <IndexCard
            label="شاخص هم‌وزن"
            value={indices.equalWeight}
            change={indices.equalWeightChange}
          />
          <div className="card p-4">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>ارزش بازار</p>
            <p className="font-display font-bold mt-1.5 text-lg" style={{ color: "var(--heading)", fontVariantNumeric: "tabular-nums" }}>
              {indices.marketValue > 0 ? fmtMarketCap(indices.marketValue) : "—"}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>ارزش معاملات</p>
            <p className="font-display font-bold mt-1.5 text-lg" style={{ color: "var(--heading)", fontVariantNumeric: "tabular-nums" }}>
              {indices.value > 0 ? fmtValue(indices.value) : "—"}
            </p>
          </div>
        </div>
      )}




      {/* Search + Filter */}
      <div ref={tableAnchorRef} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 start-3"
            style={{ color: "var(--text-3)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نماد یا نام..."
            className="w-full rounded-lg border ps-9 pe-3 py-2.5 text-sm"
            style={{
              background: "var(--surface)",
              borderColor: "var(--line)",
              color: "var(--text)",
            }}
          />
        </div>
        <div className="relative">
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="appearance-none rounded-lg border px-4 py-2.5 pe-9 text-sm"
            style={{
              background: "var(--surface)",
              borderColor: "var(--line)",
              color: "var(--text)",
            }}
          >
            {industries.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none"
            style={{ color: "var(--text-3)" }}
          />
        </div>
      </div>

      {/* ── انتخابِ نما ──────────────────────────────────────────────────────
          سه نمای سنگین (جدول، نقشه، صنایع) پیش از این پشتِ سرِ هم روی صفحه
          می‌نشستند و جست‌وجوی جدول را حدودِ ۲۲۰۰ پیکسل پایین می‌بردند. حالا
          هم‌زمان فقط یکی mount می‌شود — هم صفحه کوتاه‌تر است، هم نمودار و
          جدولِ پنهان هزینهٔ رندر نمی‌دهند.

          فیلترِ صنعت و جست‌وجو بالای این سوییچ‌اند، پس بینِ نماها **مشترک**
          می‌مانند: نقشه و جدول همیشه یک جامعه را نشان می‌دهند. */}
      <div role="tablist" aria-label="نمای تابلوی سهام" className="flex flex-wrap gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-2)", width: "fit-content" }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className="rounded-md px-4 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={{
              minHeight: 40,
              background: view === v.key ? "var(--surface)" : "transparent",
              color: view === v.key ? "var(--navy-ink)" : "var(--text-2)",
              boxShadow: view === v.key ? "var(--shadow-sm)" : "none",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* شمارشِ نتیجه و جامعه — همیشه، در هر نما. */}
      <p className="text-[11.5px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
        {`${toPersianDigits(filtered.length)} نتیجه از ${toPersianDigits(stocks.length)} نماد`}
        {industryFilter !== "همه" ? ` · صنعت: ${industryFilter}` : ""}
        {search.trim() ? ` · جست‌وجو: «${search.trim()}»` : ""}
      </p>

      {view === "map" ? (
        <>
      {/* Heatmap */}
      {mapCells.length > 0 && mapCells.some((c) => c.marketValue && c.marketValue > 0) && (
        <div className="card p-5">
          <h3 className="font-display font-bold mb-1" style={{ color: "var(--heading)" }}>
            نقشهٔ بازار
          </h3>
          <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>
            اندازه: ارزش بازار · رنگ: تغییر قیمت
          </p>
          <div className="space-y-1.5">
            {rowsOf(mapCells.filter((c) => c.marketValue && c.marketValue > 0), 5).map((r, ri) => (
              <div key={ri} className="flex gap-1.5">
                {r.map((s) => {
                  const pct = s.changePercent ?? s.closingChangePercent ?? null;
                  const t = tile(pct);
                  return (
                    <div
                      key={s.id}
                      className="rounded-md px-2 py-2 min-w-0 flex flex-col justify-center"
                      style={{
                        flexGrow: Math.max(s.marketValue ?? 1, 1),
                        flexBasis: 0,
                        background: t.bg,
                        minWidth: 56,
                        minHeight: 52,
                      }}
                      title={`${s.id} ${s.faName} — ${pct != null ? formatSignedPercent(pct) : "—"}`}
                    >
                      <span className="text-[11px] font-bold truncate" style={{ color: t.fg }}>
                        {s.id}
                      </span>
                      {pct != null && (
                        <span className="text-[10px]" style={{ color: t.fg, fontVariantNumeric: "tabular-nums" }}>
                          {formatSignedPercent(pct)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

          {/* پوششِ نقشه — «۲۴ نمادِ اول» با «کلِ بازار» یکی نیست، و کاشیِ بدونِ
              ارزشِ بازار اصلاً کشیده نمی‌شود (مساحتِ ساختگی ممنوع). */}
          <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
            نقشه حداکثر ۲۴ نمادِ بزرگ‌ترِ نتیجهٔ فیلتر را می‌کشد و نمادِ فاقدِ ارزشِ بازار در آن
            نمی‌آید. برای دیدنِ همهٔ نتایج از نمای «جدول» استفاده کنید.
          </p>
        </>
      ) : view === "industry" ? (
        /* نقشهٔ صنایع + میز صنایع (M2/M3 — رصد بازار). کلیک روی یک صنعت
           فیلترِ مشترک را عوض می‌کند، پس جدول و نقشه هم با آن هماهنگ می‌شوند. */
        <IndustryDesk
          stocks={stocks}
          onSelectIndustry={selectIndustry}
          selectedIndustry={industryFilter !== "همه" ? industryFilter : undefined}
        />
      ) : (
        <>
      {/* Table — Desktop */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--text)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <SortTh label="نماد" sortKey="faName" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortTh label="آخرین (تومان)" sortKey="price" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="تغییر" sortKey="changePercent" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="ارزش معاملات" sortKey="value" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="P/E" sortKey="pe" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="ارزش بازار" sortKey="marketValue" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((s) => {
              const pct = s.changePercent ?? s.closingChangePercent ?? null;
              return (
                <tr key={s.id} className="hover:bg-[var(--surface-2)]" style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className="py-3 px-4">
                    <Link
                      href={`/symbol/${encodeURIComponent(s.id)}`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--heading)" }}
                      title={`صفحهٔ نماد ${s.id}`}
                    >
                      {s.id}
                    </Link>
                    {/* C1 — UI نمادمحور: فقط نماد؛ نام کامل فقط در هدر صفحهٔ نماد */}
                    {s.industry && (
                      <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                        {s.industry}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatToman(s.price)}
                  </td>
                  <td className="py-3 px-4 text-left font-bold" style={{ color: pct != null ? deltaColor(pct) : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                    {pct != null ? formatSignedPercent(pct) : "—"}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                    {s.value ? fmtValue(s.value) : "—"}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                    {s.pe ? toPersianDigits(s.pe.toFixed(1)) : "—"}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                    {s.marketValue ? fmtMarketCap(s.marketValue) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>
            نمادی با این فیلتر یافت نشد.
          </p>
        )}
        {sorted.length > 100 && (
          <p className="text-center py-4 text-xs" style={{ color: "var(--text-3)" }}>
            نمایش ۱۰۰ نماد از {toPersianDigits(sorted.length)} — از جستجو و فیلتر استفاده کنید.
          </p>
        )}
      </div>

      {/* Cards — Mobile */}
      <div className="md:hidden space-y-3">
        {sorted.slice(0, 50).map((s) => {
          const pct = s.changePercent ?? s.closingChangePercent ?? null;
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/symbol/${encodeURIComponent(s.id)}`}
                    className="font-bold text-sm hover:underline"
                    style={{ color: "var(--heading)" }}
                  >
                    {s.id}
                  </Link>
                  {/* C1 — UI نمادمحور: نام کامل حذف شد */}
                </div>
                {pct != null && (
                  <span
                    className="text-sm font-bold flex-shrink-0"
                    style={{ color: deltaColor(pct), fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatSignedPercent(pct)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs" style={{ color: "var(--text-2)" }}>
                <span>{formatToman(s.price)}</span>
                {s.value ? <span>ارزش: {fmtValue(s.value)}</span> : null}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>
            نمادی با این فیلتر یافت نشد.
          </p>
        )}
          </div>
        </>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        داده از بازار بورس و فرابورس (منبع رسمی)؛ صرفاً اطلاع‌رسانی و بدون توصیهٔ خرید/فروش.
      </p>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function IndexCard({ label, value, change }: { label: string; value: number; change: number }) {
  const pct = value > 0 ? (change / value) * 100 : 0;
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>{label}</p>
      <p className="font-display font-bold mt-1.5 text-lg" style={{ color: "var(--heading)", fontVariantNumeric: "tabular-nums" }}>
        {toPersianDigits(Math.round(value).toLocaleString("en-US")).replace(/,/g, "٬")}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <Icon size={12} style={{ color: deltaColor(change) }} />
        <span className="text-xs font-bold" style={{ color: deltaColor(change), fontVariantNumeric: "tabular-nums" }}>
          {formatSignedPercent(pct)}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
          ({toPersianDigits(Math.abs(Math.round(change)).toLocaleString("en-US")).replace(/,/g, "٬")})
        </span>
      </div>
    </div>
  );
}

function SortTh({
  label,
  sortKey: key,
  current,
  dir,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "right" | "left";
}) {
  const active = current === key;
  return (
    <th
      className={`py-3 px-4 font-bold cursor-pointer select-none whitespace-nowrap text-${align}`}
      style={{ color: active ? "var(--navy-deep)" : "var(--text-3)" }}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={active ? "opacity-100" : "opacity-40"} />
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}
