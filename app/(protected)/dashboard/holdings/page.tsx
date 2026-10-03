import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { loadPortfolioSnapshot, loadPriceRows, loadVersionDebts } from "@/lib/portfolio/service";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import DebtsWorkbench from "@/components/portfolio/DebtsWorkbench";
import InvestmentScopeWorkbench from "@/components/portfolio/InvestmentScopeWorkbench";
import HoldingsSummary from "@/components/portfolio/HoldingsSummary";
import ReadError from "@/components/dashboard/ReadError";
import Link from "next/link";
import { valuePositions } from "@/lib/portfolio/valuation";
import HoldingsWorkbench from "@/components/portfolio/HoldingsWorkbench";
import { loadInvestmentScope } from "@/lib/portfolio/scopeService";

export const metadata = { title: "دارایی، بدهی و خالص ثروت" };
export const dynamic = "force-dynamic";

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const snapshot = await loadPortfolioSnapshot(v);
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
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          چه دارید، چقدر بدهکارید و تفاوت آن‌ها در اطلاعات ثبت‌شده چقدر است؟ دارایی و بدهی را ثبت یا اصلاح کنید و سابقهٔ هر نسخه را دوباره ببینید.
        </p>
      </header>

      <Link href="/dashboard" className="btn btn-outline">بازگشت به داشبورد</Link>
      <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>این صفحه فقط ثبت‌های نسخه‌دار دارایی و بدهی را نشان می‌دهد. سوابق سبد قبلی و الگوهای تخصیص در <Link href="/dashboard" className="underline">داشبورد قبلی</Link> محفوظ‌اند؛ به این فهرست تبدیل یا منتقل نشده‌اند. برای جلوگیری از محاسبهٔ حدسی، مقدار بدون واحد، مالکیت یا منبع معتبر را جدا بررسی و ثبت کنید.</p>
      <BalanceSheetSummary sheet={sheet} version={snapshot.holdings?.version ?? null} />
      {snapshot.ready ? <HoldingsSummary valuation={valuePositions(snapshot.holdings?.positions ?? [], prices.data ?? [], new Date())} version={snapshot.holdings?.version ?? null} pricesFailed={prices.status === "error"} /> : <ReadError label={snapshot.holdingsState === "not_found" ? "نسخهٔ انتخابی؛ در دسترس حساب شما نیست" : "دارایی‌ها"} code="PORTFOLIO_READ" />}
      {snapshot.targetState === "error" && <ReadError label="سبد هدف؛ دارایی شما مستقل از هدف قابل مشاهده است" code="PORTFOLIO_TARGET" />}
      {snapshot.ready && snapshot.holdings && <InvestmentScopeWorkbench key={`scope-${snapshot.holdings.id}-${scopeState.review?.id ?? scopeState.status}`} holdings={snapshot.holdings} scopeState={scopeState} editable={snapshot.holdings.version === snapshot.history[0]?.version} storedTarget={snapshot.storedTarget} priceRows={prices.data ?? []} pricesFailed={prices.status === "error"} />}
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
      <DebtsWorkbench key={`debts-${snapshot.holdings?.id ?? "new"}`} debts={debts.debts} ready={snapshot.ready && debts.ready} activeVersion={snapshot.holdings?.version ?? null} latestVersion={snapshot.history[0]?.version ?? 0} />
    </main><Footer /></>
  );
}
