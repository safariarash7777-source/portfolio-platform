import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundsFullBoard from "@/components/market/FundsFullBoard";
import MarketShell from "@/components/market/MarketShell";
import FundsAccountBridge from "@/components/market/FundsAccountBridge";
import { readFundsMarket } from "@/lib/market-funds-read.server";
import { withValidNav } from "@/lib/market-quality";
import { getBulkReturns } from "@/lib/core/bulkReturns";
import { getAccess } from "@/lib/access";
import { pageMetadata } from "@/lib/metadata";
import { buildSearchIndex } from "@/lib/market-nav";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "دیده‌بان صندوق‌ها",
  description:
    "جدول کامل صندوق‌های سرمایه‌گذاری: NAV، بازده روز، خالص دارایی، فیلتر نوع و نقشهٔ بازار.",
  path: "/market/funds",
});

export default async function FundsPage() {
  const [{ data: ir, availability }, access] = await Promise.all([readFundsMarket(), getAccess()]);
  const returns = await getBulkReturns((ir?.funds ?? []).map(row => row.id));

  // M6: بازدهٔ دوره‌ای فقط برای نمادهای دارای تاریخچه — بقیه undefined می‌ماند (در UI «—»).
  // Validate each row's own price/NAV clocks before table, rankings or stats;
  // the snapshot receipt and a raw source bubble are not NAV attestation.
  const funds = (ir?.funds ?? []).map((row) => {
    const f = withValidNav(row, null, availability.readAt);
    const r = returns.get(f.id);
    return r ? { ...f, ret1w: r.w1, ret1m: r.m1, ret3m: r.m3, returnObservations: r.observations } : f;
  });
  const fetchedAt = availability.families?.funds.receivedAt ?? null;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <MarketShell
          active="funds"
          title="دیده‌بان صندوق‌ها"
          lead="NAV، حباب و بازدهٔ صندوق‌های سرمایه‌گذاری از آخرین اسنپ‌شات."
          fetchedAt={fetchedAt}
          qualityState={availability.families?.funds.state ?? "unavailable"}
          boardState={availability.families?.indices.state === "ready" ? ir?.indices?.state : null}
          searchIndex={buildSearchIndex(ir?.stocks ?? [], funds)}
          path="/market/funds"
        >
          <FundsFullBoard funds={funds} fetchedAt={fetchedAt} availability={availability} />
          <div className="mt-8">
            <FundsAccountBridge access={access} />
          </div>
        </MarketShell>
      </main>
      <Footer />
    </>
  );
}
