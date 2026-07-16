// صفحهٔ نماد — میزبان ۶ نمودار استاندارد WP4 + سرصفحهٔ قیمت زنده.
// قیمت/تغییر/P/E از فید بازار (WP1)؛ اگر فید در دسترس نبود سرصفحه بدون عدد
// جایگزین، «—» نشان می‌دهد. دادهٔ بنیادی از رجیستری اعتبارسنجی‌شده می‌آید.
// کارت امتیاز سه‌محوره (WP5) عمداً «به‌زودی» است — منطق امتیاز هنوز مصوب نشده.

import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundamentalCharts from "@/components/symbol/FundamentalCharts";
import { getIrMarket, type IrStockRow } from "@/lib/market-ir";
import { getFundamentals } from "@/lib/fundamental/registry";
import {
  toPersianDigits,
  formatToman,
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
    title: `نماد ${s} — تحلیل بنیادی و قیمت`,
    description: `قیمت لحظه‌ای، نمودارهای بنیادی کدال و روند مالی نماد ${s}.`,
  };
}

function HeaderStat({ label, value, color }: { label: string; value: string; color?: string }) {
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

  const ir = await getIrMarket();
  const all: IrStockRow[] = [...(ir?.stocks ?? []), ...(ir?.funds ?? [])];
  const quote = all.find((r) => r.id === sym) ?? null;
  const pct = quote?.changePercent ?? quote?.closingChangePercent ?? null;

  const fundamentals = await getFundamentals(sym);

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16 space-y-6">
          {/* سرصفحهٔ نماد */}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold" style={{ color: "var(--navy-deep)" }}>
                {sym}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                {fundamentals?.n10?.data.company_name ?? quote?.faName ?? "—"}
                {quote?.industry ? ` · ${quote.industry}` : ""}
              </p>
            </div>
            {ir?.fetchedAt ? (
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                آخرین به‌روزرسانی بازار: {formatJalali(ir.fetchedAt)}
              </p>
            ) : null}
          </header>

          {/* آمار زندهٔ بازار — بدون فید، «—» (هیچ عدد ساختگی) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeaderStat label="آخرین قیمت" value={quote ? formatToman(quote.price) : "—"} />
            <HeaderStat
              label="تغییر روز"
              value={pct != null ? formatSignedPercent(pct) : "—"}
              color={pct != null ? deltaColor(pct) : undefined}
            />
            <HeaderStat
              label="P/E"
              value={quote?.pe != null ? toPersianDigits(quote.pe.toFixed(1)) : "—"}
            />
            <HeaderStat
              label="EPS (ریال)"
              value={
                quote?.eps != null
                  ? toPersianDigits(Math.round(quote.eps).toLocaleString("en-US")).replace(/,/g, "٬")
                  : fundamentals?.n10?.data.standalone.eps_rial != null
                    ? toPersianDigits(
                        fundamentals.n10.data.standalone.eps_rial.toLocaleString("en-US")
                      ).replace(/,/g, "٬")
                    : "—"
              }
            />
          </div>

          {/* کارت امتیاز سه‌محوره (WP5) — به‌زودی؛ بدون امتیاز موقت */}
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

          {/* نمودارهای بنیادی WP4 */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
              تحلیل بنیادی (گزارش‌های کدال)
            </h2>
            <FundamentalCharts fundamentals={fundamentals ?? { symbol: sym, n10: null, n30: null }} />
          </section>

          {/* سلب مسئولیت — الزام قانون ۶ */}
          <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
            همهٔ اعداد از گزارش‌های رسمی کدال و فید بازار استخراج و با کد محاسبه شده‌اند؛ این
            صفحه صرفاً اطلاع‌رسانی و آموزشی است و توصیهٔ خرید یا فروش نیست. مسئولیت تصمیم‌گیری
            با خود سرمایه‌گذار است.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
