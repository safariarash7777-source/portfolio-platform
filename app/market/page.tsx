import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketClient from "@/components/market/MarketClient";
import { getMarketData } from "@/lib/market";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "رصد بازار",
  description: "قیمت لحظه‌ای بازار کریپتو، واچ‌لیست شخصی و هشدار قیمتی.",
};

export default async function MarketPage() {
  const supabase = await createClient();
  const [{ data: { user } }, market] = await Promise.all([
    supabase.auth.getUser(),
    getMarketData(),
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
