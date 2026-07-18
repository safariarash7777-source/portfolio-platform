import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketTreemap from "@/components/market/MarketTreemap";
import { getIrMarket } from "@/lib/market-ir";
import { formatJalali } from "@/lib/format";
import { Map as MapIcon, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "نقشهٔ بازار — نمای یک‌نگاهی سهام و صندوق‌ها",
  description:
    "نقشهٔ حرارتی بازار سهام و صندوق‌های ایران: اندازهٔ هر کاشی ارزش معاملات یا ارزش بازار، رنگ آن درصد تغییر روز. کلیک روی هر نماد، صفحهٔ جزئیات آن را باز می‌کند.",
};

export default async function MarketMapPage() {
  const ir = await getIrMarket();
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-7xl px-5 pt-8 pb-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--navy)" }}
              >
                <MapIcon size={16} />
                نمای یک‌نگاهی بازار
              </p>
              <h1
                className="mt-1 text-3xl font-extrabold"
                style={{ color: "var(--navy-deep)" }}
              >
                نقشهٔ بازار
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "var(--text-3)" }}>
                هر کاشی یک نماد است: اندازهٔ کاشی، ارزش معاملات امروز یا ارزش بازار؛ رنگ آن، درصد
                تغییر قیمت پایانی. این نقشه توصیف دادهٔ امروز است، نه ارزیابی. کلیک روی هر کاشی،
                صفحهٔ نماد را باز می‌کند.
              </p>
            </div>
            {ir?.fetchedAt ? (
              <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
                <Clock size={13} />
                به‌روزرسانی: {formatJalali(ir.fetchedAt)}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <MarketTreemap stocks={ir?.stocks ?? []} funds={ir?.funds ?? []} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
