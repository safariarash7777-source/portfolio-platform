import { loadPortfolioSnapshot, loadPriceRows } from "@/lib/portfolio/service";
import { buildHoldingsView } from "@/lib/portfolio/view";
import HoldingsWorkbench from "@/components/portfolio/HoldingsWorkbench";

export const metadata = { title: "دارایی من" };
export const dynamic = "force-dynamic";

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const snapshot = await loadPortfolioSnapshot(v);
  const priceRows = await loadPriceRows(snapshot.holdings?.positions ?? []);

  // ⚠️ صفحه خودش چیزی حساب نمی‌کند. همان ترکیبی را صدا می‌زند که مستقیم
  // آزمون می‌شود، وگرنه اتصالِ «خواندنِ هدف + خواندنِ قیمت + محاسبه» بی‌آزمون
  // می‌ماند — و هر سه ایرادِ بازبینی دقیقاً در همین اتصال بودند.
  const view = buildHoldingsView({
    holdings: snapshot.holdings,
    storedTarget: snapshot.storedTarget,
    priceRows,
    maxPriceAgeDays: 3,
    maxPriceFutureDays: 1,
    now: new Date(),
  });

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">داشبورد</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          دارایی من
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          دارایی واقعی خود را ثبت کنید و فاصله‌اش با سبد هدف را ببینید. این صفحه سفارش معامله
          نمی‌دهد و اجرای معامله ندارد.
        </p>
      </header>

      <HoldingsWorkbench
        ready={snapshot.ready}
        history={snapshot.history}
        activeVersion={snapshot.holdings?.version ?? null}
        activePositions={snapshot.holdings?.positions ?? []}
        rows={view.rows}
        gaps={view.gaps}
        definitive={view.definitive}
        notes={view.notes}
        totalValue={view.totalValue}
      />
    </div>
  );
}
