"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useUrlState, useUrlBackedText } from "@/lib/useUrlState";
import { fundCategory, countByCategory, FUND_CATEGORIES, ALL_CATEGORIES } from "@/lib/core/fundCategory";
import Term from "@/components/learn/Term";
import { PieChart, Search, ArrowUpDown, ChevronDown, Clock, ArrowLeft, SlidersHorizontal } from "lucide-react";
import {
  toPersianDigits,
  formatToman,
  formatTomanShort,
  formatSignedPercent,
  deltaColor,
  describeDelta,
  formatJalali,
  sumCovered,
  formatRialAsToman,
} from "@/lib/format";

export interface FundRow {
  id: string;
  faName: string;
  price: number;
  unit: "toman" | "usd";
  type?: string;
  change?: number | null;
  changePercent?: number | null;
  closingPrice?: number;
  closingChangePercent?: number | null;
  volume?: number;
  value?: number;
  marketValue?: number | null;
  industry?: string | null;
  nav?: number | null;
  navIssue?: number | null;
  navDate?: string | null;
  navTime?: string | null;
  bubblePercent?: number | null;
  /** بازدهٔ دوره‌ای از symbol_history (M6) — null = دادهٔ کافی نیست */
  ret1w?: number | null;
  ret1m?: number | null;
  ret3m?: number | null;
}

type SortKey = "faName" | "price" | "changePercent" | "value" | "marketValue" | "bubblePercent" | "ret1w" | "ret1m" | "ret3m";
type SortDir = "asc" | "desc";

/** میلیارد تومان → متن فارسی */
function fmtAssetB(b: number): string {
  if (b >= 1000) {
    const t = b / 1000;
    return `${toPersianDigits(t.toFixed(t % 1 === 0 ? 0 : 1)).replace(".", "٫")} هزار میلیارد`;
  }
  return `${toPersianDigits(b.toLocaleString("en-US")).replace(/,/g, "٬")} میلیارد`;
}

/** ارزش معاملات → متن فارسی (میلیارد تومان) */
function fmtValue(v: number): string {
  const b = v / 1_000_000_000;
  if (b >= 1) return `${toPersianDigits(b.toFixed(1)).replace(".", "٫")} میلیارد`;
  const m = v / 1_000_000;
  return `${toPersianDigits(Math.round(m).toLocaleString("en-US")).replace(/,/g, "٬")} میلیون`;
}

/**
 * رنگِ حباب — **خنثی و جهت‌دار، نه ارزش‌گذارانه**.
 *
 * ── چرا سبز/قرمزِ قبلی غلط بود ────────────────────────────────────────────
 * نسخهٔ قبل حبابِ منفی را **سبز** می‌کرد. سبز در همین صفحه معنای ثابتی دارد:
 * «مطلوب». پس صندوقی که زیرِ NAV معامله می‌شد به‌طور خودکار «فرصت» دیده
 * می‌شد — یک قضاوتِ سرمایه‌گذاری که سامانه اجازهٔ بیانش را ندارد، و در ضمن
 * غلط هم هست: حبابِ منفیِ پایدار معمولاً نشانهٔ نقدشوندگیِ ضعیف است، نه تخفیف.
 *
 * حالا هر دو جهت با **طلاییِ برند** (رنگِ توجه، نه رنگِ خوب/بد) علامت می‌خورند
 * و جهت را علامتِ خودِ عدد (+/−) می‌گوید، نه رنگ.
 */
function bubbleColor(b: number): string {
  return Math.abs(b) > 0.05 ? "var(--gold-ink)" : "var(--text-3)";
}

/** پس‌زمینه/متنِ کاشیِ نقشهٔ بازار */
function tile(change: number | null) {
  if (change == null) return { bg: "var(--surface-2)", fg: "var(--text-2)" };
  const mag = Math.min(Math.abs(change), 4) / 4;
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
  funds: FundRow[];
  fetchedAt: number | null;
}

/** سقفِ ردیفِ جدول پیش از «نمایشِ بیشتر». */
const ROW_PAGE = 60;

