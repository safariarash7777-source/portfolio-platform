// صفحهٔ واحد نماد — T2 ممیزی: ادغام /data/[symbol] در /symbol/[symbol].
// سکشن‌ها: سرصفحهٔ قیمت زنده + آمار روز + (NAV/حباب صندوق) + تاریخچهٔ قیمت و جریان پول
// + دانلود CSV + کارت امتیاز (به‌زودی) + نمودارهای بنیادی کدال.
// قانون سخت: دادهٔ ناموجود «—» — هیچ عدد ساختگی.

import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundamentalCharts from "@/components/symbol/FundamentalCharts";
import MonthlySalesCharts from "@/components/symbol/MonthlySalesCharts";
import QuarterlyCharts from "@/components/symbol/QuarterlyCharts";
import HistoryChart, { type HistoryPoint } from "@/components/terminal/HistoryChart";
import PriceNavChart, { type PriceNavPoint } from "@/components/symbol/PriceNavChart";
import SymbolTabs from "@/components/symbol/SymbolTabs";
import SymbolLiveDetail from "@/components/symbol/SymbolLiveDetail";
import CodalReportsTab, { type StoredReport } from "@/components/symbol/CodalReportsTab";
import { getIrMarket, type IrStockRow } from "@/lib/market-ir";
import { getFundamentals } from "@/lib/fundamental/registry";
import { getSymbolHistory } from "@/lib/core/history";
import {
  deriveQuarters,
  ttmSeries,
  peOf,
  type QuarterInput,
} from "@/lib/core/quarterly";
import { jalaliYmdToGregorian } from "@/lib/core/jalali";
import { getNavHistory } from "@/lib/core/navHistory";
import { getFxRates, latestRate } from "@/lib/core/fx";
import { netIndividualFlow } from "@/lib/core/engine";
import {
  toPersianDigits,
  formatToman,
  formatTomanShort,
  formatSignedPercent,
  deltaColor,
  formatJalali,
} from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const s = decodeURIComponent(symbol);
  return {
    title: `نماد ${s} — قیمت، تاریخچه و تحلیل بنیادی`,
    description: `دادهٔ کامل نماد ${s}: قیمت روز، جریان پول حقیقی، تاریخچهٔ قیمت، دانلود دادهٔ خام و نمودارهای بنیادی کدال.`,
  };
}

