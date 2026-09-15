import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundsFullBoard from "@/components/market/FundsFullBoard";
import MarketShell from "@/components/market/MarketShell";
import AccountBridge from "@/components/account/AccountBridge";
import { getIrMarket } from "@/lib/market-ir";
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
  const [ir, returns, access] = await Promise.all([getIrMarket(), getBulkReturns(), getAccess()]);
  // M6: بازدهٔ دوره‌ای فقط برای نمادهای دارای تاریخچه — بقیه undefined می‌ماند (در UI «—»).
  const funds = (ir?.funds ?? []).map((f) => {
    const r = returns.get(f.id);
    return r ? { ...f, ret1w: r.w1, ret1m: r.m1, ret3m: r.m3 } : f;
  });
  const fetchedAt = ir?.fetchedAt ?? null;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <MarketShell
          active="funds"
          title="دیده‌بان صندوق‌ها"
          lead="NAV، حباب و بازدهٔ صندوق‌های سرمایه‌گذاری از آخرین اسنپ‌شات."
          fetchedAt={fetchedAt}
          boardState={ir?.indices?.state ?? null}
          searchIndex={buildSearchIndex(ir?.stocks ?? [], funds)}
          path="/market/funds"
        >
          <FundsFullBoard funds={funds} fetchedAt={fetchedAt} />
          <div className="mt-8">
            <AccountBridge
              access={access}
              returnTo="/market/funds"
              backTo={{ href: "/market", label: "برگشت به میز بازار" }}
            />
          </div>
        </MarketShell>
      </main>
      <Footer />
    </>
  );
}