export default function FundsFullBoard({ funds, fetchedAt }: Props) {
  // دسته و جست‌وجو در URL می‌نشینند تا برگشت از صفحهٔ صندوق وضعیت را نگه دارد.
  const url = useUrlState();
  const typeFilter = url.get("type", ALL_CATEGORIES);
  const [search, setSearch] = useUrlBackedText("q");
  const setTypeFilter = (v: string) => url.set({ type: v === ALL_CATEGORIES ? null : v });

  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);

  // دسته‌های کوتاه با تعدادِ واقعیِ هر کدام — برچسبِ بدونِ عدد نمی‌گوید
  // «کلیک‌کردن ارزشش را دارد یا نه».
  const categoryCounts = useMemo(() => countByCategory(funds), [funds]);

  // Filter
  const filtered = useMemo(() => {
    let rows = funds;
    if (typeFilter !== ALL_CATEGORIES) {
      rows = rows.filter((f) => fundCategory(f.type ?? f.industry ?? null) === typeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((f) => f.faName.includes(q) || f.id.toLowerCase().includes(q));
    }
    return rows;
  }, [funds, typeFilter, search]);

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
        case "bubblePercent": {
          // صندوق‌های بدون NAV همیشه انتهای فهرست
          const an = a.bubblePercent;
          const bn = b.bubblePercent;
          if (an == null && bn == null) return 0;
          if (an == null) return 1;
          if (bn == null) return -1;
          return sortDir === "asc" ? an - bn : bn - an;
        }
        case "ret1w":
        case "ret1m":
        case "ret3m": {
          // nulls-last — پذیرش M6: نماد بدون داده همیشه انتهای فهرست
          const an = a[sortKey];
          const bn = b[sortKey];
          if (an == null && bn == null) return 0;
          if (an == null) return 1;
          if (bn == null) return -1;
          return sortDir === "asc" ? an - bn : bn - an;
        }
        default:
          av = 0; bv = 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  /**
   * سقفِ ردیف.
   *
   * جدول تا امروز هر ۳۳۰ صندوق را **دو بار** رندر می‌کرد (جدولِ دسکتاپ و
   * کارت‌های موبایل، هر دو در DOM) و صفحه به حدودِ ۲۴٬۷۰۰ پیکسل می‌رسید.
   * حالا تا `rowLimit` ردیف می‌آید و بقیه با یک دکمه. هیچ صندوقی حذف نشده —
   * شمارِ کل و تعدادِ نمایش‌داده‌شده هر دو زیرِ جدول نوشته می‌شوند.
   */
  const visible = useMemo(() => sorted.slice(0, rowLimit), [sorted, rowLimit]);
  const hiddenCount = Math.max(0, sorted.length - visible.length);

  // آیا دست‌کم یک صندوق NAV دارد؟ (ستون‌های NAV/حباب فقط در این حالت)
  const hasNav = useMemo(() => funds.some((f) => f.nav != null), [funds]);
  // آیا دست‌کم یک صندوق بازدهٔ دوره‌ای دارد؟ (M6 — ستون‌ها فقط وقتی داده هست)
  const hasReturns = useMemo(
    () => funds.some((f) => f.ret1w != null || f.ret1m != null || f.ret3m != null),
    [funds]
  );
  const retCovered = useMemo(
    () => funds.filter((f) => f.ret1w != null || f.ret1m != null || f.ret3m != null).length,
    [funds]
  );

  // Stats
  const stats = useMemo(() => {
    const withChange = filtered.filter(
      (f) => typeof (f.changePercent ?? f.closingChangePercent) === "number"
    );
    // «ناموجود» با «صفر» یکی نمی‌شود: جمع فقط از ردیف‌های دارای داده ساخته
    // می‌شود و تعدادشان همراهِ عدد گزارش می‌شود (باگِ «جمعِ ۰ برای ۳۲۹ صندوق»).
    const marketValue = sumCovered(filtered, (f) => f.marketValue);
    const avg = withChange.length
      ? withChange.reduce((s, f) => s + ((f.changePercent ?? f.closingChangePercent) as number), 0) / withChange.length
      : null;
    const pos = withChange.filter((f) => ((f.changePercent ?? f.closingChangePercent) as number) > 0).length;
    const posRatio = withChange.length ? Math.round((pos / withChange.length) * 100) : null;
    const withNav = filtered.filter((f) => typeof f.bubblePercent === "number");
    const avgBubble = withNav.length
      ? withNav.reduce((s, f) => s + (f.bubblePercent as number), 0) / withNav.length
      : null;
    return { count: filtered.length, marketValue, avg, posRatio, rated: withChange.length, avgBubble, navCount: withNav.length };
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Heatmap cells (top 24 by market value)
  const mapCells = useMemo(
    () => [...filtered].sort((a, b) => (b.marketValue ?? b.value ?? 0) - (a.marketValue ?? a.value ?? 0)).slice(0, 24),
    [filtered]
  );

  // Empty state
  if (funds.length === 0) {
    return (
      <div className="card p-6 flex items-start gap-3">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--gold-tint)", color: "var(--heading)" }}
        >
          <PieChart size={18} />
        </span>
        <div>
          <h3 className="font-display font-bold" style={{ color: "var(--heading)" }}>
            دیده‌بان صندوق‌ها
          </h3>
          <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
            اسنپ‌شات صندوق‌ها خالی است. تا وقتی ردیف معتبر نرسد، این صفحه عدد یا وضعیت ساختگی نشان نمی‌دهد.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="funds-explorer">
      {/* ── سربرگ ────────────────────────────────────────────────────────────
          عنوان، تاریخ و وضعیتِ تابلو در پوستهٔ مشترک‌اند؛ اینجا فقط راهنمایی
          می‌ماند که پوسته نمی‌گوید. (این بلوک تا امروز H1 دومِ صفحه بود.) */}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {toPersianDigits(funds.length)} صندوق در آخرین اسنپ‌شات · برای دیدنِ NAV، حباب و تاریخچه روی
        نمادِ صندوق بزنید.
      </p>

      {/* KPIs */}
      <div className={hasNav ? "grid grid-cols-2 md:grid-cols-5 gap-3" : "grid grid-cols-2 md:grid-cols-4 gap-3"}>
        {/* «تعدادِ نتیجهٔ فیلتر» و «کلِ بازار» دو عددِ متفاوت‌اند و هر دو نوشته
            می‌شوند — وگرنه کاربر نمی‌داند نسبت‌های کنارش روی کدام جامعه‌اند. */}
        <Kpi
          label="نتیجهٔ فیلتر"
          value={toPersianDigits(stats.count)}
          note={stats.count === funds.length ? "کلِ صندوق‌های اسنپ‌شات" : `از ${toPersianDigits(funds.length)} صندوق`}
        />
        <Kpi
          label="ارزش بازار نمادها"
          // `marketValue` فید ریال است — تبدیل و برچسبِ واحد در یک نقطه.
          value={formatRialAsToman(stats.marketValue.total)}
          note={
            stats.marketValue.total == null
              ? "هیچ ردیفی ارزشِ بازار ندارد"
              : `از ${toPersianDigits(stats.marketValue.covered)} صندوق از ${toPersianDigits(stats.marketValue.population)}`
          }
        />
        <Kpi
          label="میانگین بازده روز"
          value={stats.avg == null ? "—" : formatSignedPercent(stats.avg)}
          color={stats.avg == null ? undefined : deltaColor(stats.avg)}
          note={stats.rated > 0 ? `از ${toPersianDigits(stats.rated)} صندوقِ دارای بازده` : "بازدهی ثبت نشده"}
        />
        <Kpi
          label="نسبت مثبت"
          value={stats.posRatio == null ? "—" : `٪${toPersianDigits(stats.posRatio)}`}
          color={stats.posRatio == null ? undefined : stats.posRatio >= 50 ? "var(--success)" : "var(--danger)"}
          note={stats.rated > 0 ? `از ${toPersianDigits(stats.rated)} صندوقِ دارای بازده` : undefined}
        />
        {hasNav && (
          <Kpi
            label="میانگین حباب"
            value={stats.avgBubble == null ? "—" : formatSignedPercent(stats.avgBubble)}
            color={stats.avgBubble == null ? undefined : bubbleColor(stats.avgBubble)}
            note={`از ${toPersianDigits(stats.navCount)} صندوقِ دارای NAV معتبر`}
          />
        )}
      </div>

      {/* Positive/Negative ratio bar */}
      {stats.posRatio != null && (
        <div>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full"
            style={{ border: "1px solid var(--line)" }}
            role="img"
            aria-label={`${toPersianDigits(stats.posRatio)} درصد صندوق‌ها مثبت`}
          >
            <div style={{ width: `${stats.posRatio}%`, background: "var(--success)" }} />
            <div style={{ width: `${100 - stats.posRatio}%`, background: "var(--danger)" }} />
          </div>
          <div className="flex justify-between mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span>مثبت ٪{toPersianDigits(stats.posRatio)}</span>
            <span>منفی ٪{toPersianDigits(100 - stats.posRatio)}</span>
          </div>
        </div>
      )}

      {/* Heatmap */}
      {mapCells.length > 0 && (
        <details className="card group p-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]">
            <span>
              <span className="block font-display font-bold" style={{ color: "var(--heading)" }}>نقشهٔ فشردهٔ صندوق‌ها</span>
              <span className="mt-1 block text-[11px]" style={{ color: "var(--text-3)" }}>اندازه: ارزش معاملات · رنگ: بازده روز</span>
            </span>
            <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4 space-y-1.5">
            {rowsOf(mapCells, 4).map((r, ri) => (
              <div key={ri} className="flex gap-1.5">
                {r.map((f) => {
                  const pct = f.changePercent ?? f.closingChangePercent ?? null;
                  const t = tile(pct);
                  return (
                    <div
                      key={f.id}
                      className="rounded-md px-2 py-2 min-w-0 flex flex-col justify-center"
                      style={{
                        flexGrow: Math.max(f.marketValue ?? f.value ?? 1, 1),
                        flexBasis: 0,
                        background: t.bg,
                        minWidth: 64,
                        minHeight: 56,
                      }}
                      title={`${f.id} ${f.faName} — ${pct != null ? formatSignedPercent(pct) : "—"}`}
                    >
                      {/* C1 — UI نمادمحور: فقط نماد (نام کامل در title) */}
                      <span className="text-[11px] font-bold truncate" style={{ color: t.fg }}>
                        {f.id}
                      </span>
                      {pct != null && (
                        <span className="text-[11px]" style={{ color: t.fg, fontVariantNumeric: "tabular-nums" }}>
                          <span aria-hidden="true">{formatSignedPercent(pct)}</span>
                          <span className="sr-only">{describeDelta(pct)}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Search + Filter */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: "var(--heading)" }}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          فیلتر و مرتب‌سازی
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block min-w-[200px]">
          <span className="sr-only">جست‌وجوی صندوق</span>
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 start-3"
            style={{ color: "var(--text-3)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نام یا نماد صندوق"
            className="input ps-9"
            style={{
              background: "var(--surface)",
              borderColor: "var(--line)",
              color: "var(--text)",
            }}
          />
        </label>
        {/* دستهٔ صندوق — برچسبِ کوتاه با تعداد. نامِ رسمیِ کاملِ هر صندوق در
            ردیفِ خودش می‌ماند؛ اینجا فقط راهِ رسیدن است. دسته‌ای که صندوقی
            ندارد رندر نمی‌شود تا فیلترِ بی‌نتیجه پیشنهاد نشود. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="دستهٔ صندوق">
          {[ALL_CATEGORIES, ...FUND_CATEGORIES].map((t) => {
            const n = t === ALL_CATEGORIES ? funds.length : categoryCounts.get(t as never) ?? 0;
            if (n === 0) return null;
            const on = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeFilter(t)}
                className="rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
                style={{
                  minHeight: 40,
                  background: on ? "var(--navy)" : "var(--surface)",
                  color: on ? "var(--text-on-navy)" : "var(--text-2)",
                  borderColor: on ? "var(--navy)" : "var(--line)",
                }}
              >
                {t}
                <span className="ms-1.5 opacity-70" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {toPersianDigits(n)}
                </span>
              </button>
            );
          })}
        </div>
        <label className="relative block md:hidden">
          <span className="sr-only">مرتب‌سازی صندوق‌ها</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none rounded-lg border px-4 py-2.5 pe-9 text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--text)" }}
            aria-label="مرتب‌سازی صندوق‌ها"
          >
            <option value="value">ارزش معاملات</option>
            <option value="changePercent">تغییر روز</option>
            <option value="bubblePercent">حباب</option>
            <option value="ret1m">بازده یک‌ماهه</option>
            <option value="faName">نام صندوق</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
        </label>
        </div>
        {/* «نتیجهٔ فیلتر» و «کلِ بازار» — و نه «نمایش»، چون تعدادِ رندرشده را
            شمارشِ زیرِ جدول می‌گوید. سه عددِ متفاوت‌اند و قاطی‌کردنشان همان
            خطایی است که این بسته دنبالِ بستنش است. */}
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          {sorted.length === funds.length
            ? `همهٔ ${toPersianDigits(funds.length)} صندوقِ اسنپ‌شات`
            : `${toPersianDigits(sorted.length)} نتیجه از ${toPersianDigits(funds.length)} صندوق`}
        </p>
      </div>

      {/* Table — Desktop */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--text)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <SortTh label="نام" sortKey="faName" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortTh label="قیمت (تومان)" sortKey="price" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="تغییر" sortKey="changePercent" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              {hasNav && (
                <>
                  <th className="py-3 px-4 font-bold whitespace-nowrap text-left" style={{ color: "var(--text-3)" }}>
                    <Term id="nav">NAV ابطال</Term>
                  </th>
                  <SortTh label="حباب" sortKey="bubblePercent" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                </>
              )}
              {hasReturns && (
                <>
                  <SortTh label="بازده ۱ه" sortKey="ret1w" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                  <SortTh label="بازده ۱م" sortKey="ret1m" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                  <SortTh label="بازده ۳م" sortKey="ret3m" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
                </>
              )}
              <SortTh label="ارزش معاملات" sortKey="value" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="ارزش بازار" sortKey="marketValue" current={sortKey} dir={sortDir} onSort={toggleSort} align="left" />
              <th className="px-4 py-3"><span className="sr-only">بررسی</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const pct = f.changePercent ?? f.closingChangePercent ?? null;
              return (
                <tr key={f.id} className="hover:bg-[var(--surface-2)]" style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className="py-3 px-4">
                    {/* C1 — UI نمادمحور: فقط نماد؛ نام کامل فقط در هدر صفحهٔ نماد */}
                    <Link
                      href={`/symbol/${encodeURIComponent(f.id)}?from=/market/funds`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--heading)" }}
                      title={`صفحهٔ نماد ${f.id}`}
                    >
                      {f.id}
                    </Link>
                    {(f.type || f.industry) && (
                      <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                        {f.type || f.industry}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatToman(f.price)}
                  </td>
                  <td className="py-3 px-4 text-left font-bold" style={{ color: pct != null ? deltaColor(pct) : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                    {pct != null ? formatSignedPercent(pct) : "—"}
                  </td>
                  {hasNav && (
                    <>
                      <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                        {f.nav != null ? formatToman(f.nav) : "—"}
                      </td>
                      <td
                        className="py-3 px-4 text-left font-bold"
                        style={{
                          color: f.bubblePercent != null ? bubbleColor(f.bubblePercent) : "var(--text-3)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {f.bubblePercent != null ? formatSignedPercent(f.bubblePercent) : "—"}
                      </td>
                    </>
                  )}
                  {hasReturns && (
                    <>
                      <RetCell v={f.ret1w} />
                      <RetCell v={f.ret1m} />
                      <RetCell v={f.ret3m} />
                    </>
                  )}
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                    {f.value ? fmtValue(f.value) : "—"}
                  </td>
                  <td className="py-3 px-4 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                    {formatRialAsToman(f.marketValue)}
                  </td>
                  <td className="py-3 px-4 text-left">
                    <Link href={`/symbol/${encodeURIComponent(f.id)}?from=/market/funds`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-bold hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]" style={{ color: "var(--navy-ink)" }}>
                      بررسی <ArrowLeft size={14} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>
            صندوقی با این فیلتر یافت نشد.
          </p>
        )}
      </div>

      {/* Cards — Mobile */}
      <div className="md:hidden space-y-3">
        {visible.map((f) => {
          const pct = f.changePercent ?? f.closingChangePercent ?? null;
          return (
            <div key={f.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {/* C1 — UI نمادمحور: فقط نماد */}
                  <Link
                    href={`/symbol/${encodeURIComponent(f.id)}?from=/market/funds`}
                    className="font-bold text-sm block truncate hover:underline"
                    style={{ color: "var(--heading)" }}
                  >
                    {f.id}
                  </Link>
                  {(f.type || f.industry) && (
                    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {f.type || f.industry}
                    </span>
                  )}
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
                <span>{formatToman(f.price)}</span>
                {f.value ? <span>ارزش: {fmtValue(f.value)}</span> : null}
              </div>
              {f.nav != null && (
                <div className="flex items-center justify-between mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                  <span>NAV ابطال: {formatToman(f.nav)}</span>
                  {f.bubblePercent != null && (
                    <span className="font-bold" style={{ color: bubbleColor(f.bubblePercent), fontVariantNumeric: "tabular-nums" }}>
                      حباب: {formatSignedPercent(f.bubblePercent)}
                    </span>
                  )}
                </div>
              )}
              {(f.ret1w != null || f.ret1m != null || f.ret3m != null) && (
                <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                  <span>بازده ۱ه: <b style={{ color: f.ret1w != null ? deltaColor(f.ret1w) : "var(--text-3)" }}>{f.ret1w != null ? formatSignedPercent(f.ret1w) : "—"}</b></span>
                  <span>۱م: <b style={{ color: f.ret1m != null ? deltaColor(f.ret1m) : "var(--text-3)" }}>{f.ret1m != null ? formatSignedPercent(f.ret1m) : "—"}</b></span>
                  <span>۳م: <b style={{ color: f.ret3m != null ? deltaColor(f.ret3m) : "var(--text-3)" }}>{f.ret3m != null ? formatSignedPercent(f.ret3m) : "—"}</b></span>
                </div>
              )}
              <Link href={`/symbol/${encodeURIComponent(f.id)}?from=/market/funds`} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]" style={{ borderColor: "var(--line)", color: "var(--navy-ink)" }}>
                بررسی جزئیات صندوق <ArrowLeft size={15} aria-hidden="true" />
              </Link>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>
            صندوقی با این فیلتر یافت نشد.
          </p>
        )}
      </div>

      {/* شمارشِ صادق + راهِ دیدنِ بقیه. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          {`نمایشِ ${toPersianDigits(visible.length)} از ${toPersianDigits(sorted.length)} نتیجه`}
          {sorted.length !== funds.length ? ` · کلِ صندوق‌ها: ${toPersianDigits(funds.length)}` : ""}
        </p>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setRowLimit((n) => n + ROW_PAGE)}
            className="rounded-lg border px-4 text-xs font-bold transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={{ minHeight: 44, borderColor: "var(--line-strong)", color: "var(--navy-ink)" }}
          >
            {`نمایشِ ${toPersianDigits(Math.min(ROW_PAGE, hiddenCount))} صندوقِ بعدی`}
          </button>
        ) : null}
      </div>

      {/* پوشش بازدهٔ دوره‌ای (M6) — صادقانه: فقط نمادهای دارای تاریخچه */}
      {hasReturns ? (
        <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
          بازدهٔ دوره‌ای از تاریخچهٔ ثبت‌شدهٔ قیمت پایانی محاسبه می‌شود و فعلاً برای {toPersianDigits(retCovered)} صندوق از {toPersianDigits(funds.length)} موجود است؛
          بقیه با انباشت تدریجی داده تکمیل می‌شوند. «—» یعنی دادهٔ کافی برای آن پنجره هنوز نیست — هیچ بازدهی از دادهٔ ناقص ساخته نمی‌شود.
        </p>
      ) : (
        <div className="card p-5 text-center">
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            پوشش تاریخی برای محاسبهٔ بازده کافی نیست. تا رسیدن دادهٔ معتبر، عددی نمایش داده نمی‌شود.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        داده از فید رسمی بازار سرمایه دریافت می‌شود و برای شناخت بازار است؛ به‌تنهایی مبنای تصمیم شخصی نیست.
        {hasNav && (
          <>
            {" "}حباب = (قیمت − NAV ابطال) ÷ NAV ابطال؛ NAV ابطال از سامانهٔ رسمی بازار (به‌روزرسانی حدوداً
            ساعتی) و ممکن است چند دقیقه با قیمت جاری فاصله داشته باشد.
          </>
        )}
      </p>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

/** سلول بازدهٔ دوره‌ای — null = «—» (دادهٔ کافی نیست) */
function RetCell({ v }: { v: number | null | undefined }) {
  return (
    <td
      className="py-3 px-4 text-left"
      style={{
        color: v != null ? deltaColor(v) : "var(--text-3)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {v != null ? formatSignedPercent(v) : "—"}
    </td>
  );
}

/**
 * کاشیِ سنجه. `note` اختیاری نیست از سرِ تزئین: هر نسبت یا جمعی که اینجا
 * می‌آید باید بگوید **روی چه جامعه‌ای** حساب شده، وگرنه دو کاشی با دو جامعهٔ
 * متفاوت کنارِ هم می‌نشینند و کاربر آنها را قابلِ مقایسه فرض می‌کند.
 */
function Kpi({ label, value, color, note }: { label: string; value: string; color?: string; note?: string }) {
  return (
    <div className="card flex flex-col p-4">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>{label}</p>
      <p
        className="font-display font-bold mt-1.5 text-xl md:text-2xl"
        style={{ color: color ?? "var(--heading)", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
      >
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-[10.5px] leading-4" style={{ color: "var(--text-3)" }}>{note}</p>
      ) : null}
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
      className={`py-2 px-2 whitespace-nowrap text-${align}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
        style={{ color: active ? "var(--heading)" : "var(--text-3)" }}
        onClick={() => onSort(key)}
      >
        {label}
        <ArrowUpDown size={12} className={active ? "opacity-100" : "opacity-40"} />
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
