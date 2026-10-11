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
    getFundamentalYoY().catch(() => null),
  ]);
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-7xl px-5 pt-8 pb-16">
          {!fundamentalYoY ? (
            <p role="status" className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--line-strong)", color: "var(--warning-ink)" }}>
              خواندن رشدهای بنیادی موفق نشد. فیلترهای بنیادی در این نتیجه داده‌ای ندارند؛ این وضعیت به معنی نبود گزارش شرکت‌ها نیست.
            </p>
          ) : !fundamentalYoY.coverage.monthly.complete || !fundamentalYoY.coverage.quarterly.complete ? (
            <p role="status" className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--line-strong)", color: "var(--warning-ink)" }}>
              پوشش گزارش‌های رشد بنیادی کامل نیست. نتایج فیلترهای بنیادی فقط برای نمادهایی است که هر دو دورهٔ مقایسه در دادهٔ خوانده‌شده موجود است.
            </p>
          ) : null}
          <DataExplorer
            stocks={ir?.stocks ?? []}
            funds={ir?.funds ?? []}
            gold={ir?.gold ?? []}
            currency={ir?.currency ?? []}
            fetchedAt={ir?.fetchedAt ?? null}
            avgVolume30={[...avgVol.entries()]}
            fundamentalYoY={fundamentalYoY ?? { monthly: {}, quarterly: {} }}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