function num(x: unknown): number | null {
  if (typeof x !== "number" || !isFinite(x)) return null;
  return x;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-[15px] font-bold"
        style={{ color: color ?? "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
    </div>
  );
}

export default async function SymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);

  const [ir, history, fundamentals, fxRates, navHistory] = await Promise.all([
    getIrMarket(),
    getSymbolHistory(sym, 400),
    getFundamentals(sym),
    getFxRates(),
    getNavHistory(sym, 400),
  ]);
  const fx = latestRate(fxRates);

  const all: IrStockRow[] = [...(ir?.stocks ?? []), ...(ir?.funds ?? [])];
  const quote = all.find((r) => r.id === sym) ?? null;
  const isFund = (ir?.funds ?? []).some((r) => r.id === sym);

  const pct = num(quote?.closingChangePercent) ?? num(quote?.changePercent);
  const buyI = num(quote?.buyI);
  const sellI = num(quote?.sellI);
  const priceForFlow = num(quote?.closingPrice) ?? num(quote?.price);
  const flow =
    buyI != null && sellI != null && priceForFlow != null
      ? (buyI - sellI) * priceForFlow
      : null;

  const points: HistoryPoint[] = history.map((d) => ({
    time: Math.floor(new Date(`${d.trade_date}T00:00:00Z`).getTime() / 1000),
    close: d.close,
    netFlow: netIndividualFlow(d),
  }));

  // T3: فصل‌سازی ن-۱۰ با تفاضل زنجیره‌ای + P/E دوازده‌ماهه
  const quarterInputs: QuarterInput[] = (fundamentals?.n10Periods ?? []).map((p) => ({
    id: p.id,
    period_end: p.data.period_end,
    period_months: p.data.period_months,
    audited: p.data.audited,
    capital: p.data.capital,
    revenue: p.data.standalone.revenue,
    gross_profit: p.data.standalone.gross_profit,
    operating_profit: p.data.standalone.operating_profit,
    net_profit: p.data.standalone.net_profit,
  }));
  const quarters = deriveQuarters(quarterInputs);
  const ttm = ttmSeries(quarters);

  // قیمت پایان فصل: تاریخچهٔ بلندتر فقط وقتی فصلی داریم (close به ریال است)
  const peHistory = ttm.length > 0 ? await getSymbolHistory(sym, 1500) : [];
  const peSeries = ttm.map((t) => {
    const g = jalaliYmdToGregorian(t.periodEnd);
    let pe: number | null = null;
    if (g) {
      const from = new Date(new Date(`${g}T00:00:00Z`).getTime() - 14 * 86400_000)
        .toISOString()
        .slice(0, 10);
      // آخرین روز معاملاتی در بازهٔ [g-14روز, g] — بدون درون‌یابی
      const inRange = peHistory.filter((d) => d.trade_date <= g && d.trade_date >= from);
      inRange.sort((a, b) => (a.trade_date < b.trade_date ? -1 : 1));
      const closeRial = inRange.length > 0 ? inRange[inRange.length - 1].close : null;
      pe = closeRial != null ? peOf(closeRial, t.epsTtm) : null;
    }
    return { label: t.label, pe };
  });

  // P/E جاری: قیمت روز (تومان) ×۱۰ = ریال ÷ آخرین EPS TTM
  const lastTtm = ttm.length > 0 ? ttm[ttm.length - 1] : null;
  const priceTomanNow = num(quote?.closingPrice) ?? num(quote?.price);
  const currentPe =
    lastTtm && priceTomanNow != null ? peOf(priceTomanNow * 10, lastTtm.epsTtm) : null;

  // M6: نمودار قیمت در برابر NAV — فقط روزهای دارای NAV ثبت‌شده (هیچ درون‌یابی)
  const navPoints: PriceNavPoint[] = navHistory.map((d) => ({
    time: Math.floor(new Date(`${d.trade_date}T00:00:00Z`).getTime() / 1000),
    nav: d.nav,
    close: d.close,
  }));

  // T5-2: فهرست گزارش‌های ذخیره‌شده (codal_reports) برای تب گزارش‌ها
  const storedReports: StoredReport[] = [];
  if (fundamentals?.n30) {
    storedReports.push({
      kind: "ن-۳۰",
      title: fundamentals.n30.source.title,
      jdate: fundamentals.n30.data[0]?.period_end ?? null,
      url: fundamentals.n30.source.source_url ?? null,
    });
  }
  if (fundamentals?.n10) {
    storedReports.push({
      kind: "ن-۱۰",
      title: fundamentals.n10.source.title,
      jdate: fundamentals.n10.data.period_end ?? null,
      url: fundamentals.n10.source.source_url ?? null,
    });
  }

  // T6: محتوای تب بنیادی (T1 + T3 + WP4 + کارت امتیاز آتی)
  const fundamentalTab = (
    <>
      <section
        className="rounded-xl px-4 py-4"
        style={{ background: "var(--surface-2)", border: "1px dashed var(--line-strong)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: "var(--text-2)" }}>
            کارت امتیاز سه‌محوره (بنیادی · روند · کیفیت گزارش)
          </h2>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            به‌زودی
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-3)" }}>
          هر امتیاز با فرمول شفاف و توضیحِ «چرا» ارائه خواهد شد؛ تا تصویب منطق امتیازدهی،
          هیچ نمرهٔ موقتی نمایش داده نمی‌شود.
        </p>
      </section>

      {/* T1 — شناسنامهٔ بنیادی: فروش ماهانهٔ ن-۳۰ — فقط وقتی داده هست (قانون ۲) */}
      {fundamentals?.n30 && fundamentals.n30.data.length > 0 ? (
        <section>
          <MonthlySalesCharts
            reports={fundamentals.n30.data}
            sourceTitle={fundamentals.n30.source.title}
            sourceUrl={fundamentals.n30.source.source_url}
          />
        </section>
      ) : null}

      {/* T3 — تحلیل فصلی ن-۱۰: فقط وقتی حداقل یک فصل مشتق شده (قانون ۲) */}
      {quarters.length > 0 ? (
        <QuarterlyCharts
          quarters={quarters}
          ttm={ttm}
          peSeries={peSeries}
          currentPe={currentPe}
          sourceTitle={fundamentals?.n10?.source.title ?? "گزارش‌های ن-۱۰ کدال"}
        />
      ) : null}

      {/* نمودارهای بنیادی WP4 */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
          تحلیل بنیادی (گزارش‌های کدال)
        </h2>
        <FundamentalCharts
          fundamentals={fundamentals ?? { symbol: sym, n10: null, n30: null }}
          fxRate={fx?.usd_toman ?? null}
          fxRateDate={fx?.rate_date ?? null}
        />
      </section>
    </>
  );

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16 space-y-6">
          <nav className="text-xs" style={{ color: "var(--text-3)" }}>
            <Link href="/data" className="hover:underline" style={{ color: "var(--navy)" }}>
              بانک دادهٔ بازار
            </Link>
            <span className="mx-1">/</span>
            {sym}
          </nav>

          {/* سرصفحهٔ نماد */}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
                {sym}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                {fundamentals?.n10?.data.company_name ?? quote?.faName ?? "—"}
                {quote?.industry ? ` · ${quote.industry}` : ""}
                {isFund && quote?.type ? ` · ${quote.type}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/data/${encodeURIComponent(sym)}/history.csv`}
                className="btn-outline rounded-full border px-4 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--line-strong)" }}
              >
                دانلود تاریخچه (CSV)
              </a>
              {ir?.fetchedAt ? (
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  آخرین به‌روزرسانی بازار: {formatJalali(ir.fetchedAt)}
                </p>
              ) : null}
            </div>
          </header>

          {/* آمار روز — بدون فید، «—» (هیچ عدد ساختگی) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="قیمت پایانی"
              value={
                num(quote?.closingPrice) != null
                  ? formatToman(quote!.closingPrice as number)
                  : num(quote?.price) != null
                  ? formatToman(quote!.price)
                  : "—"
              }
            />
            <Stat
              label="تغییر روز"
              value={pct != null ? formatSignedPercent(pct) : "—"}
              color={pct != null ? deltaColor(pct) : undefined}
            />
            <Stat
              label="ارزش معاملات"
              value={num(quote?.value) != null ? formatTomanShort(quote!.value as number) : "—"}
            />
            <Stat
              label="ورود پول حقیقی (امروز)"
              value={flow != null ? formatTomanShort(flow) : "—"}
              color={flow != null ? deltaColor(flow) : undefined}
            />
          </div>

          {isFund ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="NAV ابطال"
                value={num(quote?.nav) != null ? formatToman(quote!.nav as number) : "—"}
              />
              <Stat
                label="NAV صدور"
                value={num(quote?.navIssue) != null ? formatToman(quote!.navIssue as number) : "—"}
              />
              <Stat
                label="حباب"
                value={
                  num(quote?.bubblePercent) != null
                    ? formatSignedPercent(quote!.bubblePercent as number)
                    : "—"
                }
                color={
                  num(quote?.bubblePercent) != null
                    ? deltaColor(quote!.bubblePercent as number)
                    : undefined
                }
              />
              <Stat label="تاریخ NAV" value={quote?.navDate ? toPersianDigits(quote.navDate) : "—"} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="P/E"
                value={num(quote?.pe) != null ? toPersianDigits((quote!.pe as number).toFixed(1)) : "—"}
              />
              <Stat
                label="EPS (ریال)"
                value={
                  num(quote?.eps) != null
                    ? toPersianDigits(Math.round(quote!.eps as number).toLocaleString("en-US")).replace(/,/g, "٬")
                    : fundamentals?.n10?.data.standalone.eps_rial != null
                      ? toPersianDigits(
                          fundamentals.n10.data.standalone.eps_rial.toLocaleString("en-US")
                        ).replace(/,/g, "٬")
                      : "—"
                }
              />
              <Stat
                label="ارزش بازار"
                value={
                  num(quote?.marketValue) != null ? formatTomanShort(quote!.marketValue as number) : "—"
                }
              />
              <Stat
                label="حجم معاملات"
                value={
                  num(quote?.volume) != null
                    ? toPersianDigits(Math.round(quote!.volume as number).toLocaleString("en-US")).replace(/,/g, "٬")
                    : "—"
                }
              />
            </div>
          )}

          {/* T6 — هاب نماد با تب‌ها: نمای کلی · بنیادی · گزارش‌ها · مجامع */}
          <SymbolTabs
            overview={
              <div className="space-y-6">
                {/* M6: قیمت در برابر NAV — فقط برای صندوق‌ها */}
                {isFund && (
                  <section>
                    <h2 className="mb-3 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
                      قیمت در برابر NAV ابطال
                    </h2>
                    <PriceNavChart points={navPoints} />
                  </section>
                )}

                {/* تاریخچهٔ قیمت و جریان پول */}
                <section>
                  <h2 className="mb-3 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
                    تاریخچهٔ قیمت و جریان پول
                  </h2>
                  {points.length > 0 ? (
                    <HistoryChart points={points} />
                  ) : (
                    <div
                      className="rounded-xl border border-dashed p-6 text-center text-sm"
                      style={{ borderColor: "var(--line-strong)", color: "var(--text-3)" }}
                    >
                      تاریخچهٔ این نماد هنوز در سامانه ثبت نشده است. پوشش تاریخچه به‌تدریج برای همهٔ
                      نمادها گسترش می‌یابد.
                    </div>
                  )}
                </section>

                {/* T5-1 — دادهٔ زنده: عمق ۵سطحی، جریان حقیقی/حقوقی، کارت‌های ارزش‌گذاری */}
                {!isFund && (
                  <section>
                    <h2 className="mb-3 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
                      تابلوی زندهٔ نماد
                    </h2>
                    <SymbolLiveDetail symbol={sym} sections="market" />
                  </section>
                )}
              </div>
            }
            fundamental={
              <div className="space-y-6">{fundamentalTab}</div>
            }
            reports={<CodalReportsTab symbol={sym} stored={storedReports} />}
            assembly={<SymbolLiveDetail symbol={sym} sections="assembly" />}
          />

          {/* سلب مسئولیت — الزام قانون ۶ */}
          <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
            همهٔ اعداد از گزارش‌های رسمی کدال، فید بازار و تاریخچهٔ ثبت‌شدهٔ سامانه استخراج و با کد
            محاسبه شده‌اند؛ دادهٔ ناموجود «—» نمایش داده می‌شود. این صفحه صرفاً اطلاع‌رسانی و آموزشی
            است و توصیهٔ خرید یا فروش نیست. مسئولیت تصمیم‌گیری با خود سرمایه‌گذار است.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}


