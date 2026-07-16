// صفحهٔ دادهٔ عمومی هر نماد/صندوق — /data/[symbol]
// هر بازدیدکننده: قیمت و آمار روز از اسنپ‌شات + تاریخچهٔ ۲۰ ساله (اگر در symbol_history باشد)
// + دانلود CSV + لینک به صفحهٔ تحلیل بنیادی (/symbol/[symbol]).
// قانون سخت: دادهٔ ناموجود «—» — هیچ عدد ساختگی.

import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HistoryChart, { type HistoryPoint } from "@/components/terminal/HistoryChart";
import { getIrMarket, type IrStockRow } from "@/lib/market-ir";
import { getSymbolHistory } from "@/lib/core/history";
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
    title: `دادهٔ نماد ${s} — قیمت، تاریخچه و جریان پول`,
    description: `دادهٔ کامل نماد ${s}: قیمت روز، ورود و خروج پول حقیقی، تاریخچهٔ قیمت و دانلود دادهٔ خام.`,
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

export default async function DataSymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);

  const [ir, history] = await Promise.all([getIrMarket(), getSymbolHistory(sym, 400)]);

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

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-5 pt-8 pb-16">
          <nav className="text-xs" style={{ color: "var(--text-3)" }}>
            <Link href="/data" className="hover:underline" style={{ color: "var(--navy)" }}>
              بانک دادهٔ بازار
            </Link>
            <span className="mx-1">/</span>
            {sym}
          </nav>

          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
                {sym}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                {quote?.faName ?? "—"}
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
              <Link
                href={`/symbol/${encodeURIComponent(sym)}`}
                className="rounded-full px-4 py-1.5 text-xs font-semibold"
                style={{ background: "var(--navy)", color: "var(--text-on-navy)" }}
              >
                تحلیل بنیادی نماد
              </Link>
            </div>
          </header>

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

          {ir?.fetchedAt ? (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              آخرین به‌روزرسانی بازار: {formatJalali(ir.fetchedAt)}
            </p>
          ) : null}

          <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
            همهٔ اعداد از فید رسمی بازار و تاریخچهٔ ثبت‌شدهٔ سامانه است و با کد محاسبه می‌شود؛ دادهٔ
            ناموجود «—» نمایش داده می‌شود. این صفحه صرفاً اطلاع‌رسانی است و توصیهٔ خرید یا فروش نیست.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
