import { marketProvenance } from "@/lib/market-quality";
import { getLastIrDiag, type IrMarket } from "@/lib/market-ir";
import { formatJalali, formatTehranClock } from "@/lib/format";

/** The same source/transport distinction for overview, funds and the symbol page. */
export default function MarketDataStatus({ market }: { market: IrMarket | null }) {
  const p = marketProvenance(market);
  const diag = getLastIrDiag();
  return <section aria-label="اعتبار و منبع داده" role="status" className="rounded-xl border p-4 text-xs leading-6" style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--text-2)" }}>
    {process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_MARKET_FIXTURE === "1" ? <p className="mb-2 font-bold">نمونهٔ نمایشی برای بازبینی؛ تمام ارقام این محیط آزمایشی‌اند.</p> : null}
    <p className="font-bold" style={{ color: "var(--heading)" }}>{p.label}</p>
    {diag?.fromCache && ((diag.status ?? 0) >= 400 || diag.error) ? <p>دریافت آخرین بسته انجام نشد؛ دادهٔ قبلی نمایش داده می‌شود.</p> : null}
    <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
      <span>زمان منبع شاخص: {p.validAt == null ? "نامشخص" : `${formatJalali(p.validAt)}، ${formatTehranClock(p.validAt)} تهران`}</span>
      <span>دریافت بسته: {p.receivedAt == null ? "نامشخص" : `${formatJalali(p.receivedAt)}، ${formatTehranClock(p.receivedAt)} تهران`}</span>
      <span>منبع: {p.source}</span>
    </div>
    <p>زمان شاخص، زمان همهٔ قیمت‌ها نیست. تاریخ NAV و آخرین روز تاریخچه کنار همان بخش آمده است.</p>
  </section>;
}
