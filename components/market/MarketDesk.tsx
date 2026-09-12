/**
 * میزِ بازار — «امروز چه چیزی ارزشِ نگاهِ دوباره دارد».
 *
 * این کامپوننت چیزی حساب نمی‌کند؛ همهٔ منطق در `lib/core/marketDesk.ts` است
 * (اصلِ «یک موتور، دو نما»). کارش فقط نمایش است — و نمایشِ **صادقانه**:
 * وقتی چیزی نیست، می‌گوید چند چیز را سنجیده و چند چیز را نتوانسته ببیند.
 */
import Link from "next/link";
import { AlertTriangle, Clock, Eye, HelpCircle, Layers, TrendingUp } from "lucide-react";
import { buildDesk, type DeskBand, type DeskKind, type DeskFund, type DeskStock } from "@/lib/core/marketDesk";
import { formatJalali, toPersianDigits } from "@/lib/format";
import type { IrMarket } from "@/lib/market-ir";

const KIND_META: Record<DeskKind, { label: string; Icon: typeof Clock }> = {
  nav_stale:       { label: "کهنگیِ NAV",      Icon: Clock },
  nav_missing:     { label: "نبودِ ساعتِ NAV",  Icon: HelpCircle },
  premium_outlier: { label: "فاصله از هم‌نوع",  Icon: Layers },
  band_edge:       { label: "نزدیکیِ دامنه",    Icon: TrendingUp },
  board_gap:       { label: "فاصلهٔ تابلو",     Icon: AlertTriangle },
};

/** باندِ کیفی — سه رنگ، بدونِ عددِ ترکیبی. */
const BAND_STYLE: Record<DeskBand, { bg: string; fg: string }> = {
  "قابل‌توجه": { bg: "rgba(185,28,28,0.10)",  fg: "var(--danger)" },
  "متوسط":     { bg: "rgba(180,83,9,0.10)",   fg: "var(--warning)" },
  "خفیف":      { bg: "rgba(100,116,139,0.10)", fg: "var(--text-3)" },
};

function fa(v: string | number): string {
  return toPersianDigits(String(v));
}

