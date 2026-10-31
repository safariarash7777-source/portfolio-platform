"use client";

// کارت بنیادی نمادمحور (WP-F) — نمای عمومی طبق SPEC-symbol-fundamental-card.md §۵
// سه لایه: ۱) روایت یک‌خطی (باز) ۲) زمینه/روند (تاشو) ۳) جدول خام محصولات (تاشو، محدود).
// همهٔ اعداد از lib/core/fundamentalCard می‌آیند — این کامپوننت فقط نمایش است.
// دادهٔ غایب = بند/سطر حذف؛ هیچ عدد ساختگی. واژگان ممنوع در UI هرگز.

import { useId, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { FundamentalCardData } from "@/lib/core/fundamentalCard";
import { toPersianDigits } from "@/lib/format";
import Term from "@/components/learn/Term";
import styles from "./SymbolDossier.module.css";

function fa(x: string | number): string {
  return toPersianDigits(String(x));
}

function faAmountBToman(mrial: number | null): string {
  if (mrial == null || !isFinite(mrial)) return "—";
  const b = mrial / 10_000; // میلیون ریال → میلیارد تومان
  const v = Math.round(b * 10) / 10;
  return fa(v.toLocaleString("en-US"));
}

function yoyBadge(v: number | null) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span
      className={styles.yoyBadge}
      style={{ color: up ? "var(--success)" : "var(--danger)" }}
      dir="ltr"
    >
      {up ? "▲" : "▼"} {fa(Math.abs(v))}٪
    </span>
  );
}

