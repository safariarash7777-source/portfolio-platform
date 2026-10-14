import { Boxes } from "lucide-react";
import { deltaColor, describeDelta, formatOrDash, formatSignedPercent, toPersianDigits } from "@/lib/format";
import type { CommodityState, IrCommodityRow } from "@/lib/market-ir";

const CARD_LIMIT = 24;
const tehranClock = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formatPrice = (value: number) => toPersianDigits(value.toLocaleString("en-US", { maximumSignificantDigits: 15 })).replaceAll(",", "٬").replace(".", "٫");
const clock = (ms: number | null) => ms !== null && Number.isFinite(ms) && ms > 0 && Number.isFinite(new Date(ms).getTime()) ? tehranClock.format(ms) : null;
const stateText: Record<CommodityState, string> = {
  received: "زمان دریافت فید با زمان قیمت هر کالا متفاوت است.",
  stale: "به‌روزرسانی اخیر ناموفق؛ آخرین دادهٔ ذخیره‌شده نمایش داده می‌شود.",
  unavailable: "دریافت دادهٔ کالا در دسترس نیست.",
  disabled: "دریافت فید کالا غیرفعال است.",
  unknown: "وضعیت دریافت این فید مشخص نیست.",
};

/** Stored quotes only: no provider requests, inferred units, or synthetic history. */
export default function CommodityBoard({ rows, fetchedAt, state = "unknown" }: {
  rows: readonly IrCommodityRow[];
  fetchedAt: number | null;
  state?: CommodityState;
}) {
  const received = clock(fetchedAt);
  const visible = rows.slice(0, CARD_LIMIT);
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--gold-tint)", color: "var(--heading)" }}>
            <Boxes size={18} aria-hidden="true" />
          </span>
          <h2 className="font-display text-lg font-bold" style={{ color: "var(--heading)" }}>قیمت کالاها</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>منبع: <bdi>BrsApi</bdi></p>
      </div>
      <div className="space-y-1 text-xs" style={{ color: "var(--text-2)" }}>
        <p>آخرین دریافت فید کالا: {received ?? "زمان دریافت نامعلوم"}{received ? " (تهران)" : ""}</p>
        <p>{stateText[state]}</p>
        {rows.length > CARD_LIMIT ? <p>نمایش {toPersianDigits(visible.length)} از {toPersianDigits(rows.length)} کالا</p> : null}
      </div>
      {visible.length === 0 ? <p className="card p-4 text-sm" style={{ color: "var(--text-2)" }}>قیمت کالایی برای نمایش ثبت نشده است.</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row, index) => {
            const sourceClock = row.timeUnix === null ? null : clock(row.timeUnix * 1000);
            const change = typeof row.changePercent === "number" && Number.isFinite(row.changePercent) ? row.changePercent : null;
            return (
              <article key={`${row.id}-${index}`} className="card min-w-0 space-y-3 p-4">
                <div>
                  <h3 className="break-words text-sm font-bold" style={{ color: "var(--text)" }}>{row.name ?? row.id}</h3>
                  <bdi className="text-xs" style={{ color: "var(--text-3)" }}>{row.id}</bdi>
                </div>
                <dl className="space-y-2 text-sm" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  <div className="flex flex-wrap justify-between gap-2"><dt>قیمت</dt><dd className="font-bold" style={{ color: "var(--text)" }}>{formatOrDash(row.price, formatPrice)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2"><dt>واحد منبع</dt><dd><bdi>{row.unit ?? "واحد نامعلوم"}</bdi></dd></div>
                  <div className="flex flex-wrap justify-between gap-2"><dt>تغییر</dt><dd style={{ color: change === null ? "var(--text-3)" : deltaColor(change) }} aria-label={change === null ? "تغییر نامعلوم" : describeDelta(change)}>{change === null ? "—" : formatSignedPercent(change)}</dd></div>
                </dl>
                <div className="space-y-1 text-xs" style={{ color: "var(--text-3)" }}>
                  <p>تاریخ منبع: <bdi>{row.date ? toPersianDigits(row.date) : "نامعلوم"}</bdi> · ساعت منبع: <bdi>{row.time ? toPersianDigits(row.time) : "نامعلوم"}</bdi></p>
                  {sourceClock ? <p>زمان ثبت منبع (تهران): {sourceClock}</p> : !row.date || !row.time ? <p>زمان کامل قیمت نامعلوم است.</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