export default function MarketDesk({ ir }: { ir: IrMarket | null }) {
  const funds: DeskFund[] = (ir?.funds ?? []).map((f) => ({
    id: f.id, faName: f.faName, price: f.price ?? null, type: f.type ?? null,
    nav: f.nav ?? null, bubblePercent: f.bubblePercent ?? null,
    navDate: f.navDate ?? null, navTime: f.navTime ?? null,
  }));
  const stocks: DeskStock[] = (ir?.stocks ?? []).map((s) => ({
    id: s.id, faName: s.faName, price: s.price ?? null,
    closingPrice: s.closingPrice ?? null,
    bandHigh: s.bandHigh ?? null, bandLow: s.bandLow ?? null,
    volume: s.volume ?? null,
  }));

  const desk = buildDesk({ funds, stocks }, { limit: 12 });
  const totalMatched = desk.coverage.reduce((a, c) => a + c.matched, 0);
  const totalExamined = desk.coverage.reduce((a, c) => a + c.examined, 0);
  const totalCandidates = desk.coverage.reduce((a, c) => a + c.candidates, 0);
  const blockedRules = desk.coverage.filter((c) => c.blocked !== null).length;
  const partialRules = desk.coverage.filter((c) => c.examined < c.candidates).length;
  const sourceUnavailable = ir === null;
  const limitedCoverage = !sourceUnavailable && (blockedRules > 0 || partialRules > 0);

  const emptyTitle = sourceUnavailable
    ? "دادهٔ بازار در دسترس نیست."
    : totalExamined === 0
      ? "دادهٔ کافی برای اجرای سنجه‌ها نرسیده است."
      : limitedCoverage
        ? "در بخشِ قابل‌سنجش، موردی از آستانه عبور نکرد."
        : "امروز موردی از آستانه‌ها عبور نکرد.";

  const emptyDetail = sourceUnavailable
    ? "این وضعیت خطای دریافت داده است؛ به معنی آرام‌بودن بازار نیست."
    : totalExamined === 0
      ? `${fa(totalCandidates)} نامزد دیده شد، اما دادهٔ لازم برای سنجش کامل نبود.`
      : limitedCoverage
        ? `${fa(totalExamined)} سنجش انجام شد؛ پوشش کامل نیست و نتیجه فقط دربارهٔ دادهٔ دیده‌شده صدق می‌کند.`
        : `${fa(totalExamined)} سنجش انجام شد و هیچ‌کدام از آستانه رد نشد.`;

  return (
    <section aria-labelledby="desk-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="desk-title" className="font-display text-xl font-extrabold md:text-2xl" style={{ color: "var(--heading)" }}>
            چه چیزی ارزشِ نگاه دوباره دارد؟
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
            خروجیِ قواعد شفاف روی آخرین اسنپ‌شات؛ مشاهده است، نه پیشنهاد اقدام.
          </p>
        </div>
        <div className="text-left">
          <p className="text-[11.5px] whitespace-nowrap" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
            {fa(totalMatched)} مورد · {fa(totalExamined)} اجرای قاعده
          </p>
          <p className="mt-1 text-[10.5px]" style={{ color: sourceUnavailable ? "var(--danger)" : "var(--text-3)" }}>
            {ir?.fetchedAt ? `اسنپ‌شات قیمت: ${formatJalali(ir.fetchedAt)}` : "زمان اسنپ‌شات در دسترس نیست"}
          </p>
        </div>
      </div>

      {limitedCoverage && desk.observations.length > 0 ? (
        <div
          className="mb-3 rounded-xl border px-4 py-3 text-xs leading-6"
          style={{ borderColor: "rgba(180,83,9,0.28)", background: "rgba(180,83,9,0.06)", color: "var(--text-2)" }}
          role="status"
        >
          پوشش کامل نیست: {fa(partialRules)} قاعده ورودی ناقص داشت و {fa(blockedRules)} قاعده متوقف شد. موارد زیر فقط از دادهٔ قابل‌سنجش ساخته شده‌اند.
        </div>
      ) : null}

      {desk.observations.length === 0 ? (
        <div className="card px-4 py-5 text-center">
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
            {emptyTitle}
          </p>
          <p className="text-[11.5px] mt-1" style={{ color: "var(--text-3)" }}>
            {emptyDetail}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {desk.observations.map((o) => {
            const meta = KIND_META[o.kind];
            const style = BAND_STYLE[o.band];
            return (
              <li key={o.id} className="card px-4 py-3.5 flex flex-col gap-2.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <meta.Icon size={14} strokeWidth={2} style={{ color: "var(--gold-ink)", flexShrink: 0 }} aria-hidden />
                    <span className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{meta.label}</span>
                  </div>
                  <span
                    className="text-[10.5px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    {o.band}
                  </span>
                </div>

                <div className="min-w-0">
                  <Link
                    href={`/symbol/${encodeURIComponent(o.symbol)}`}
                    className="font-display text-[15px] font-extrabold hover:underline truncate block"
                    style={{ color: "var(--navy-deep)" }}
                  >
                    {o.symbol}
                  </Link>
                  <p className="text-[11.5px] truncate" style={{ color: "var(--text-3)" }}>{o.faName}</p>
                  <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-2)" }}>{o.headline}</p>
                </div>

                <dl className="grid gap-1 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                  {o.drivers.map((d) => (
                    <div key={d.label} className="flex items-baseline justify-between gap-2">
                      <dt className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{d.label}</dt>
                      <dd
                        className="text-[11.5px] font-bold whitespace-nowrap"
                        style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {fa(d.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {/* پوشش — چرا میز این‌قدر پر یا خالی است. عمداً همیشه دیده می‌شود. */}
      <details className="mt-2.5">
        <summary
          className="inline-flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
          style={{ color: "var(--text-3)" }}
        >
          <Eye size={13} strokeWidth={2} aria-hidden />
          این میز چه چیزی را دید و چه چیزی را ندید
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                <th className="text-right font-normal py-1.5 px-2">سنجه</th>
                <th className="text-right font-normal py-1.5 px-2">نامزد</th>
                <th className="text-right font-normal py-1.5 px-2">سنجیده‌شده</th>
                <th className="text-right font-normal py-1.5 px-2">عبور از آستانه</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {desk.coverage.map((c) => (
                <tr key={c.kind} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-1.5 px-2" style={{ color: "var(--text-2)" }}>
                    {KIND_META[c.kind].label}
                    {c.blocked ? (
                      <span className="block text-[10.5px] mt-0.5" style={{ color: "var(--warning)" }}>{fa(c.blocked)}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 px-2" style={{ color: "var(--text-3)" }}>{fa(c.candidates)}</td>
                  <td className="py-1.5 px-2" style={{ color: "var(--text-2)" }}>{fa(c.examined)}</td>
                  <td className="py-1.5 px-2 font-bold" style={{ color: "var(--text)" }}>{fa(c.matched)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {desk.unusable > 0 ? (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
              {fa(desk.unusable)} ابزار قیمتِ معتبری نداشت و وارد هیچ سنجه‌ای نشد.
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
