import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DataExplorer from "@/components/data/DataExplorer";
import { getIrMarket } from "@/lib/market-ir";
import { getAvgVolume30 } from "@/lib/core/avgVolume";
import { getFundamentalYoY } from "@/lib/core/fundamentalData";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "بانک دادهٔ بازار",
  description:
    "داده‌های تاریخی سهام، صندوق‌ها، طلا و ارز — قابل دانلود برای تحلیل و پژوهش.",
  path: "/data",
});

export default async function DataBankPage() {
  const [ir, avgVol, fundamentalYoY] = await Promise.all([
    getIrMarket(),
    getAvgVolume30(),
    getFundamentalYoY(),
  ]);
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
            fundamentalYoY={fundamentalYoY}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
