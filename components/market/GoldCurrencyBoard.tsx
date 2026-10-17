"use client";
import { useState } from "react";
import { Coins, Clock } from "lucide-react";
import {
  toPersianDigits,
  formatToman,
  formatSignedPercent,
  deltaColor,
  formatJalali,
  formatTehranClock,
} from "@/lib/format";
import { sourceTime, type FamilyAvailability } from "@/lib/market-quality";
import { quoteClock, quoteClockLabel } from "@/lib/commodity-quality";

interface IrRow {
  id: string;
  faName: string;
  price: number;
  unit: "toman" | "usd";
  change?: number | null;
  changePercent?: number | null;
  sourceDate?: string | null;
  sourceTime?: string | null;
}

interface Props {
  gold: IrRow[];
  currency: IrRow[];
  fetchedAt: number | null;
  availability?: { gold?: FamilyAvailability; currency?: FamilyAvailability };
  now?: number;
}

type Tab = "gold" | "currency";

export default function GoldCurrencyBoard({ gold, currency, fetchedAt, availability, now = Date.now() }: Props) {
  const [tab, setTab] = useState<Tab>(gold.length ? "gold" : "currency");
  const rows = tab === "gold" ? gold : currency;
  const family = availability?.[tab];
  // When family metadata exists, a missing family receipt must not borrow the batch clock.
  const receivedAt = availability ? family?.receivedAt ?? null : fetchedAt;
  const receipt = quoteClock(receivedAt, now);
  const retained = family?.retained === true || family?.sourceState === "stale";
  const receiptText = retained ? "دریافت تازهٔ این بخش احراز نشده؛ آخرین دادهٔ ذخیره‌شده حفظ شده است."
    : family?.sourceState === "unavailable" || family?.state === "unavailable" ? "دریافت دادهٔ این بخش در دسترس نیست."
    : receipt.state === "future" ? "زمان دریافت جلوتر از ساعت ارزیابی است و معتبر محسوب نمی‌شود."
    : receipt.state === "old" ? "دریافت تازهٔ این بخش در نیم ساعت اخیر ثبت نشده است."
    : receipt.state === "unknown" ? "زمان دریافت این بخش نامعلوم است."
    : "دریافت این بخش در بازهٔ اخیر ثبت شده؛ زمان قیمت هر ردیف مستقل است.";

  if (gold.length === 0 && currency.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--gold-tint)", color: "var(--heading)" }}
          >
            <Coins size={18} />
          </span>
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--heading)" }}>
            طلا و ارز
          </h2>
        </div>
        {receipt.at != null ? (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            <Clock size={12} />
            <span>دریافت {tab === "gold" ? "طلا و سکه" : "ارز"}: {formatJalali(receipt.at)} · {formatTehranClock(receipt.at)} (تهران)</span>
          </div>
        ) : <span className="text-[11px]" style={{ color: "var(--text-3)" }}>زمان دریافت نامعلوم</span>}
      </div>
      <p className="text-xs leading-6" style={{ color: "var(--text-2)" }}>{receiptText}</p>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabBtn active={tab === "gold"} onClick={() => setTab("gold")} label="طلا و سکه" count={gold.length} />
        <TabBtn active={tab === "currency"} onClick={() => setTab("currency")} label="ارز" count={currency.length} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => {
          const pct = r.changePercent ?? null;
          const priceClock = quoteClock(sourceTime(r.sourceDate, r.sourceTime), now);
          return (
            <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-bold text-sm block truncate" style={{ color: "var(--text)" }}>
                  {r.faName}
                </span>
                <span className="text-xs mt-0.5 block" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  {r.unit === "usd"
                    ? `$${toPersianDigits(r.price.toLocaleString("en-US")).replace(/,/g, "٬")}`
                    : formatToman(r.price)}
                </span>
                <p className="mt-2 text-xs leading-6" style={{ color: "var(--text-3)" }}>تاریخ منبع: <bdi>{r.sourceDate ? toPersianDigits(r.sourceDate) : "نامعلوم"}</bdi> · ساعت منبع: <bdi>{r.sourceTime ? toPersianDigits(r.sourceTime) : "نامعلوم"}</bdi></p>
                {priceClock.at !== null ? <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>زمان قیمت (تهران): {formatJalali(priceClock.at)} · {formatTehranClock(priceClock.at)}</p> : null}
                <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>{quoteClockLabel[priceClock.state]}</p>
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
          );
        })}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
      style={{
        minHeight: 44,
        background: active ? "var(--navy-deep)" : "var(--surface-2)",
        color: active ? "var(--text-on-navy)" : "var(--text-2)",
      }}
    >
      {label} ({toPersianDigits(count)})
    </button>
  );
}
