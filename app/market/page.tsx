/**
 * نمای کلانِ بازار — `/market`.
 *
 * ── چه چیزی عوض شد و چرا ─────────────────────────────────────────────────
 * نسخهٔ قبل هشت بخشِ کامل را پشتِ سرِ هم می‌چید (داشبورد، میزِ بازار، پراکندگی،
 * طلا و ارز، دو نمودارِ روند، صندوق‌ها، کریپتو) و در دسکتاپ به حدود ۶۷۵۰ پیکسل
 * می‌رسید؛ میزِ بازار حدودِ ۱۷۰۰ و صندوق‌ها حدودِ ۴۶۰۰ پیکسل پایین بودند و هیچ
 * راهی برای جست‌وجوی مستقیمِ نماد وجود نداشت.
 *
 * ساختارِ تازه چهار ردیف است:
 *   ۱) پوسته — عنوان، زمان، تازگیِ داده، جست‌وجو، ناوبریِ بخش‌ها
 *   ۲) شش سنجهٔ اصلی از `lib/core/marketHeadline.ts`
 *   ۳) نمودارِ منتخب (دوسوم) + نبض و جریانِ پول (یک‌سوم)
 *   ۴) دسترسیِ مستقیم به تابلوها + میزِ بازار (خلاصه و متنوع)
 * و بعد از آن، جزئیاتِ بلند در بخش‌های **بازشونده** — حذف نشده، فقط بسته.
 *
 * ── یک منبع برای هر عدد ──────────────────────────────────────────────────
 * همهٔ داده اینجا یک بار خوانده و یک بار محاسبه می‌شود، بعد به نماها پاس
 * می‌رود. هیچ کامپوننتی دوباره `stocks.reduce(...)` نمی‌زند.
 */
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketClient from "@/components/market/MarketClient";
import GoldCurrencyBoard from "@/components/market/GoldCurrencyBoard";
import TodayMarket from "@/components/market/TodayMarket";
import MarketDesk from "@/components/market/MarketDesk";
import MarketShell from "@/components/market/MarketShell";
import MarketKpiRow from "@/components/market/MarketKpiRow";
import MarketPulsePanel from "@/components/market/MarketPulsePanel";
import MarketDepthDetails from "@/components/market/MarketDepthDetails";
import MarketSectionLinks from "@/components/market/MarketSectionLinks";
import FeaturedTrend from "@/components/market/FeaturedTrend";
import DetailDisclosure from "@/components/market/DetailDisclosure";
import AccountBridge from "@/components/account/AccountBridge";
import { getMarketData } from "@/lib/market";
import { getIrMarket } from "@/lib/market-ir";
import { getAccess } from "@/lib/access";
import { pageMetadata } from "@/lib/metadata";
import { buildSearchIndex } from "@/lib/market-nav";
import { buildMarketHeadline } from "@/lib/core/marketHeadline";
import { computeMarketPulse, computeQueues, computeMoneyFlow, computeTopLists } from "@/lib/core/marketToday";
import { getFlowTrend } from "@/lib/core/breadthTrend";
import { getGoldUsdTrend } from "@/lib/core/trend";
import { getIndexTrend } from "@/lib/core/indexTrend";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "میز بازار",
  description:
    "نمای کلانِ بازار ایران: شاخص، ارزش معاملات، جریانِ پولِ حقیقی، طلا و ارز، صندوق‌ها و سهام — از آخرین اسنپ‌شاتِ منابعِ رسمی.",
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

  const stocks = ir?.stocks ?? [];
  const funds = ir?.funds ?? [];

  // سری‌های تاریخی — همه best-effort؛ نبودشان صفحه را نمی‌شکند.
  const [flowTrend, goldUsdSeries, indexSeries] = await Promise.all([
    getFlowTrend(90).catch(() => []),
    getGoldUsdTrend(180).catch(() => []),
    getIndexTrend(180).catch(() => []),
  ]);

  // ── محاسبهٔ یک‌باره ──────────────────────────────────────────────────────
  const headline = buildMarketHeadline({
    indices: ir?.indices ?? null,
    stocks,
    gold: ir?.gold ?? [],
    currency: ir?.currency ?? [],
  });
  const pulse = computeMarketPulse(stocks);
  const flow = computeMoneyFlow(stocks);
  const queues = computeQueues(stocks, 8);
  const tops = computeTopLists(stocks, 5);
  const searchIndex = buildSearchIndex(stocks, funds);

  const industryCount = new Set(
    stocks.map((s) => (typeof s.industry === "string" ? s.industry.trim() : "")).filter(Boolean),
  ).size;

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <MarketShell
          active="overview"
          title="نمای کلان بازار"
          lead="تصویرِ امروزِ بازارِ ایران از آخرین اسنپ‌شات. همهٔ ارقام مشاهده‌اند، نه پیشنهادِ اقدام."
          fetchedAt={ir?.fetchedAt ?? null}
          boardState={ir?.indices?.state ?? null}
          searchIndex={searchIndex}
          path="/market"
        >
          <div className="space-y-5">
            {/* ── ردیف ۲: سنجه‌های اصلی ─────────────────────────────────── */}
            <MarketKpiRow metrics={headline.metrics} />

            {/* ── ردیف ۳: نمودارِ منتخب + نبض بازار ──────────────────────── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <FeaturedTrend indexSeries={indexSeries} goldUsdSeries={goldUsdSeries} />
              </div>
              <div className="min-w-0">
                <MarketPulsePanel pulse={pulse} flow={flow} universe={headline.universe} />
              </div>
            </div>

            {/* ── ردیف ۴: تابلوها + میزِ بازار ───────────────────────────── */}
            <MarketSectionLinks
              stockCount={stocks.length > 0 ? stocks.length : null}
              fundCount={funds.length > 0 ? funds.length : null}
              industryCount={industryCount > 0 ? industryCount : null}
            />

            {/* میزِ بازار — خلاصه و متنوع؛ فهرستِ کامل داخلِ خودِ بخش باز می‌شود.
                منطق در `lib/core/marketDesk.ts`؛ اینجا فقط نما. */}
            <MarketDesk ir={ir} limit={24} summaryLimit={6} maxPerKind={2} />

            {/* ── طلا و ارز ──────────────────────────────────────────────── */}
            {ir && (ir.gold.length > 0 || ir.currency.length > 0) ? (
              <section id="gold-currency" className="scroll-mt-24">
                <GoldCurrencyBoard gold={ir.gold} currency={ir.currency} fetchedAt={ir.fetchedAt} />
              </section>
            ) : null}

            {/* ── جزئیاتِ بلند — بسته، نه حذف‌شده ────────────────────────── */}
            <div className="space-y-2.5">
              <DetailDisclosure
                id="market-detail"
                title="پراکندگی، جریان و روندِ بازار سهام"
                hint="گسترهٔ مشارکتِ نمادها، جریانِ حقیقی و روندِ ثبت‌شده"
              >
                <TodayMarket stocks={stocks} fetchedAt={ir?.fetchedAt ?? null} />
              </DetailDisclosure>

              <DetailDisclosure
                title="صف‌ها، روندِ پولِ حقیقی و برترین‌های امروز"
                hint="جزئیاتِ تخصصیِ تابلو — دفترِ سفارش، سریِ روزانه و صدرنشین‌ها"
              >
                <MarketDepthDetails
                  queues={queues}
                  tops={tops}
                  flowTrend={flowTrend}
                  hasMarket={pulse.totalTraded > 0}
                />
              </DetailDisclosure>

              {/* کریپتو — دسترسی حفظ می‌شود، ولی محورِ این صفحه بازارِ ایران
                  است، پس وسطِ صفحه H1 دومی نمی‌سازد و بسته شروع می‌شود. */}
              <DetailDisclosure
                id="global-markets"
                title="بازارهای جهانی و کریپتو"
                hint="قیمتِ ارزهای دیجیتال، واچ‌لیست و هشدارِ قیمت"
              >
                <MarketClient
                  crypto={market.crypto}
                  sourceOk={market.ok}
                  isLoggedIn={Boolean(user)}
                  telegramLinked={telegramLinked}
                  initialWatchlist={watchlist}
                  initialAlerts={alerts}
                />
              </DetailDisclosure>
            </div>

            <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
              همهٔ ارقام از آخرین اسنپ‌شاتِ بازار و تاریخچهٔ ثبت‌شدهٔ سامانه محاسبه می‌شوند. این صفحه
              صرفاً اطلاع‌رسانی است و هیچ‌کدام از بخش‌های آن توصیهٔ خرید یا فروش نیست.
            </p>

            {/* مسیرِ رفت‌وبرگشت به حسابِ کاربر — فقط لینک، بدونِ تغییر در گیتِ دسترسی. */}
            <AccountBridge access={access} returnTo="/market" />
          </div>
        </MarketShell>
      </main>
      <Footer />
    </>
  );
}
