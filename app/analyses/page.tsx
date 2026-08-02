// کارنامهٔ عمومی و قابل راستی‌آزمایی — «تحلیل‌های آرش» + چشم‌انداز هفتگی بازار.
//
// قوانین سخت:
//  - واژگان: «تحلیل» و «چشم‌انداز» — هرگز سیگنال/خرید/فروش/توصیه.
//  - هیچ عدد ساختگی؛ حالت خالی صادقانه.
//  - هر رکورد هش زنجیره‌ای دارد و دیتابیس ویرایش/حذف را بلاک می‌کند (append-only).

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import {
  fetchAnalyses,
  fetchWeeklyOutlooks,
  computeTrackStats,
  computeWeeklyStats,
  verifyLinkage,
  realizedReturnPct,
  type AnalysisRecord,
  type WeeklyOutlookRecord,
} from "@/lib/track/analyses";
import { toPersianDigits, formatJalaliShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "کارنامهٔ قابل راستی‌آزمایی — قطب‌نمای بازار",
  description:
    "کارنامهٔ شفاف تحلیل‌های آرش صفری و چشم‌انداز هفتگی بازار — هر رکورد با هش زنجیره‌ای ثبت می‌شود و پس از انتشار قابل ویرایش یا حذف نیست.",
  openGraph: {
    title: "کارنامهٔ قابل راستی‌آزمایی · آرش صفری",
    description: "کارنامهٔ شفاف تحلیل‌های آرش صفری — هر رکورد با هش زنجیره‌ای ثبت می‌شود و قابل ویرایش نیست.",
    url: "https://arashsafari.ir/analyses",
    type: "website",
  },
};

function pd(x: number | string | null | undefined, suffix = ""): string {
  if (x == null) return "—";
  return toPersianDigits(String(x)) + suffix;
}

function pctFa(x: number | null): string {
  if (x == null) return "—";
  const sign = x > 0 ? "+" : "";
  return toPersianDigits(sign + String(x)) + "٪";
}

function num(x: number | null): string {
  if (x == null) return "—";
  return toPersianDigits(Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));
}

const DIRECTION_FA: Record<string, string> = {
  buy: "چشم‌انداز صعودی",
  sell: "چشم‌انداز نزولی",
};

const OUTCOME_FA: Record<string, string> = {
  target: "رسیدن به بازهٔ اعلام‌شده",
  stop: "خروج با حد زیان",
  manual_close: "بستهٔ دستی",
  expired: "پایان افق زمانی",
};

const LABEL_COLOR: Record<string, string> = {
  سازنده: "var(--success)",
  خنثی: "var(--gold)",
  فرسایشی: "var(--danger)",
};

function HashBadge({ hash }: { hash: string }) {
  return (
    <span
      dir="ltr"
      title={hash}
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-mono tracking-tight"
      style={{ background: "var(--bg)", color: "var(--text-3)", border: "1px solid var(--line)" }}
    >
      {hash.slice(0, 10)}…{hash.slice(-6)}
    </span>
  );
}

