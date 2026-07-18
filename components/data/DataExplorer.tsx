"use client";

// «بانک دادهٔ بازار» — کاوشگر عمومی داده: هر بازدیدکننده، دادهٔ هر نماد/صندوقی.
// چهار تب: سهام (همهٔ ~۱۰۴۰ نماد)، صندوق‌ها (~۳۹۰ با NAV و حباب)، طلا/سکه، ارز.
// جستجو + مرتب‌سازی سمت کلاینت؛ لینک هر ردیف به صفحهٔ جزئیات /data/[symbol].
// قانون سخت: دادهٔ ناموجود «—» — هیچ عدد ساختگی.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Database, ArrowUpDown, Clock } from "lucide-react";
import ScreenerPanel, { type ScreenerPresetConfig } from "@/components/data/ScreenerPanel";
import { runFilter, SCREENER_FILTERS } from "@/lib/core/screener";
import { FUNDAMENTAL_PRESETS } from "@/lib/core/fundamentalPresets";
import {
  toPersianDigits,
  formatToman,
  formatTomanShort,
  formatSignedPercent,
  deltaColor,
  formatJalali,
} from "@/lib/format";
import type { IrRow, IrStockRow } from "@/lib/market-ir";

type Tab = "stocks" | "funds" | "gold" | "currency";

const TABS: { key: Tab; label: string }[] = [
  { key: "stocks", label: "سهام" },
  { key: "funds", label: "صندوق‌ها" },
  { key: "gold", label: "طلا و سکه" },
  { key: "currency", label: "ارز" },
];

type SortKey =
  | "faName"
  | "price"
  | "changePercent"
  | "value"
  | "volume"
  | "marketValue"
  | "pe"
  | "bubblePercent"
  | "nav"
  | "flow";

function num(x: unknown): number | null {
  if (typeof x !== "number" || !isFinite(x)) return null;
  return x;
}

/** خالص ورود پول حقیقی تقریبی (تومان) = (حجم خرید حقیقی − حجم فروش حقیقی) × قیمت پایانی */
function realFlow(r: IrStockRow): number | null {
  const b = num(r.buyI);
  const s = num(r.sellI);
  const p = num(r.closingPrice) ?? num(r.price);
  if (b == null || s == null || p == null) return null;
  return (b - s) * p;
}

function dash(v: string | null | undefined): string {
  return v == null || v === "" ? "—" : v;
}

