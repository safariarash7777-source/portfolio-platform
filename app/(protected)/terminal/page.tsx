// فهرست ترمینال تحلیلگر — نمادهای دارای تاریخچه در symbol_history.
// چارچوب تحلیلی داخلی؛ هیچ واژهٔ سیگنالی در هیچ خروجی این صفحه نیست.
import Link from "next/link";
import { getHistorySymbols } from "@/lib/core/history";
import { toPersianDigits } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TerminalIndexPage() {
  const symbols = await getHistorySymbols();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-[12px] font-bold tracking-wide" style={{ color: "var(--gold)" }}>
          قطب‌نمای بازار · محیط تحلیلگر
        </p>
        <h1 className="mt-1 text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          ترمینال تحلیلگر
        </h1>
        <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
          کارت امتیاز سه‌محوره، بازهٔ ارزش‌گذاری سناریویی و جریان پول برای هر نماد — همه از یک
          موتور محاسباتی واحد و دادهٔ رسمی کدال/بازار. این محیط چارچوب تحلیلی داخلی است، نه
          مرجع تصمیم قطعی.
        </p>
      </header>

      {symbols.length === 0 ? (
        <div className="card p-6 text-[13px]" style={{ color: "var(--text-3)" }}>
          هنوز تاریخچه‌ای در پایگاه داده ثبت نشده است. پس از اتمام بک‌فیل، نمادها اینجا ظاهر
          می‌شوند.
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-3)" }}>
            {toPersianDigits(symbols.length)} نماد دارای تاریخچه
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {symbols.map((s) => (
              <Link
                key={s}
                href={`/terminal/${encodeURIComponent(s)}`}
                className="card px-4 py-3 text-center text-[14px] font-bold transition-colors hover:border-[var(--gold)]"
                style={{ color: "var(--navy-deep)" }}
              >
                {s}
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
