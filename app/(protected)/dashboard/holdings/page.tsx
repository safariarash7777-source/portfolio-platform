import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { loadPortfolioSnapshot, loadPriceRows, loadVersionDebts } from "@/lib/portfolio/service";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import FinancialEditors from "@/components/portfolio/FinancialEditors";
import DebtsWorkbench from "@/components/portfolio/DebtsWorkbench";
import InvestmentScopeWorkbench from "@/components/portfolio/InvestmentScopeWorkbench";
import HoldingsSummary from "@/components/portfolio/HoldingsSummary";
import ReadError from "@/components/dashboard/ReadError";
import { formatJalali, toPersianDigits } from "@/lib/format";
import Link from "next/link";
import { valuePositions } from "@/lib/portfolio/valuation";
import HoldingsWorkbench from "@/components/portfolio/HoldingsWorkbench";
import { loadInvestmentScope } from "@/lib/portfolio/scopeService";
import DebtSchedule from "@/components/portfolio/DebtSchedule";
import { paymentReferenceDay } from "@/lib/portfolio/paymentSchedule";

export const metadata = { title: "دارایی، بدهی و خالص ثروت" };
export const dynamic = "force-dynamic";

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const snapshot = await loadPortfolioSnapshot(v);
  const selected = snapshot.history.find(item => item.id === snapshot.holdings?.id);
  const historical = !!selected && selected.id !== snapshot.history[0]?.id;
  const [prices, debts] = await Promise.all([loadPriceRows(snapshot.holdings?.positions ?? []), loadVersionDebts(snapshot.holdings?.id ?? null)]);
  const sheet = buildBalanceSheet({ positions: snapshot.holdings?.positions ?? [], debts: debts.debts, priceRows: prices.data ?? [], now: new Date(), recorded: !!snapshot.holdings, assetsReady: snapshot.ready, debtsReady: snapshot.ready && debts.ready, pricesFailed: prices.status === "error" });
  const scopeState = snapshot.ready && snapshot.holdings ? await loadInvestmentScope(snapshot.holdings) : { status: "error" as const, review: null };

  // ⚠️ صفحه خودش چیزی حساب نمی‌کند. همان ترکیبی را صدا می‌زند که مستقیم
  // آزمون می‌شود، وگرنه اتصالِ «خواندنِ هدف + خواندنِ قیمت + محاسبه» بی‌آزمون
  // می‌ماند — و هر سه ایرادِ بازبینی دقیقاً در همین اتصال بودند.

  return (
    <><Navbar /><main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8" dir="rtl">
      <header>
        <span className="eyebrow">داشبورد</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          دارایی، بدهی و خالص ثروت
        </h1>
      </header>

      {historical && selected && <aside aria-labelledby="history-basis" className="card space-y-2 border-s-4 p-5" style={{ borderInlineStartColor: "var(--gold)" }}>
        <h2 id="history-basis" className="font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>نسخهٔ بایگانی‌شدهٔ {toPersianDigits(selected.version)}</h2>
        <p className="text-sm leading-7">تاریخ ثبت نسخه: {Number.isFinite(Date.parse(selected.createdAt)) ? <time dateTime={selected.createdAt}>{formatJalali(selected.createdAt)}</time> : "نامعلوم"}. اقلام دارایی، ماندهٔ بدهی و انتخاب‌های ثبت‌شدهٔ سبد مربوط به همین نسخه‌اند.</p>
        <p className="text-sm leading-7">قیمت بازار از آخرین دادهٔ در دسترس هر نماد می‌آید، نه الزاماً از روز ثبت. ارزش اظهارشده با تاریخ ثبت خودش حفظ می‌شود. این ارقام بازده آن دوره نیستند.</p>
        <Link href="/dashboard/holdings" className="btn btn-outline min-h-11">بازگشت به آخرین نسخه</Link>
      </aside>}

      <nav aria-label="بخش‌های پروندهٔ مالی" className="flex flex-wrap gap-2">
        <a href="#asset-editor" className="btn btn-gold min-h-11">{historical ? "مشاهدهٔ دارایی" : "ثبت دارایی"}</a>
        <a href="#debt-editor" className="btn btn-outline min-h-11">{historical ? "مشاهدهٔ بدهی" : "ثبت بدهی"}</a>
        <a href="#investment-scope" className="btn btn-outline min-h-11">محدودهٔ سبد</a>
        <Link href="/dashboard" className="btn btn-outline min-h-11">بازگشت به داشبورد</Link>
      </nav>
      <FinancialEditors key={`financial-editors-${snapshot.holdings?.id ?? "new"}`}>
      <section id="asset-editor" tabIndex={-1} className="scroll-mt-24 min-w-0" aria-label="ثبت و مشاهدهٔ دارایی">
      <HoldingsWorkbench
        key={snapshot.holdings?.id ?? "new"}
        ready={snapshot.ready}
        targetFailed={snapshot.targetState === "error"}
        latestVersion={snapshot.history[0]?.version ?? 0}
        history={snapshot.history}
        activeVersion={snapshot.holdings?.version ?? null}
        activePositions={snapshot.holdings?.positions ?? []}
        rows={[]}
        gaps={[]}
        definitive={false}
        notes={[]}
        totalValue={null}
        showComparison={false}
        showImport={false}
      />
      </section>
      <BalanceSheetSummary historical={historical} sheet={sheet} version={snapshot.holdings?.version ?? null} />
      <DebtSchedule debts={debts.debts} ready={snapshot.ready && debts.ready} version={snapshot.holdings?.version ?? null} referenceDay={paymentReferenceDay(new Date())} historical={historical} />
      {snapshot.ready ? <HoldingsSummary historical={historical} valuation={valuePositions(snapshot.holdings?.positions ?? [], prices.data ?? [], new Date())} version={snapshot.holdings?.version ?? null} pricesFailed={prices.status === "error"} /> : <ReadError label={snapshot.holdingsState === "not_found" ? "نسخهٔ انتخابی؛ در دسترس حساب شما نیست" : "دارایی‌ها"} code="PORTFOLIO_READ" />}
      {!historical && snapshot.targetState === "error" && <ReadError label="سبد هدف؛ دارایی شما مستقل از هدف قابل مشاهده است" code="PORTFOLIO_TARGET" />}
      <section id="investment-scope" tabIndex={-1} className="scroll-mt-24 min-w-0" aria-label="محدودهٔ سبد سرمایه‌گذاری">
      {!snapshot.ready && <p role="alert" className="card p-5 text-sm leading-7">دارایی‌های این نسخه خوانده نشدند؛ محدودهٔ سبد در دسترس نیست و خالی بودن آن تأیید نمی‌شود.</p>}
      {snapshot.ready && !snapshot.holdings && <p className="card p-5 text-sm leading-7">برای تعیین محدودهٔ سبد، ابتدا <a href="#asset-editor" className="underline">دارایی‌های خود را ثبت کنید</a>. نبود ثبت به معنی نداشتن سرمایه‌گذاری نیست.</p>}
      {snapshot.ready && snapshot.holdings && <InvestmentScopeWorkbench key={`scope-${snapshot.holdings.id}-${scopeState.review?.id ?? scopeState.status}`} holdings={snapshot.holdings} scopeState={scopeState} editable={snapshot.holdings.version === snapshot.history[0]?.version} historical={historical} storedTarget={historical ? null : snapshot.storedTarget} priceRows={prices.data ?? []} pricesFailed={prices.status === "error"} />}
      </section>
      <section id="debt-editor" tabIndex={-1} className="scroll-mt-24 min-w-0" aria-label="ثبت و مشاهدهٔ بدهی"><DebtsWorkbench key={`debts-${snapshot.holdings?.id ?? "new"}`} debts={debts.debts} ready={snapshot.ready && debts.ready} activeVersion={snapshot.holdings?.version ?? null} latestVersion={snapshot.history[0]?.version ?? 0} /></section>
      </FinancialEditors>
      <details className="card p-4 text-sm"><summary className="cursor-pointer">سوابق سبد قبلی</summary><Link className="underline" href="/dashboard">مشاهده سوابق و الگوهای تخصیص در داشبورد</Link></details>
    </main><Footer /></>
  );
}