export default async function AnalysesPage() {
  const [analyses, weekly] = await Promise.all([fetchAnalyses(100), fetchWeeklyOutlooks(60)]);
  const stats = computeTrackStats(analyses);
  const weeklyStats = computeWeeklyStats(weekly);
  const chainAnalyses = verifyLinkage(analyses);
  const chainWeekly = verifyLinkage(weekly);

  const open = analyses.filter((a) => a.outcome == null);
  const closed = analyses.filter((a) => a.outcome != null);

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-5xl px-5 pt-10 pb-16">
          {/* ── سربرگ ── */}
          <header className="mb-8">
            <span className="eyebrow">کارنامهٔ قابل راستی‌آزمایی</span>
            <h1
              className="font-display text-3xl md:text-4xl font-bold mt-2"
              style={{ color: "var(--navy-deep)" }}
            >
              کارنامهٔ تحلیل‌ها — شفاف و غیرقابل دستکاری
            </h1>
            <p className="text-sm md:text-base mt-3 leading-8" style={{ color: "var(--text-2)" }}>
              هر تحلیل و هر چشم‌انداز هفتگی، در لحظهٔ انتشار با مُهر زمانی و هشِ زنجیره‌ای در
              پایگاه‌داده ثبت می‌شود و پس از آن نه قابل ویرایش است، نه قابل حذف — برد و باخت، هر دو
              می‌مانند. اینجا هیچ توصیهٔ خرید یا فروشی وجود ندارد؛ فقط چارچوب تحلیلی با فروض شفاف،
              برای تصمیم آگاهانهٔ خودِ شما.
            </p>
          </header>

          {/* ── چرا این کارنامه قابل دستکاری نیست ── */}
          <section
            className="card p-5 mb-8"
            style={{ borderRight: "3px solid var(--gold)" }}
          >
            <h2 className="text-base font-extrabold" style={{ color: "var(--navy-deep)" }}>
              چرا این رکوردها قابل دستکاری نیستند؟
            </h2>
            <ul className="mt-3 space-y-2 text-[13.5px] leading-7" style={{ color: "var(--text-2)" }}>
              <li>
                <b>هش زنجیره‌ای:</b> هر رکورد یک اثر انگشت SHA-256 دارد که از محتوای خودش
                <b> به‌علاوهٔ هش رکورد قبلی</b> ساخته می‌شود؛ تغییر هر رکورد، زنجیرهٔ همهٔ رکوردهای
                بعدی را می‌شکند و فوراً آشکار می‌شود.
              </li>
              <li>
                <b>قفل پایگاه‌داده:</b> جدول‌ها append-only هستند — تریگر دیتابیس هر فرمان ویرایش،
                حذف یا خالی‌کردن را با خطا رد می‌کند؛ حتی برای مدیر سیستم.
              </li>
              <li>
                <b>راستی‌آزمایی مستقل:</b> هش کامل هر رکورد نمایش داده می‌شود؛ هر کسی می‌تواند
                پیوستگی زنجیره را خودش بازمحاسبه و بررسی کند.
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]" style={{ color: "var(--text-3)" }}>
              <span>
                وضعیت زنجیرهٔ تحلیل‌ها:{" "}
                <b style={{ color: chainAnalyses.ok ? "var(--success)" : "var(--danger)" }}>
                  {chainAnalyses.ok ? "سالم و پیوسته" : "نیازمند بررسی"}
                </b>{" "}
                ({pd(chainAnalyses.length)} رکورد)
              </span>
              <span>
                وضعیت زنجیرهٔ چشم‌انداز هفتگی:{" "}
                <b style={{ color: chainWeekly.ok ? "var(--success)" : "var(--danger)" }}>
                  {chainWeekly.ok ? "سالم و پیوسته" : "نیازمند بررسی"}
                </b>{" "}
                ({pd(chainWeekly.length)} رکورد)
              </span>
            </div>
          </section>

          {/* ── آمار کارنامه ── */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            {[
              { label: "کل تحلیل‌ها", value: pd(stats.total) },
              { label: "باز / بسته", value: `${pd(stats.open)} / ${pd(stats.closed)}` },
              { label: "نرخ موفقیت بسته‌شده‌ها", value: stats.winRatePct == null ? "—" : pctFa(stats.winRatePct).replace("+", "") },
              { label: "میانگین بازده بسته‌شده‌ها", value: pctFa(stats.avgReturnPct) },
            ].map((c) => (
              <div key={c.label} className="card p-4 text-center">
                <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                  {c.label}
                </div>
                <div className="mt-1 text-xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
                  {c.value}
                </div>
              </div>
            ))}
          </section>

          {/* ── چشم‌انداز هفتگی ── */}
          <section className="mb-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
                چشم‌انداز هفتگی بازار
              </h2>
              <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                دقت چشم‌اندازهای بسته‌شده:{" "}
                <b style={{ color: "var(--navy-deep)" }}>
                  {weeklyStats.accuracyPct == null
                    ? "هنوز داده‌ای نیست"
                    : `${pd(weeklyStats.accuracyPct)}٪ (${pd(weeklyStats.correct)} از ${pd(weeklyStats.closed)})`}
                </b>
              </span>
            </div>
            {weekly.length === 0 ? (
              <div className="card p-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
                هنوز چشم‌انداز هفتگی‌ای منتشر نشده است. اولین چشم‌انداز، ابتدای هفتهٔ معاملاتی آینده
                اینجا ثبت می‌شود — و پس از ثبت، دیگر قابل تغییر نیست.
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-[13px]" style={{ color: "var(--text-2)" }}>
                  <thead>
                    <tr className="text-right" style={{ color: "var(--text-3)" }}>
                      <th className="px-4 py-3 font-semibold">هفتهٔ شروع</th>
                      <th className="px-4 py-3 font-semibold">چشم‌انداز اعلام‌شده</th>
                      <th className="px-4 py-3 font-semibold">امتیاز موتور</th>
                      <th className="px-4 py-3 font-semibold">نتیجهٔ محقق‌شده</th>
                      <th className="px-4 py-3 font-semibold">درستی</th>
                      <th className="px-4 py-3 font-semibold">هش رکورد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekly.map((w: WeeklyOutlookRecord) => (
                      <tr key={w.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td className="px-4 py-3 whitespace-nowrap">{formatJalaliShort(w.week_start)}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: LABEL_COLOR[w.label] }}>
                          {w.label}
                        </td>
                        <td className="px-4 py-3">{pd(w.score)}</td>
                        <td className="px-4 py-3">
                          {w.result == null ? (
                            <span style={{ color: "var(--text-3)" }}>در جریان</span>
                          ) : (
                            <span style={{ color: LABEL_COLOR[w.result.realized_label] }}>
                              {w.result.realized_label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {w.result == null ? "—" : w.result.correct ? (
                            <b style={{ color: "var(--success)" }}>درست</b>
                          ) : (
                            <b style={{ color: "var(--danger)" }}>نادرست</b>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <HashBadge hash={w.record_hash} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── تحلیل‌های باز ── */}
          <section className="mb-10">
            <h2 className="text-xl font-extrabold mb-3" style={{ color: "var(--navy-deep)" }}>
              تحلیل‌های باز
            </h2>
            {open.length === 0 ? (
              <div className="card p-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
                در حال حاضر تحلیل بازی وجود ندارد. هر تحلیل جدید در لحظهٔ انتشار، با هش زنجیره‌ای
                اینجا ثبت می‌شود.
              </div>
            ) : (
              <div className="space-y-3">
                {open.map((a: AnalysisRecord) => (
                  <AnalysisCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>

          {/* ── تحلیل‌های بسته‌شده ── */}
          <section className="mb-4">
            <h2 className="text-xl font-extrabold mb-3" style={{ color: "var(--navy-deep)" }}>
              تحلیل‌های بسته‌شده
            </h2>
            {closed.length === 0 ? (
              <div className="card p-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
                هنوز تحلیلی بسته نشده است. نتیجهٔ هر تحلیل — برد یا باخت — پس از بسته‌شدن، همین‌جا و
                برای همیشه ثبت می‌شود.
              </div>
            ) : (
              <div className="space-y-3">
                {closed.map((a: AnalysisRecord) => (
                  <AnalysisCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>

          <p className="mt-8 text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
            سلب مسئولیت: محتوای این صفحه صرفاً چارچوب تحلیلی و آموزشی است، توصیهٔ خرید یا فروش
            هیچ دارایی‌ای نیست و مسئولیت هر تصمیم معاملاتی با خود شماست. جزئیات در{" "}
            <a href="/legal/disclaimer" className="underline underline-offset-4">
              بیانیهٔ سلب مسئولیت
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function AnalysisCard({ a }: { a: AnalysisRecord }) {
  const ret =
    a.outcome != null ? realizedReturnPct(a.direction, a.entry_price, a.outcome.exit_price) : null;
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
            {a.symbol}
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[12px] font-bold"
            style={{
              background: a.direction === "buy" ? "rgba(26,127,75,.08)" : "rgba(179,54,59,.08)",
              color: a.direction === "buy" ? "var(--success)" : "var(--danger)",
            }}
          >
            {DIRECTION_FA[a.direction]}
          </span>
          {a.horizon ? (
            <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
              افق: {a.horizon}
            </span>
          ) : null}
        </div>
        <HashBadge hash={a.record_hash} />
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]" style={{ color: "var(--text-2)" }}>
        <div>
          <div style={{ color: "var(--text-3)" }}>قیمت مرجع انتشار</div>
          <div className="font-bold">{num(a.entry_price)} ریال</div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)" }}>تاریخ انتشار</div>
          <div className="font-bold">{formatJalaliShort(a.entry_date)}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)" }}>بازهٔ ارزش (با فروض)</div>
          <div className="font-bold">
            {a.reasons.band && (a.reasons.band.low != null || a.reasons.band.high != null)
              ? `${num(a.reasons.band.low)} تا ${num(a.reasons.band.high)}`
              : "—"}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-3)" }}>وضعیت</div>
          {a.outcome == null ? (
            <div className="font-bold">باز</div>
          ) : (
            <div className="font-bold" style={{ color: ret != null && ret > 0 ? "var(--success)" : "var(--danger)" }}>
              {OUTCOME_FA[a.outcome.outcome]} · {pctFa(ret)}
            </div>
          )}
        </div>
      </div>

      {a.reasons.text ? (
        <p className="mt-3 text-[13.5px] leading-7" style={{ color: "var(--text-2)" }}>
          {a.reasons.text}
        </p>
      ) : null}

      {Array.isArray(a.reasons.assumptions) && a.reasons.assumptions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.reasons.assumptions.map((s, i) => (
            <span
              key={i}
              className="rounded-full px-2 py-0.5 text-[11.5px]"
              style={{ background: "var(--bg)", color: "var(--text-3)", border: "1px solid var(--line)" }}
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {a.outcome?.note ? (
        <p className="mt-2 text-[12.5px] leading-6" style={{ color: "var(--text-3)" }}>
          یادداشت بستن: {a.outcome.note}
        </p>
      ) : null}
    </article>
  );
}