export default function DataExplorer({
  stocks,
  funds,
  gold,
  currency,
  fetchedAt,
  avgVolume30,
  fundamentalYoY,
}: {
  stocks: IrStockRow[];
  funds: IrStockRow[];
  gold: IrRow[];
  currency: IrRow[];
  fetchedAt: number | null;
  /** میانگین حجم ۳۰روزه هر نماد (از سرور) — پایهٔ فیلتر حجم مشکوک */
  avgVolume30: Array<[string, number]>;
  /** رشد YoY بنیادی هر نماد (از سرور، codal_reports) — پایهٔ پرست‌های بنیادی T2 */
  fundamentalYoY?: { monthly: Record<string, number>; quarterly: Record<string, number> };
}) {
  const [tab, setTab] = useState<Tab>("stocks");
  const [q, setQ] = useState("");
  const [fundType, setFundType] = useState<string>("همه");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);
  const [limit, setLimit] = useState(100);
  const [screenerFilter, setScreenerFilter] = useState<string | null>(null);

  const avgVolMap = useMemo(() => new Map(avgVolume30), [avgVolume30]);

  const fundTypes = useMemo(() => {
    const s = new Set<string>();
    for (const f of funds) if (f.type) s.add(f.type);
    return ["همه", ...[...s].sort((a, b) => a.localeCompare(b, "fa"))];
  }, [funds]);

  const rows: IrStockRow[] = useMemo(() => {
    let base: IrStockRow[] =
      tab === "stocks" ? stocks : tab === "funds" ? funds : [];
    if (tab === "funds" && fundType !== "همه") {
      base = base.filter((f) => f.type === fundType);
    }
    if (tab === "stocks" && screenerFilter) {
      if (screenerFilter === "monthly_rev_yoy" || screenerFilter === "quarterly_rev_yoy") {
        // پرست بنیادی: فقط نمادهای دارای رشد محاسبه‌پذیر، نزولی بر اساس رشد
        const m =
          screenerFilter === "monthly_rev_yoy"
            ? fundamentalYoY?.monthly
            : fundamentalYoY?.quarterly;
        if (m) {
          base = base
            .filter((r) => typeof m[r.id] === "number")
            .sort((a, b) => (m[b.id] ?? 0) - (m[a.id] ?? 0))
            .slice(0, 50);
        } else {
          base = [];
        }
      } else if (screenerFilter === "fund_low_pnav") {
        base = []; // فقط در تب صندوق‌ها معنا دارد
      } else {
        base = runFilter(base, screenerFilter, { avgVolume30: avgVolMap });
      }
    }
    if (tab === "funds" && screenerFilter === "fund_low_pnav") {
      base = base
        .filter((r) => num(r.price) != null && num(r.nav) != null && (r.nav as number) > 0 && (r.price as number) > 0)
        .sort((a, b) => (a.price as number) / (a.nav as number) - (b.price as number) / (b.nav as number))
        .slice(0, 50);
    }
    const qq = q.trim();
    if (qq) {
      base = base.filter(
        (r) => r.id.includes(qq) || r.faName.includes(qq)
      );
    }
    const val = (r: IrStockRow): number => {
      if (sortKey === "faName") return 0;
      if (sortKey === "flow") return realFlow(r) ?? -Infinity;
      const v = num((r as unknown as Record<string, unknown>)[sortKey] as number);
      return v == null ? -Infinity : v;
    };
    const sorted = [...base].sort((a, b) => {
      if (sortKey === "faName")
        return a.faName.localeCompare(b.faName, "fa") * (sortDesc ? -1 : 1);
      return (val(b) - val(a)) * (sortDesc ? 1 : -1);
    });
    return sorted;
  }, [tab, stocks, funds, q, fundType, sortKey, sortDesc, screenerFilter, avgVolMap, fundamentalYoY]);

  const simpleRows: IrRow[] = useMemo(() => {
    const base = tab === "gold" ? gold : tab === "currency" ? currency : [];
    const qq = q.trim();
    return qq
      ? base.filter((r) => r.id.includes(qq) || r.faName.includes(qq))
      : base;
  }, [tab, gold, currency, q]);

  const header = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDesc((d) => !d);
        else {
          setSortKey(key);
          setSortDesc(true);
        }
      }}
      className="inline-flex items-center gap-1 whitespace-nowrap hover:text-[var(--navy)]"
    >
      {label}
      <ArrowUpDown size={12} className={sortKey === key ? "opacity-100" : "opacity-30"} />
    </button>
  );

  const isFunds = tab === "funds";
  const isTable = tab === "stocks" || tab === "funds";

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--navy)" }}>
            <Database size={16} />
            دسترسی آزاد برای همه
          </p>
          <h1 className="mt-1 text-3xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
            بانک دادهٔ بازار
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "var(--text-3)" }}>
            دادهٔ همهٔ نمادهای بورس و فرابورس، صندوق‌های سرمایه‌گذاری (طلا، اهرمی، درآمد ثابت، کالایی و سهامی)،
            طلا و ارز — با جستجو، مرتب‌سازی و صفحهٔ جزئیات برای هر نماد. دادهٔ ناموجود با «—» نمایش داده می‌شود.
          </p>
        </div>
        {fetchedAt ? (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
            <Clock size={13} />
            به‌روزرسانی: {formatJalali(fetchedAt)}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border p-1" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setLimit(100);
                setSortKey(t.key === "funds" ? "value" : "value");
              }}
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={
                tab === t.key
                  ? { background: "var(--navy)", color: "var(--text-on-navy)" }
                  : { color: "var(--text-3)" }
              }
            >
              {t.label}
              <span className="mr-1 text-xs opacity-70">
                {toPersianDigits(
                  t.key === "stocks"
                    ? stocks.length
                    : t.key === "funds"
                    ? funds.length
                    : t.key === "gold"
                    ? gold.length
                    : currency.length
                )}
              </span>
            </button>
          ))}
        </div>

        <div
          className="flex min-w-56 flex-1 items-center gap-2 rounded-full border px-4 py-2"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <Search size={15} style={{ color: "var(--text-3)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نماد یا نام…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--navy-deep)" }}
          />
        </div>

        {isFunds ? (
          <select
            value={fundType}
            onChange={(e) => setFundType(e.target.value)}
            className="rounded-full border px-4 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--navy-deep)" }}
          >
            {fundTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {tab === "stocks" || tab === "funds" ? (
        <ScreenerPanel
          activeFilter={screenerFilter}
          onFilterChange={(k) => {
            setScreenerFilter(k);
            if (k === "fund_low_pnav") setTab("funds");
            else if (k && k !== null) setTab("stocks");
            setLimit(100);
          }}
          matchCount={screenerFilter ? rows.length : null}
          historyCoverage={{
            covered: stocks.filter((s) => avgVolMap.has(s.id)).length,
            total: stocks.length,
          }}
          fundamentalCoverage={{
            monthly_rev_yoy: Object.keys(fundamentalYoY?.monthly ?? {}).length,
            quarterly_rev_yoy: Object.keys(fundamentalYoY?.quarterly ?? {}).length,
            fund_low_pnav: funds.filter(
              (f) => num(f.price) != null && num(f.nav) != null && (f.nav as number) > 0
            ).length,
          }}
          currentConfig={{ filterKey: screenerFilter, q, sortKey, sortDesc }}
          onApplyPreset={(c: ScreenerPresetConfig) => {
            const known =
              c.filterKey &&
              (SCREENER_FILTERS.some((f) => f.key === c.filterKey) ||
                FUNDAMENTAL_PRESETS.some((p) => p.key === c.filterKey));
            setTab(c.filterKey === "fund_low_pnav" ? "funds" : "stocks");
            setScreenerFilter(known ? c.filterKey : null);
            if (typeof c.q === "string") setQ(c.q);
            if (typeof c.sortKey === "string") setSortKey(c.sortKey as SortKey);
            if (typeof c.sortDesc === "boolean") setSortDesc(c.sortDesc);
            setLimit(100);
          }}
        />
      ) : null}

      {isTable ? (
        <div
          className="mt-5 overflow-x-auto rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr
                className="border-b text-right text-xs"
                style={{ borderColor: "var(--line)", color: "var(--text-3)" }}
              >
                <th className="px-4 py-3 font-medium">{header("نماد", "faName")}</th>
                <th className="px-3 py-3 font-medium">{header("قیمت پایانی", "price")}</th>
                <th className="px-3 py-3 font-medium">{header("تغییر", "changePercent")}</th>
                <th className="px-3 py-3 font-medium">{header("ارزش معاملات", "value")}</th>
                <th className="px-3 py-3 font-medium">{header("ورود پول حقیقی", "flow")}</th>
                {isFunds ? (
                  <>
                    <th className="px-3 py-3 font-medium">{header("NAV ابطال", "nav")}</th>
                    <th className="px-3 py-3 font-medium">{header("حباب", "bubblePercent")}</th>
                    <th className="px-3 py-3 font-medium">نوع</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3 font-medium">{header("ارزش بازار", "marketValue")}</th>
                    <th className="px-3 py-3 font-medium">{header("P/E", "pe")}</th>
                    <th className="px-3 py-3 font-medium">صنعت</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => {
                const flow = realFlow(r);
                const chg = num(r.closingChangePercent) ?? num(r.changePercent);
                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-b-0 hover:bg-black/[.02]"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/symbol/${encodeURIComponent(r.id)}`}
                        className="font-bold hover:underline"
                        style={{ color: "var(--navy-deep)" }}
                      >
                        {r.id}
                      </Link>
                      {/* C1 — UI نمادمحور: نام کامل حذف شد */}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                      {num(r.closingPrice) != null
                        ? formatToman(r.closingPrice as number)
                        : num(r.price) != null
                        ? formatToman(r.price)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: chg != null ? deltaColor(chg) : "var(--text-3)" }}>
                      {chg != null ? formatSignedPercent(chg) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                      {num(r.value) != null ? formatTomanShort(r.value as number) : "—"}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5"
                      style={{ color: flow != null ? deltaColor(flow) : "var(--text-3)" }}
                    >
                      {flow != null ? formatTomanShort(flow) : "—"}
                    </td>
                    {isFunds ? (
                      <>
                        <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                          {num(r.nav) != null ? formatToman(r.nav as number) : "—"}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2.5"
                          style={{
                            color:
                              num(r.bubblePercent) != null
                                ? deltaColor(r.bubblePercent as number)
                                : "var(--text-3)",
                          }}
                        >
                          {num(r.bubblePercent) != null
                            ? formatSignedPercent(r.bubblePercent as number)
                            : "—"}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2.5 text-xs" style={{ color: "var(--text-3)" }}>
                          {dash(r.type)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                          {num(r.marketValue) != null ? formatTomanShort(r.marketValue as number) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                          {num(r.pe) != null ? toPersianDigits((r.pe as number).toFixed(1)) : "—"}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2.5 text-xs" style={{ color: "var(--text-3)" }}>
                          {dash(r.industry)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit ? (
            <div className="border-t p-3 text-center" style={{ borderColor: "var(--line)" }}>
              <button
                type="button"
                onClick={() => setLimit((l) => l + 200)}
                className="rounded-full border px-5 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--navy)" }}
              >
                نمایش بیشتر ({toPersianDigits(rows.length - limit)} نماد دیگر)
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {simpleRows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <p className="text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                {r.faName}
              </p>
              <p className="mt-2 text-xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
                {formatToman(r.price)}
                <span className="mr-1 text-xs font-normal" style={{ color: "var(--text-3)" }}>
                  {r.unit === "usd" ? "دلار" : "تومان"}
                </span>
              </p>
              {num(r.changePercent) != null ? (
                <p className="mt-1 text-sm" style={{ color: deltaColor(r.changePercent as number) }}>
                  {formatSignedPercent(r.changePercent as number)}
                </p>
              ) : null}
            </div>
          ))}
          {simpleRows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              داده‌ای برای نمایش نیست.
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-4 text-xs leading-6" style={{ color: "var(--text-3)" }}>
        منبع داده: اسنپ‌شات رسمی بازار (رلهٔ داخلی). ورود پول حقیقی = (حجم خرید حقیقی − حجم فروش حقیقی) × قیمت پایانی.
        این صفحه صرفاً دادهٔ خام و شاخص‌های محاسباتی شفاف ارائه می‌دهد و توصیهٔ خرید یا فروش نیست.
      </p>
    </section>
  );
}
