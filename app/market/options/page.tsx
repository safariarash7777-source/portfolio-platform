import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import OptionsBoard from "@/components/market/OptionsBoard";
import { readIranMarket } from "@/lib/market-bounded";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "تابلوی اختیار معامله",
  description:
    "قراردادهای اختیار خرید و فروش بازار بورس ایران — نماد، قیمت اعمال، سررسید و موقعیت باز.",
  path: "/market/options",
});

export default async function OptionsPage() {
  const { data: ir, availability } = await readIranMarket();
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-7xl px-5 pt-8 pb-16">
          <OptionsBoard options={ir?.options ?? []} fetchedAt={availability.families?.options.receivedAt ?? null} availability={availability.families?.options} />
        </div>
      </main>
      <Footer />
    </>
  );
}