export default function SymbolFundamentalCard({ card }: { card: FundamentalCardData }) {
  const [openTrend, setOpenTrend] = useState(false);
  const [openRaw, setOpenRaw] = useState(false);
  const trendId = useId();
  const rawId = useId();

  // بدون هیچ داده‌ای، کارت اصلاً رندر نمی‌شود (قانون ۲ — تصمیم در والد هم تکرار شده)
  if (!card.latestMonth || card.narrative == null) return null;

  const maxTotal = Math.max(1, ...card.months12.map((m) => m.totalAmount));

  return (
    <section className={styles.fundamentalCard}>
      <header className={styles.cardHeader}>
        <div>
        <p className={styles.period}>دورهٔ فعالیت: <span dir="ltr">{fa(card.latestMonth)}</span></p>
        <h2 className="font-display text-lg font-bold" style={{ color: "var(--heading)" }}>
          کارت بنیادی — فعالیت ماهانه (<Term id="n10-n30">ن-۳۰</Term>)
        </h2>
        {card.sourceTitle ? <p className={styles.sourceTitle}>{card.sourceTitle}</p> : null}
        </div>
        {card.sourceUrl ? (
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
            style={{ color: "var(--navy-ink)" }}
          >
            منبع رسمی: کدال <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </header>

      {/* لایهٔ ۱ — روایت یک‌خطی (همیشه باز) */}
      <p
        className={styles.narrative}
      >
        {fa(card.narrative)}
      </p>

      {/* لایهٔ ۲ — زمینه/روند (تاشو) */}
      <button
        type="button"
        onClick={() => setOpenTrend((v) => !v)}
        className={styles.disclosure}
        aria-expanded={openTrend}
        aria-controls={trendId}
      >
        <span>روند و ترکیب فروش (۱۲ ماه)</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={trendId} hidden={!openTrend}>
      {openTrend ? (
        <div className={`mt-2 space-y-4 ${styles.detail}`}>
          {/* روند فروش ماهانه + YoY */}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12px] font-bold" style={{ color: "var(--text-2)" }}>
                فروش ماهانه (میلیارد تومان)
              </h3>
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                درصدها: تغییر نسبت به همین ماه سال قبل
              </span>
            </div>
            <div className={styles.trendScroll}>
            <div className={`space-y-1 ${styles.trendRows}`}>
              {card.months12.map((m) => {
                const yoy = card.monthlyYoY.find((x) => x.month === m.month)?.yoyPct ?? null;
                const w = Math.max(2, Math.round((m.totalAmount / maxTotal) * 100));
                return (
                  <div key={m.month} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[11px]" style={{ color: "var(--text-3)" }} dir="ltr">
                      {fa(m.month)}
                    </span>
                    <div className="h-4 flex-1 rounded bg-transparent">
                      <div
                        className="flex h-4 items-center rounded"
                        style={{ width: `${w}%`, background: "var(--data-1)", minWidth: 8 }}
                        title={`${faAmountBToman(m.totalAmount)} میلیارد تومان`}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-left text-[11px] font-medium" style={{ color: "var(--text-2)" }} dir="ltr">
                      {faAmountBToman(m.totalAmount)}
                    </span>
                    <span className="w-16 shrink-0 text-left">{yoyBadge(yoy)}</span>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          {/* ترکیب داخلی/صادراتی + شکاف تولید−فروش + نرخ محصول اصلی */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>سهم صادرات (آخرین ماه)</div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--heading)" }}>
                {card.exportSharePct != null ? `${fa(card.exportSharePct)}٪` : "—"}
              </div>
              {card.marketUnavailableReason ? (
                <p className="mt-1 text-[10px]" style={{ color: "var(--text-3)" }}>
                  {card.marketUnavailableReason === "unverified-market" ? "تفکیک بازار تأیید نشده" : card.marketUnavailableReason === "signed-market-adjustment" ? "محاسبهٔ سهم با مبلغ اصلاحی/منفی در روش فعلی پشتیبانی نمی‌شود" : "پوشش مبلغ ردیف‌های بازار کامل نیست"}؛ سهم صادرات نامعلوم است.
                </p>
              ) : null}
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                شکاف تولید−فروش ({card.quantityUnit ?? 'واحد نامعلوم'})
              </div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--heading)" }} dir="ltr">
                {card.prodSalesGap != null ? fa(card.prodSalesGap.toLocaleString("en-US")) : "—"}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
                مثبت: تولید بیش از فروش (انباشت موجودی)
              </div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                نرخ فروش {card.topProductName ? `«${card.topProductName}»` : "محصول اصلی"} ({card.quantityUnit ? `ریال/${card.quantityUnit}` : 'واحد نامعلوم'})
              </div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--heading)" }} dir="ltr">
                {card.topProductRate != null ? fa(card.topProductRate.toLocaleString("en-US")) : "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>

      {/* لایهٔ ۳ — دادهٔ خام محصولات آخرین ماه (تاشو) */}
      {card.latestProducts.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpenRaw((v) => !v)}
            className={styles.disclosure}
            aria-expanded={openRaw}
            aria-controls={rawId}
          >
            <span>جدول محصولات آخرین ماه (دادهٔ خام)</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <div id={rawId} hidden={!openRaw}>
          {openRaw ? (
            <div className={`mt-2 ${styles.rawTable}`}>
              <table className="w-full text-[12px]">
                <caption className="sr-only">محصولات گزارش فعالیت ماهانه؛ نرخ به ریال و مبلغ به میلیارد تومان</caption>
                <thead>
                  <tr style={{ color: "var(--text-3)" }}>
                    <th className="py-1 text-right font-medium">محصول</th>
                    <th className="py-1 text-right font-medium">بازار</th>
                    <th className="py-1 text-left font-medium">تولید</th>
                    <th className="py-1 text-left font-medium">فروش (مقدار)</th>
                    <th className="py-1 text-left font-medium">نرخ (ریال)</th>
                    <th className="py-1 text-left font-medium">مبلغ (میلیارد تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {card.latestProducts.map((p, i) => (
                    <tr key={`${p.name}-${p.market}-${i}`} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="py-1.5 pr-1 font-medium" style={{ color: "var(--text)" }}>{p.name}</td>
                      <td className="py-1.5" style={{ color: "var(--text-2)" }}>{p.market === "نامشخص" ? "تفکیک نامعلوم" : p.market}</td>
                      <td className="py-1.5 text-left" dir="ltr" style={{ color: "var(--text-2)" }}>
                        {p.productionQty != null ? fa(p.productionQty.toLocaleString("en-US")) : "—"}
                      </td>
                      <td className="py-1.5 text-left" dir="ltr" style={{ color: "var(--text-2)" }}>
                        {p.salesQty != null ? fa(p.salesQty.toLocaleString("en-US")) : "—"}
                      </td>
                      <td className="py-1.5 text-left" dir="ltr" style={{ color: "var(--text-2)" }}>
                        {p.salesRate != null ? fa(p.salesRate.toLocaleString("en-US")) : "—"}
                      </td>
                      <td className="py-1.5 text-left" dir="ltr" style={{ color: "var(--text-2)" }}>
                        {p.salesAmount != null ? faAmountBToman(p.salesAmount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {card.sourceTitle ? (
                <p className="mt-2 text-[10px]" style={{ color: "var(--text-3)" }}>
                  منبع: {card.sourceTitle} — کدال (گزارش رسمی ناشر)
                </p>
              ) : null}
            </div>
          ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
