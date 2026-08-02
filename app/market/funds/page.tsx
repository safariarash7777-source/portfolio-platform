import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundsFullBoard from "@/components/market/FundsFullBoard";
import { getIrMarket } from "@/lib/market-ir";
import { getBulkReturns } from "@/lib/core/bulkReturns";

export const dynamic = "force-dynamic";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata({
  title: "دیده‌بان صندوق‌ها",
  description:
    "دیده‌بان صندوق‌های سرمایه‌گذاری ایران — صندوق‌های طلا، اهرمی، درآمد ثابت، کالایی و سهامی با NAV، بازدهی و مقایسهٔ کامل.",
  path: "/market/funds",
});

export default async function FundsPage() {
  const [ir, returns] = await Promise.all([getIrMarket(), getBulkReturns()]);
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
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16">
          <FundsFullBoard funds={funds} fetchedAt={fetchedAt} />
        </div>
      </main>
      <Footer />
    </>
  );
}
