import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MemberHome from "@/components/member/MemberHome";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import { loadPortfolioSnapshot, loadPriceRows, loadVersionDebts } from "@/lib/portfolio/service";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/member/home";
import { accountEntryHref } from "@/components/account/returnPath";

export const dynamic = "force-dynamic";
export const metadata = { title: "خانهٔ من", description: "دوره، وبینار، منابع مجاز و وضعیت مالی ثبت‌شدهٔ شما." };
export default async function MemberHomePage({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const { cohort } = await searchParams;
  if (cohort && !isUuid(cohort)) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(accountEntryHref("/login", cohort ? `/dashboard?cohort=${cohort}` : "/dashboard"));
  const snapshot = await loadPortfolioSnapshot();
  const [prices, debts] = await Promise.all([loadPriceRows(snapshot.holdings?.positions ?? []), loadVersionDebts(snapshot.holdings?.id ?? null)]);
  const now = new Date();
  const sheet = buildBalanceSheet({ positions: snapshot.holdings?.positions ?? [], debts: debts.debts, priceRows: prices.data ?? [], now, recorded: !!snapshot.holdings, assetsReady: snapshot.ready, debtsReady: snapshot.ready && debts.ready, pricesFailed: prices.status === "error" });
  return <><Navbar /><main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8" dir="rtl">
    <header className="space-y-3"><h1 className="font-display text-3xl font-bold">خانهٔ من</h1><p>دورهٔ خودتان، برنامهٔ وبینار و منابع مجاز را اینجا دنبال کنید. اطلاعات مالی و پروندهٔ خصوصی شما مسیر جدا دارند.</p></header>
    <MemberHome userId={user.id} selectedCohortId={cohort} now={now.toISOString()} />
    <section className="space-y-4" aria-labelledby="member-personal-title"><h2 id="member-personal-title" className="font-display text-xl font-bold">وضعیت مالی و سوابق شخصی من</h2><p className="text-sm">این بخش به حساب شما تعلق دارد؛ عضویت گروهی جای مشاورهٔ اختصاصی را نمی‌گیرد و پایان دوره، سوابق شما را حذف نمی‌کند.</p>
      <BalanceSheetSummary sheet={sheet} version={snapshot.holdings?.version ?? null} />
      <nav className="flex flex-wrap gap-3" aria-label="مسیرهای شخصی"><Link href="/dashboard/holdings" className="btn btn-outline min-h-12">ثبت و اصلاح دارایی و بدهی</Link><Link href="/dashboard/consultation" className="btn btn-outline min-h-12">پروندهٔ مشاوره و اقدام‌های توافق‌شده</Link><Link href="/consultation" className="btn btn-outline min-h-12">درخواست وقت مشاورهٔ اختصاصی</Link><Link href="/dashboard/portfolio" className="btn btn-outline min-h-12">ارزیابی ریسک و مدیریت سبد من</Link></nav>
    </section>
  </main><Footer /></>;
}
