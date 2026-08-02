import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import StocksBoard from "@/components/market/StocksBoard";
import { getIrMarket } from "@/lib/market-ir";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "تابلوی بازار سهام",
  description:
    "جدول کامل نمادهای بورس و فرابورس با قیمت پایانی، حجم معامله و تغییر روزانه — بر اساس آخرین snapshot.",
  path: "/market/stocks",
});

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
