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
import MarketDesk from "@/components/market/MarketDesk";
import AccountBridge from "@/components/account/AccountBridge";
import { getMarketData } from "@/lib/market";
import { getIrMarket } from "@/lib/market-ir";
import { getAccess } from "@/lib/access";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "رصد بازار",
  description:
    "قیمت روزانهٔ بازار کریپتو، طلا، ارز، صندوق‌ها و سهام — داده‌های snapshot از منابع رسمی.",
  path: "/market",
});

export default async function MarketPage() {
  const supabase = await createClient();
  const [{ data: { user } }, market, ir, access] = await Promise.all([
    supabase.auth.getUser(),
    getMarketData(),
    getIrMarket(),
    getAccess(),
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
        <div className="mx-auto w-full max-w-7xl px-4 pt-6 space-y-10 sm:px-5 md:pt-8">
          <TodayDashboard ir={ir} />

          {/* میزِ بازار — «امروز چه چیزی ارزشِ نگاهِ دوباره دارد».
              منطق در `lib/core/marketDesk.ts`؛ اینجا فقط نما. */}
          <MarketDesk ir={ir} />

          {/* چشم‌انداز آماری و رژیم تاریخی (T3) — روایت تکمیلی زیر داشبورد */}
          <section id="market-detail" className="scroll-mt-24 space-y-3">
            <div>
              <p className="eyebrow">جزئیات بازار سهام</p>
              <h2 className="mt-1 font-display text-2xl font-bold" style={{ color: "var(--heading)" }}>پراکندگی، جریان و روند</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: "var(--text-2)" }}>
                برای عبور از تصویر کلی به شواهد: گسترهٔ مشارکت نمادها، جریان حقیقی و روند ثبت‌شده را کنار هم ببینید.
              </p>
            </div>
            <TodayMarket stocks={ir?.stocks ?? []} fetchedAt={ir?.fetchedAt ?? null} />
          </section>

          {/* طلا و ارز */}
          <section id="gold-currency" className="scroll-mt-24 space-y-4">
            {ir && (ir.gold.length > 0 || ir.currency.length > 0) ? (
              <GoldCurrencyBoard
                gold={ir.gold}
                currency={ir.currency}
                fetchedAt={ir.fetchedAt}
              />
            ) : null}

            {/* روند طلا و دلار — منبع: ir_market_history (تصمیم T8) */}
            <GoldUsdTrend />
          </section>

          {/* روند شاخص کل/هم‌وزن — M5 رصد بازار (تا داده جمع نشود رندر نمی‌شود) */}
          <IndexTrend />

          {/* صندوق‌ها (خلاصه) */}
          <section id="funds" className="scroll-mt-24">
            {ir && ir.funds.length > 0 ? <FundsBoard funds={ir.funds} /> : null}
          </section>

          {/* مسیرِ رفت‌وبرگشت به حسابِ کاربر — فقط لینک، بدونِ هیچ تغییری در گیتِ دسترسی. */}
          <AccountBridge access={access} />
        </div>

        {/* کریپتو + واچ‌لیست + هشدار */}
        <section id="global-markets" className="scroll-mt-24">
          <MarketClient
            crypto={market.crypto}
            sourceOk={market.ok}
            isLoggedIn={Boolean(user)}
            telegramLinked={telegramLinked}
            initialWatchlist={watchlist}
            initialAlerts={alerts}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
