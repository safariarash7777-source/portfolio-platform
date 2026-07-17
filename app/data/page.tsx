import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DataExplorer from "@/components/data/DataExplorer";
import { getIrMarket } from "@/lib/market-ir";
import { getAvgVolume30 } from "@/lib/core/avgVolume";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "بانک دادهٔ بازار — سهام، صندوق‌ها، طلا و ارز",
  description:
    "دسترسی آزاد به دادهٔ همهٔ نمادهای بورس و فرابورس، صندوق‌های سرمایه‌گذاری (طلا، اهرمی، درآمد ثابت، کالایی)، طلا و ارز — با جستجو، مرتب‌سازی و خروجی داده.",
};

export default async function DataBankPage() {
  const [ir, avgVol] = await Promise.all([getIrMarket(), getAvgVolume30()]);
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-7xl px-5 pt-8 pb-16">
          <DataExplorer
            stocks={ir?.stocks ?? []}
            funds={ir?.funds ?? []}
            gold={ir?.gold ?? []}
            currency={ir?.currency ?? []}
            fetchedAt={ir?.fetchedAt ?? null}
            avgVolume30={[...avgVol.entries()]}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
