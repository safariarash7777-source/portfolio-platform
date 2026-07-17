// کارت «امروز بازار» — T3 ممیزی + M1 ابرتسک «رصد بازار».
// بخش ۱ (M1): پهنای روزِ کل بازار از خود اسنپ‌شات (همهٔ نمادها) — بدون وابستگی به تاریخچه.
// بخش ۲: رژیم تاریخی با برچسب صریحِ اندازهٔ جهان («بر اساس N نماد دارای تاریخچه»).
// قانون سخت: دادهٔ ناکافی → حالت خالی صادقانه؛ هیچ واژهٔ سیگنالی؛ ارقام فقط از lib/format.

import { buildWatchlist } from "@/lib/core/watchlist";
import { computeFlowAggregates, buildNarratives } from "@/lib/core/narrative";
import { computeDailyBreadth } from "@/lib/core/breadth";
import type { IrStockRow } from "@/lib/market-ir";
import { toPersianDigits, formatTomanShort, formatJalali } from "@/lib/format";

const LABEL_COLOR: Record<string, string> = {
  "سازنده": "var(--success)",
  "خنثی": "var(--gold)",
  "فرسایشی": "var(--danger)",
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

  const breadth = computeDailyBreadth(stocks);
  const flow = computeFlowAggregates(stocks);
  const narratives = regime ? buildNarratives(regime, flow) : [];
  const color = regime ? LABEL_COLOR[regime.label] ?? "var(--text-2)" : "var(--text-2)";

  const hasBreadth = breadth.universe > 0;
  if (!hasBreadth && !regime) return null;

  return (
    <section className="card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">امروز بازار</p>
          <h2 className="mt-1 font-display text-xl font-bold" style={{ color: "var(--navy-deep)" }}>
            چشم‌انداز آماری بازار سهام
          </h2>
        </div>
        {regime && regime.data_ok && regime.score != null ? (
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
            دادهٔ کافی برای رژیم تاریخی موجود نیست
          </span>
        )}
      </div>

      {/* M1 — پهنای روزِ کل بازار (از اسنپ‌شات، همهٔ نمادها) */}
      {hasBreadth ? (
        <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                نمادهای مثبت امروز
              </p>
              <p className="mt-0.5 text-[15px] font-bold" style={{ color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                {toPersianDigits(breadth.upCount)}
                {breadth.upPct != null ? (
                  <span className="mr-1 text-[11.5px] font-medium" style={{ color: "var(--text-3)" }}>
                    ({toPersianDigits(breadth.upPct)}٪)
                  </span>
                ) : null}
              </p>
            </div>
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                نمادهای منفی امروز
              </p>
              <p className="mt-0.5 text-[15px] font-bold" style={{ color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                {toPersianDigits(breadth.downCount)}
                {breadth.downPct != null ? (
                  <span className="mr-1 text-[11.5px] font-medium" style={{ color: "var(--text-3)" }}>
                    ({toPersianDigits(breadth.downPct)}٪)
                  </span>
                ) : null}
              </p>
            </div>
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                برآیند پول حقیقی امروز
              </p>
              {breadth.netFlowToman != null ? (
                <p
                  className="mt-0.5 text-[15px] font-bold"
                  style={{
                    color: breadth.netFlowToman >= 0 ? "var(--success)" : "var(--danger)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {breadth.netFlowToman >= 0 ? "ورود " : "خروج "}
                  {formatTomanShort(Math.abs(breadth.netFlowToman))}
                </p>
              ) : (
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  دادهٔ کافی موجود نیست
                </p>
              )}
            </div>
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                ارزش معاملات سهام
              </p>
              {breadth.totalValueToman != null ? (
                <p className="mt-0.5 text-[15px] font-bold" style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTomanShort(breadth.totalValueToman)}
                </p>
              ) : (
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  دادهٔ کافی موجود نیست
                </p>
              )}
            </div>
          </div>

          {breadth.topInflowIndustries.length > 0 ? (
            <p className="mt-2 text-[12.5px] leading-6" style={{ color: "var(--text-2)" }}>
              بیشترین ورود پول حقیقی امروز به صنایع{" "}
              {breadth.topInflowIndustries.map((x, i) => (
                <span key={x.industry}>
                  {i > 0 ? "، " : ""}
                  <b style={{ color: "var(--navy-deep)" }}>{x.industry}</b>{" "}
                  <span style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                    ({formatTomanShort(x.flowToman)})
                  </span>
                </span>
              ))}{" "}
              رسید.
            </p>
          ) : null}

          <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            پهنای روز بر اساس {toPersianDigits(breadth.universe)} نماد اسنپ‌شات بازار
            {breadth.flowCovered > 0
              ? ` · پوشش دادهٔ پول حقیقی: ${toPersianDigits(breadth.flowCovered)} نماد`
              : ""}
          </p>
        </div>
      ) : null}

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
      ) : null}

      {regime && regime.data_ok && regime.drivers.length > 0 ? (
        <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-3">
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
          {regime.universeSize > 0 ? (
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              رژیم تاریخی بر اساس {toPersianDigits(regime.universeSize)} نماد دارای تاریخچه در سامانه
              محاسبه شده است — با تکمیل تدریجی تاریخچهٔ روزانه، این جهان بزرگ‌تر می‌شود.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        همهٔ ارقام از اسنپ‌شات بازار و تاریخچهٔ ثبت‌شده محاسبه می‌شوند
        {regime?.as_of ? ` — رژیم به‌روز تا ${formatJalali(regime.as_of)}` : ""}
        {fetchedAt ? ` · اسنپ‌شات بازار: ${formatJalali(fetchedAt)}` : ""}. این بخش صرفاً
        اطلاع‌رسانی است و توصیهٔ خرید یا فروش نیست.
      </p>
    </section>
  );
}
