import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import OptionsBoard from "@/components/market/OptionsBoard";
import { getIrMarket } from "@/lib/market-ir";

export const dynamic = "force-dynamic";

import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata({
  title: "اختیار معامله",
  description:
    "تابلوی اختیار معامله بازار سرمایهٔ ایران — قرارداد اختیار خرید و فروش، پریمیوم، سررسید و موقعیت باز.",
  path: "/market/options",
});

export default async function OptionsPage() {
  const ir = await getIrMarket();
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-7xl px-5 pt-8 pb-16">
          <OptionsBoard options={ir?.options ?? []} fetchedAt={ir?.fetchedAt ?? null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
