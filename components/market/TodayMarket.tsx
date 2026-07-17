// کارت «امروز بازار» — T3 ممیزی (WP2): چشم‌انداز آماری بازار بالای /market عمومی.
// Server component؛ داده از buildWatchlist() (کش ۱۰ دقیقه) + اسنپ‌شات بازار.
// قانون سخت: دادهٔ ناکافی → حالت خالی صادقانه؛ هیچ واژهٔ سیگنالی.

import { buildWatchlist } from "@/lib/core/watchlist";
import { computeFlowAggregates, buildNarratives } from "@/lib/core/narrative";
import type { IrStockRow } from "@/lib/market-ir";
import { toPersianDigits, formatJalali } from "@/lib/format";

const LABEL_COLOR: Record<string, string> = {
  "سازنده": "var(--green, #16a34a)",
  "خنثی": "var(--gold, #b98a00)",
  "فرسایشی": "var(--red, #dc2626)",
};

export default async function TodayMarket({
  stocks,
  fetchedAt,
}: {
  stocks: IrStockRow[];
  fetchedAt: number | null;
}) {
  let regime = null;
  try {
    regime = (await buildWatchlist()).regime;
  } catch {
    regime = null;
  }

  if (!regime) return null;

  const flow = computeFlowAggregates(stocks);
  const narratives = buildNarratives(regime, flow);
  const color = LABEL_COLOR[regime.label] ?? "var(--text-2)";

  return (
    <section className="card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">امروز بازار</p>
          <h2 className="mt-1 font-display text-xl font-bold" style={{ color: "var(--navy-deep)" }}>
            چشم‌انداز آماری بازار سهام
          </h2>
        </div>
        {regime.data_ok && regime.score != null ? (
          <div className="flex items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: "var(--surface-2)", color }}
            >
              {regime.label}
            </span>
            <span
              className="text-2xl font-extrabold"
              style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
            >
              {toPersianDigits(regime.score)}
              <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>
                /۱۰۰
              </span>
            </span>
          </div>
        ) : (
          <span
            className="rounded-full px-3 py-1 text-sm font-medium"
            style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
          >
            دادهٔ کافی برای محاسبه موجود نیست
          </span>
        )}
      </div>

      {narratives.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {narratives.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-7" style={{ color: "var(--text-2)" }}>
              <span aria-hidden style={{ color }}>
                ●
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm" style={{ color: "var(--text-3)" }}>
          دادهٔ کافی برای روایت امروز هنوز جمع نشده است؛ به‌محض تکمیل دادهٔ بازار، این بخش به‌روز
          می‌شود.
        </p>
      )}

      {regime.data_ok && regime.drivers.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {regime.drivers.map((d) => (
            <div
              key={d.label}
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {d.label}
              </p>
              <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: "var(--text-2)" }}>
                {d.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        چشم‌انداز آماری از پهنای بازار (نمادهای دارای تاریخچه در سامانه) با فرمول شفاف محاسبه
        می‌شود{regime.as_of ? ` — به‌روز تا ${formatJalali(regime.as_of)}` : ""}
        {fetchedAt ? ` · اسنپ‌شات بازار: ${formatJalali(fetchedAt)}` : ""}. این بخش صرفاً
        اطلاع‌رسانی است و توصیهٔ خرید یا فروش نیست.
      </p>
    </section>
  );
}
