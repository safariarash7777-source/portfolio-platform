// واچ‌لیست امتیازی + رژیم بازار — محیط تحلیلگر (دسترسی کامل).
// قانون سخت: هیچ واژهٔ سیگنالی؛ امتیازها «چارچوب تحلیلی»اند با درایور و فروض شفاف.
import Link from "next/link";
import { buildWatchlist } from "@/lib/core/watchlist";
import { toPersianDigits, formatJalali } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "دیده‌بان تکنیکال و رژیم بازار — قطب‌نمای بازار",
  robots: { index: false, follow: false },
};

function pd(x: number | null | undefined, suffix = ""): string {
  if (x == null) return "—";
  return toPersianDigits(String(x)) + suffix;
}

function scoreColor(s: number | null): string {
  if (s == null) return "var(--text-3)";
  if (s >= 65) return "var(--success)";
  if (s >= 45) return "var(--gold)";
  return "var(--danger)";
}

export default async function WatchlistPage() {
  const { regime, rows } = await buildWatchlist();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <p className="text-[12px] font-bold tracking-wide" style={{ color: "var(--gold)" }}>
          قطب‌نمای بازار · محیط تحلیلگر
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
            دیده‌بان تکنیکال و رژیم بازار
          </h1>
          <Link
            href="/terminal"
            className="text-[13px] font-semibold underline-offset-4 hover:underline"
            style={{ color: "var(--navy)" }}
          >
            ← فهرست نمادها
          </Link>
        </div>
      </header>

      {/* ── رژیم بازار ── */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              چشم‌انداز پهنای بازار{regime.as_of ? ` · ${formatJalali(regime.as_of)}` : ""}
            </p>
            <p className="mt-1 text-3xl font-extrabold" style={{ color: scoreColor(regime.score) }}>
              {regime.score != null ? toPersianDigits(regime.score) : "—"}
              <span className="mr-2 text-lg font-bold">{regime.label}</span>
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
              بر پایهٔ {toPersianDigits(regime.coveredCount)} نماد از جهان{" "}
              {toPersianDigits(regime.universeSize)} نمادی
            </p>
          </div>
          <div className="grid gap-2">
            {regime.drivers.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-[13px]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background:
                      d.effect === "positive"
                        ? "var(--success)"
                        : d.effect === "negative"
                          ? "var(--danger)"
                          : "var(--text-3)",
                  }}
                />
                <span style={{ color: "var(--text-2)" }}>
                  <b style={{ color: "var(--navy-deep)" }}>{d.label}:</b> {d.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px]" style={{ color: "var(--text-3)" }}>
            فروض محاسبه
          </summary>
          <ul className="mt-2 list-disc pr-5 text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
            {regime.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      </section>

      {/* ── جدول دیده‌بان تکنیکال ── */}
      <section className="mt-6">
        <p className="mb-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          امتیاز تکنیکال-جریانی = روند ۵۵٪ + نقدینگی ۴۵٪ · ستون بک‌تست: قاعدهٔ میانگین ۲۰/۶۰
          روی ~۴۰۰ روز اخیر با هزینه‌های کامل بازار ایران — سنجش «قاعده‌پذیری»، نه توصیه.
        </p>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2, var(--surface))", color: "var(--text-3)" }}>
                <th className="px-4 py-3 text-right font-semibold">نماد</th>
                <th className="px-3 py-3 text-center font-semibold">امتیاز</th>
                <th className="px-3 py-3 text-center font-semibold">روند</th>
                <th className="px-3 py-3 text-center font-semibold">نقدینگی</th>
                <th className="px-3 py-3 text-center font-semibold">بک‌تست ۲۰/۶۰ vs نگه‌داری</th>
                <th className="px-3 py-3 text-center font-semibold">حداکثر افت قاعده</th>
                <th className="px-3 py-3 text-center font-semibold">آخرین داده</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5 font-bold" style={{ color: "var(--navy-deep)" }}>
                    <Link
                      href={`/terminal/${encodeURIComponent(r.symbol)}`}
                      className="hover:underline"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center text-[15px] font-extrabold" style={{ color: scoreColor(r.techScore) }}>
                    {pd(r.techScore)}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: scoreColor(r.trend.score) }}>
                    {pd(r.trend.score)}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: scoreColor(r.liquidity.score) }}>
                    {pd(r.liquidity.score)}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: "var(--text-2)" }}>
                    {r.bt?.totalReturnPct != null && r.bt?.buyHoldReturnPct != null
                      ? `${pd(r.bt.totalReturnPct, "٪")} / ${pd(r.bt.buyHoldReturnPct, "٪")}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: "var(--text-2)" }}>
                    {r.bt?.maxDrawdownPct != null ? pd(r.bt.maxDrawdownPct, "٪") : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[12px]" style={{ color: "var(--text-3)" }}>
                    {r.lastDate ? formatJalali(r.lastDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
          این جدول چارچوب تحلیلی داخلی است؛ توصیهٔ خرید یا فروش نیست. دادهٔ ناموجود با «—»
          نمایش داده می‌شود و هرگز جایگزین‌سازی نمی‌شود.
        </p>
      </section>
    </main>
  );
}
