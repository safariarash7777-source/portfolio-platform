import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FundsFullBoard from "@/components/market/FundsFullBoard";
import { getIrMarket } from "@/lib/market-ir";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "دیده‌بان صندوق‌ها",
  description: "جدول کامل صندوق‌های سرمایه‌گذاری: NAV، بازده روز، خالص دارایی، فیلتر نوع و نقشهٔ بازار.",
};

export default async function FundsPage() {
  const ir = await getIrMarket();
  const funds = ir?.funds ?? [];
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
