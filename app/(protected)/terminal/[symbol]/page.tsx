// صفحهٔ نماد در ترمینال تحلیلگر — «یک موتور، دو نما»: همه‌چیز از lib/core.
// قوانین: بازه+فروض، driver برای هر امتیاز، دادهٔ ناموجود = «—»، بدون واژهٔ سیگنالی.
import Link from "next/link";
import { buildTerminalView } from "@/lib/core/terminal";
import { netIndividualFlow } from "@/lib/core/engine";
import { ScorecardView, ValuationView, MaskView } from "@/components/terminal/Scorecard";
import HistoryChart, { type HistoryPoint } from "@/components/terminal/HistoryChart";
import { toPersianDigits, formatJalali } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { symbol } = await params;
  return {
    title: `ترمینال — ${decodeURIComponent(symbol)}`,
    robots: { index: false, follow: false },
  };
}

export default async function TerminalSymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol);
  const vm = await buildTerminalView(sym);

  const points: HistoryPoint[] = vm.history.map((d) => ({
    time: Math.floor(new Date(`${d.trade_date}T00:00:00Z`).getTime() / 1000),
    close: d.close,
    netFlow: netIndividualFlow(d),
  }));

  const lastDay = vm.history.length ? vm.history[vm.history.length - 1] : null;
  const n10 = vm.fundamentals?.n10?.data ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 text-[12px]" style={{ color: "var(--text-3)" }}>
        <Link href="/terminal" className="hover:underline">
          ترمینال تحلیلگر
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: "var(--text-2)" }}>{sym}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
            {sym}
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
            {n10
              ? `آخرین گزارش: ${n10.report_kind} · دورهٔ ${toPersianDigits(n10.period_months)} ماهه منتهی به ${toPersianDigits(n10.period_end)} · ${n10.audited ? "حسابرسی‌شده" : "حسابرسی‌نشده"}`
              : "گزارش بنیادی پردازش‌شده‌ای برای این نماد موجود نیست"}
            {lastDay
              ? ` · آخرین روز تاریخچه: ${formatJalali(lastDay.trade_date, false)}`
              : ""}
          </p>
        </div>
        {vm.lastClose != null ? (
          <div className="card px-4 py-3 text-left">
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              آخرین قیمت پایانی
            </p>
            <p
              className="mt-1 text-[16px] font-extrabold"
              style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
            >
              {toPersianDigits(vm.lastClose.toLocaleString("en-US"))} ریال
            </p>
          </div>
        ) : null}
      </header>

      <div className="space-y-8">
        <ScorecardView sc={vm.scorecard} />

        {vm.valuation ? (
          <ValuationView band={vm.valuation} lastClose={vm.lastClose} />
        ) : (
          <section className="card p-5 text-[13px]" style={{ color: "var(--text-3)" }}>
            بازهٔ ارزش‌گذاری فقط با EPS مثبتِ گزارش‌شده محاسبه می‌شود — برای این نماد فعلاً
            قابل‌محاسبه نیست (دادهٔ ناموجود هرگز با عدد ساختگی پر نمی‌شود).
          </section>
        )}

        <section>
          <h2 className="mb-4 text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
            تاریخچهٔ قیمت و جریان پول ({toPersianDigits(vm.history.length)} روز اخیر)
          </h2>
          <HistoryChart points={points} />
        </section>

        {vm.mask ? <MaskView mask={vm.mask} /> : null}
      </div>

      <footer className="mt-10 border-t pt-4 text-[11px] leading-5" style={{ borderColor: "var(--line)", color: "var(--text-3)" }}>
        دادهٔ بنیادی از گزارش‌های رسمی کدال و دادهٔ بازار از تاریخچهٔ ثبت‌شدهٔ سامانه است. این
        صفحه چارچوب تحلیلی داخلی تیم است و مبنای تصمیم قطعی نیست؛ مسئولیت هر تصمیم با
        تصمیم‌گیرنده است.
      </footer>
    </main>
  );
}
