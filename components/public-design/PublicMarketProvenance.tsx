import type { IrMarket } from "@/lib/market-ir";
import type { SourceAvailability } from "@/lib/market-bounded";
import { formatJalali, formatTehranClock, toPersianDigits } from "@/lib/format";
import { marketQualityLabel } from "@/lib/market-quality";
import { marketOverviewLabel } from "@/lib/public-design/market-status";
import s from "./PublicDesign.module.css";
const stamp = (value: number | null) =>
  value && Number.isFinite(value)
    ? `${formatJalali(value)}، ${formatTehranClock(value)}`
    : "ثبت نشده";
export default function PublicMarketProvenance({
  ir,
  availability,
}: {
  ir: Pick<IrMarket, "indices"> | null;
  availability: SourceAvailability;
}) {
  return (
    <details className={`${s.panel} ${s.provenance}`}>
      <summary>
        منبع و زمان داده ·{" "}
        {marketOverviewLabel(availability)}
      </summary>
      <p>
        منبع: فید بازار ایران و تاریخچهٔ ثبت‌شدهٔ سکو. زمان دریافت با زمان قیمت
        یا انتشار منبع یکسان نیست.
      </p>
      <dl>
        <div>
          <dt>زمان شاخص در منبع</dt>
          <dd>
            {ir?.indices?.date
              ? toPersianDigits(`${ir.indices.date} ${ir.indices.time ?? ""}`)
              : "ثبت نشده"}
          </dd>
        </div>
        <div>
          <dt>دریافت شاخص</dt>
          <dd>
            {stamp(
              availability.families?.indices.receivedAt ?? null,
            )}
          </dd>
        </div>
        <div>
          <dt>خواندن بازار</dt>
          <dd>{stamp(availability.readAt)}</dd>
        </div>
      </dl>
      {availability.families && (
        <p>
          صندوق‌ها: {marketQualityLabel(availability.families.funds.state)} ·
          سهام: {marketQualityLabel(availability.families.stocks.state)}
        </p>
      )}
    </details>
  );
}
