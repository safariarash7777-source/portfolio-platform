import reviewed from "@/lib/fundamental/reviewed-units-preview.json";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Link from "next/link";
import { monthlyComparisonSymbols } from "@/lib/fundamental/monthly-comparison-link";
import MonthlySalesScreener from "@/components/market/MonthlySalesScreener";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  title: "غربال فروش ماهانه",
  description: "مقایسهٔ فروش هم‌دورهٔ شرکت‌ها با دسترسی به گزارش کدال و نمودار روند فروش.",
  path: "/market/screener",
});

function lastCompletedMonth() {
  const date = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric", month: "numeric", timeZone: "Asia/Tehran",
  }).formatToParts(new Date());
  const year = Number(date.find(part => part.type === "year")?.value);
  const month = Number(date.find(part => part.type === "month")?.value);
  return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
}

export default async function SalesScreenerPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const period = typeof params.period === "string" ? params.period : lastCompletedMonth();
  const minGrowth = typeof params.minGrowth === "string" ? params.minGrowth : "0";
  const outside = params.universe === "reported-outside";
  const compare = monthlyComparisonSymbols(typeof params.compare === "string" ? params.compare : null);
  const symbol = typeof params.symbol === "string" && params.symbol.length <= 64 ? params.symbol.trim() : "";
  return <>
    <Navbar />
    <main dir="rtl" className="mx-auto min-h-screen max-w-7xl space-y-5 px-4 pb-16 pt-8 sm:px-6">
      <Link href="/market/stocks" className="text-sm underline">تابلوی سهام</Link>
      <header>
        <h1 className="font-display text-3xl font-bold">غربال فروش ماهانه</h1>
        <p className="mt-2 text-sm" style={{color:"var(--text-2)"}}>رشد مبلغ فروش هر شرکت در مقایسه با همان ماه سال قبل</p>
      </header>
      {process.env.VERCEL_ENV === "preview" && <aside className="card p-4">
        <h2 className="font-bold">پیش‌نمایش اصلاح واحد گزارش‌های تاریخی</h2>
        <p>واحد فروش {reviewed.length.toLocaleString("fa-IR")} گزارش زیر با سند رسمی سنجیده شده است. نتیجهٔ جدول و مقایسه در این نسخه، اثر این اصلاح را پیش از ثبت در دیتابیس اصلی نشان می‌دهد.</p>
        <details className="mt-2"><summary>شواهد و شمارهٔ پیگیری گزارش‌ها</summary>
          <ul className="space-y-2">{reviewed.map(p => <li key={p.reportId}>
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{p.symbol} · سند کدال</a>
            {" · "}{p.periodEnd} · {p.amount.toLocaleString("fa-IR")} {p.unit} · پیگیری {p.trace}
            <small className="block" dir="ltr">SHA-256 {p.hash}</small>
          </li>)}</ul>
        </details>
      </aside>}
      <MonthlySalesScreener key={[period,minGrowth,symbol,outside,compare.join(",")].join(":")} compare={compare} outside={outside} period={period} minGrowth={minGrowth} symbol={symbol} />
    </main>
    <Footer />
  </>;
}
