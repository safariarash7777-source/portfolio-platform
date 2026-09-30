import Link from "next/link";
import { getIrMarket } from "@/lib/market-ir";
import { formatTehranClock, formatCount } from "@/lib/format";
const tehranDay = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric" });
export default async function MarketEntry() {
  const market = await getIrMarket().catch(() => null);
  const hasData = Boolean(market?.stocks.length || market?.funds.length || market?.gold.length || market?.currency.length);
  const receivedAt = typeof market?.fetchedAt === "number" && Number.isFinite(market.fetchedAt) ? market.fetchedAt : null;
  return <section id="market" className="public-section" aria-labelledby="market-entry-title"><div className="public-container">
    <div className="public-section-heading"><div><p className="public-eyebrow">داده برای مطالعهٔ بازار</p><h2 id="market-entry-title">بازار، صندوق‌ها و نمادها</h2></div><Link href="/market" className="btn btn-outline">مشاهدهٔ وضعیت بازار</Link></div>
    <div className="public-market-summary"><div><strong>{hasData ? "نمای بازار در دسترس است" : "دادهٔ بازار اکنون در دسترس نیست"}</strong><p>{hasData ? "منبع دادهٔ ایران: BrsApi از مسیر ذخیره یا رلهٔ سایت. زمان دریافت، تضمین زمان معاملهٔ همهٔ ردیف‌ها نیست." : "ناموجودبودن داده به معنی صفر بودن قیمت یا تعطیلی بازار نیست. وضعیت داده را در صفحهٔ بازار بررسی کنید."}</p></div>{hasData && market ? <dl><div><dt>سهام دارای ردیف</dt><dd>{formatCount(market.stocks.length)}</dd></div><div><dt>صندوق دارای ردیف</dt><dd>{formatCount(market.funds.length)}</dd></div><div><dt>دریافت بسته · تهران</dt><dd>{receivedAt ? `${tehranDay.format(new Date(receivedAt))} · ${formatTehranClock(receivedAt)}` : "نامشخص"}</dd></div></dl> : null}</div>
    <div className="public-two-grid"><Link href="/market/funds" className="public-entry-card"><h3>مشاهدهٔ صندوق‌ها</h3><p>قیمت، NAV و اطلاعات موجود هر صندوق را با حدود داده بررسی کنید.</p><span>ورود به نمای صندوق‌ها ←</span></Link><Link href="/market/stocks" className="public-entry-card"><h3>جستجوی نماد</h3><p>از تابلوی سهام، نماد موردنظر را انتخاب و جزئیات آن را مطالعه کنید.</p><span>ورود به تابلوی سهام ←</span></Link></div>
  </div></section>;
}
