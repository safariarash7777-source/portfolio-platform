"use client";

// کارت بنیادی نمادمحور (WP-F) — نمای عمومی طبق SPEC-symbol-fundamental-card.md §۵
// سه لایه: ۱) روایت یک‌خطی (باز) ۲) زمینه/روند (تاشو) ۳) جدول خام محصولات (تاشو، محدود).
// همهٔ اعداد از lib/core/fundamentalCard می‌آیند — این کامپوننت فقط نمایش است.
// دادهٔ غایب = بند/سطر حذف؛ هیچ عدد ساختگی. واژگان ممنوع در UI هرگز.

import { useState } from "react";
import type { FundamentalCardData } from "@/lib/core/fundamentalCard";
import { toPersianDigits } from "@/lib/format";

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
      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{
        background: up ? "rgba(16,129,88,.12)" : "rgba(178,58,58,.12)",
        color: up ? "var(--green-strong, #0f7a54)" : "var(--red-strong, #b23a3a)",
      }}
      dir="ltr"
    >
      {up ? "▲" : "▼"} {fa(Math.abs(v))}٪
    </span>
  );
}

export default function SymbolFundamentalCard({ card }: { card: FundamentalCardData }) {
  const [openTrend, setOpenTrend] = useState(false);
  const [openRaw, setOpenRaw] = useState(false);

  // بدون هیچ داده‌ای، کارت اصلاً رندر نمی‌شود (قانون ۲ — تصمیم در والد هم تکرار شده)
  if (!card.latestMonth || card.narrative == null) return null;

  const maxTotal = Math.max(1, ...card.months12.map((m) => m.totalAmount));

  return (
    <section
      className="rounded-xl px-5 py-4"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
          کارت بنیادی — فعالیت ماهانه (ن-۳۰)
        </h2>
        {card.sourceUrl ? (
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] hover:underline"
            style={{ color: "var(--navy)" }}
          >
            منبع رسمی: کدال ↗
          </a>
        ) : null}
      </div>

      {/* لایهٔ ۱ — روایت یک‌خطی (همیشه باز) */}
      <p
        className="mt-3 rounded-lg px-4 py-3 text-[14px] font-medium leading-7"
        style={{ background: "var(--surface-2)", color: "var(--text-1)" }}
      >
        {fa(card.narrative)}
      </p>

      {/* لایهٔ ۲ — زمینه/روند (تاشو) */}
      <button
        type="button"
        onClick={() => setOpenTrend((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-bold"
        style={{ background: "var(--surface-2)", color: "var(--navy-deep)" }}
        aria-expanded={openTrend}
      >
        <span>روند و ترکیب فروش (۱۲ ماه)</span>
        <span aria-hidden>{openTrend ? "−" : "+"}</span>
      </button>
      {openTrend ? (
        <div className="mt-2 space-y-4 px-1">
          {/* روند فروش ماهانه + YoY */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[12px] font-bold" style={{ color: "var(--text-2)" }}>
                فروش ماهانه (میلیارد تومان)
              </h3>
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                درصدها: تغییر نسبت به همین ماه سال قبل
              </span>
            </div>
            <div className="space-y-1">
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
                        style={{ width: `${w}%`, background: "var(--navy)", minWidth: 8 }}
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

          {/* ترکیب داخلی/صادراتی + شکاف تولید−فروش + نرخ محصول اصلی */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>سهم صادرات (آخرین ماه)</div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--navy-deep)" }}>
                {card.exportSharePct != null ? `${fa(card.exportSharePct)}٪` : "—"}
              </div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                شکاف تولید−فروش (واحد کالا)
              </div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--navy-deep)" }} dir="ltr">
                {card.prodSalesGap != null ? fa(card.prodSalesGap.toLocaleString("en-US")) : "—"}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
                مثبت: تولید بیش از فروش (انباشت موجودی)
              </div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                نرخ فروش {card.topProductName ? `«${card.topProductName}»` : "محصول اصلی"} (ریال/واحد)
              </div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: "var(--navy-deep)" }} dir="ltr">
                {card.topProductRate != null ? fa(card.topProductRate.toLocaleString("en-US")) : "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* لایهٔ ۳ — دادهٔ خام محصولات آخرین ماه (تاشو) */}
      {card.latestProducts.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpenRaw((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-bold"
            style={{ background: "var(--surface-2)", color: "var(--navy-deep)" }}
            aria-expanded={openRaw}
          >
            <span>جدول محصولات آخرین ماه (دادهٔ خام)</span>
            <span aria-hidden>{openRaw ? "−" : "+"}</span>
          </button>
          {openRaw ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]">
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
                      <td className="py-1.5 pr-1 font-medium" style={{ color: "var(--text-1)" }}>{p.name}</td>
                      <td className="py-1.5" style={{ color: "var(--text-2)" }}>{p.market}</td>
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
        </>
      ) : null}
    </section>
  );
}
