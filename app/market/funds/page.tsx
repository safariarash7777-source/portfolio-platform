import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundsFullBoard from "@/components/market/FundsFullBoard";
import { getIrMarket } from "@/lib/market-ir";
import { getBulkReturns } from "@/lib/core/bulkReturns";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "دیده‌بان صندوق‌ها",
  description:
    "جدول کامل صندوق‌های سرمایه‌گذاری: NAV، بازده روز، خالص دارایی، فیلتر نوع و نقشهٔ بازار.",
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
        <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-5 md:pt-8">
          <nav className="mb-5 flex items-center gap-2 text-xs" aria-label="مسیر صفحه" style={{ color: "var(--text-3)" }}>
            <Link href="/market" className="font-semibold hover:underline" style={{ color: "var(--navy)" }}>میز بازار</Link>
            <span aria-hidden="true">/</span>
            <span>صندوق‌ها</span>
          </nav>
          <FundsFullBoard funds={funds} fetchedAt={fetchedAt} />
        </div>
      </main>
      <Footer />
    </>
  );
}
