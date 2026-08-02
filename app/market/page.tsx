import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketClient from "@/components/market/MarketClient";
import GoldCurrencyBoard from "@/components/market/GoldCurrencyBoard";
import TodayMarket from "@/components/market/TodayMarket";
import TodayDashboard from "@/components/market/TodayDashboard";
import FundsBoard from "@/components/market/FundsBoard";
import GoldUsdTrend from "@/components/market/GoldUsdTrend";
import IndexTrend from "@/components/market/IndexTrend";
import { getMarketData } from "@/lib/market";
import { getIrMarket } from "@/lib/market-ir";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "رصد بازار — سهام، طلا، ارز و صندوق‌ها",
  description: "داشبورد رصد بازار ایران: آخرین اسنپ‌شات طلا، ارز، سهام، صندوق‌ها و کریپتو — به‌روزرسانی روزانه از رلهٔ داخلی.",
  openGraph: {
    title: "رصد بازار — سهام، طلا، ارز و صندوق‌ها · آرش صفری",
    description: "داشبورد رصد بازار ایران: آخرین اسنپ‌شات طلا، ارز، سهام، صندوق‌ها و کریپتو — به‌روزرسانی روزانه از رلهٔ داخلی.",
    url: "https://arashsafari.ir/market",
    type: "website",
  },
};

export default async function MarketPage() {
  const supabase = await createClient();
  const [{ data: { user } }, market, ir] = await Promise.all([
    supabase.auth.getUser(),
    getMarketData(),
    getIrMarket(),
  ]);

  let watchlist: string[] = [];
  let alerts: {
    id: string;
    symbol: string;
    market: string;
    condition: string;
    target_price: number;
    active: boolean;
  }[] = [];
  let telegramLinked = false;

  if (user) {
    const [wlRes, alRes, tgRes] = await Promise.all([
      supabase.from("watchlist_items").select("symbol").eq("market", "crypto"),
      supabase
        .from("price_alerts")
        .select("id, symbol, market, condition, target_price, active")
        .order("created_at", { ascending: false }),
      supabase.from("telegram_links").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    watchlist = (wlRes.data ?? []).map((w) => w.symbol);
    alerts = (alRes.data ?? []) as typeof alerts;
    telegramLinked = Boolean(tgRes.data);
  }

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 space-y-8">
          {/* داشبورد بصری «امروز بازار» — بازطراحی رصد بازار (هر بخش یک سؤال، جواب با نمودار) */}
          <TodayDashboard ir={ir} />

          {/* چشم‌انداز آماری و رژیم تاریخی (T3) — روایت تکمیلی زیر داشبورد */}
          <TodayMarket stocks={ir?.stocks ?? []} fetchedAt={ir?.fetchedAt ?? null} />

          {/* طلا و ارز */}
          {ir && (ir.gold.length > 0 || ir.currency.length > 0) && (
            <GoldCurrencyBoard
              gold={ir.gold}
              currency={ir.currency}
              fetchedAt={ir.fetchedAt}
            />
          )}

          {/* روند طلا و دلار — منبع: ir_market_history (تصمیم T8) */}
          <GoldUsdTrend />

          {/* روند شاخص کل/هم‌وزن — M5 رصد بازار (تا داده جمع نشود رندر نمی‌شود) */}
          <IndexTrend />

          {/* صندوق‌ها (خلاصه) */}
          {ir && ir.funds.length > 0 && (
            <FundsBoard funds={ir.funds} />
          )}
        </div>

        {/* کریپتو + واچ‌لیست + هشدار */}
        <MarketClient
          crypto={market.crypto}
          sourceOk={market.ok}
          isLoggedIn={Boolean(user)}
          telegramLinked={telegramLinked}
          initialWatchlist={watchlist}
          initialAlerts={alerts}
        />
      </main>
      <Footer />
    </>
  );
}
