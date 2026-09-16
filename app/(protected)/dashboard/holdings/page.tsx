import { loadPortfolioSnapshot, loadPrices } from "@/lib/portfolio/service";
import { compareHoldingsToTarget, InvalidTargetError } from "@/lib/portfolio/rebalance";
import HoldingsWorkbench from "@/components/portfolio/HoldingsWorkbench";
import type { AssetClassRow, CoverageGap } from "@/lib/portfolio/contracts";

export const metadata = { title: "دارایی من" };
export const dynamic = "force-dynamic";

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const snapshot = await loadPortfolioSnapshot(v);
  const prices = await loadPrices();

  let rows: readonly AssetClassRow[] = [];
  let gaps: readonly CoverageGap[] = [];
  let definitive = false;
  let totalValue: number | null = null;
  const notes: string[] = [];

  if (snapshot.holdings && snapshot.target) {
    try {
      const result = compareHoldingsToTarget(snapshot.holdings, snapshot.target, prices, {
        maxPriceAgeDays: 3,
        maxPriceFutureDays: 1,
        now: new Date(),
      });
      rows = result.rows;
      gaps = result.gaps;
      definitive = result.definitive;
      totalValue = result.totalValue;
      notes.push(...result.notes);
    } catch (e) {
      // ⚠️ سبد هدفِ نامعتبر (مثلاً جمعِ ۱۱۰٪) صفحه را نمی‌اندازد، ولی
      // خودکار هم اصلاح نمی‌شود — دقیقاً همان چیزی که رخ داده گفته می‌شود.
      notes.push(
        e instanceof InvalidTargetError
          ? e.message
          : "مقایسه انجام نشد."
      );
    }
  } else if (!snapshot.holdings) {
    notes.push("هنوز دارایی‌ای ثبت نکرده‌اید.");
  } else {
    notes.push("سبد هدفی برای مقایسه ثبت نشده است.");
  }

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
        rows={rows}
        gaps={gaps}
        definitive={definitive}
        notes={notes}
        totalValue={totalValue}
      />
    </div>
  );
}
