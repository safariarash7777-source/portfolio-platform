import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import StocksBoard from "@/components/market/StocksBoard";
import { getIrMarket } from "@/lib/market-ir";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "تابلوی زندهٔ بازار سهام",
  description:
    "دیده‌بانی لحظه‌ای بازار: شاخص‌ها، جدول نمادها، نقشهٔ بازار و جستجوی سهام بورس و فرابورس؛ تاریخچه و خروجی داده در بانک داده.",
};

export default async function StocksPage() {
  const ir = await getIrMarket();
  const stocks = ir?.stocks ?? [];
  const indices = ir?.indices ?? null;
  const fetchedAt = ir?.fetchedAt ?? null;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16">
          <StocksBoard stocks={stocks} indices={indices} fetchedAt={fetchedAt} />
        </div>
      </main>
      <Footer />
    </>
  );
}
