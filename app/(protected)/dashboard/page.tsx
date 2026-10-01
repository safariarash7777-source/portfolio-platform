import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HoldingsSummary from "@/components/portfolio/HoldingsSummary";
import { loadPortfolioSnapshot, loadPriceRows, loadVersionDebts } from "@/lib/portfolio/service";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import { valuePositions } from "@/lib/portfolio/valuation";
import type { Assessment, Portfolio } from "./DashboardClient";
import type { PaidPayment } from "@/components/dashboard/AccessCards";
import DashboardClient from "./DashboardClient";
import AccessStatusCard from "@/components/dashboard/AccessStatusCard";
import { readState, safeReads } from "@/lib/read-state";
import ReadError from "@/components/dashboard/ReadError";
import { getAccess } from "@/lib/access";

export const metadata = {
  title: "داشبورد",
  description: "داشبورد کاربری برای ارزیابی ریسک و مدیریت سبد سرمایه‌گذاری.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    profileRes, assessmentRes, portfolioRes, holdingsRes, snapshotsRes, txRes,
    telegramRes, paymentRes, scoreHistoryRes, revalidationRes, announcementsRes, seenRes,
    portfolioVersionsRes,
  ] = await safeReads([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<{ full_name: string | null; role: string | null }>(),
    supabase
      .from("risk_assessments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Assessment>(),
    supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Portfolio>(),
    supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("portfolio_snapshots")
      .select("as_of, value")
      .eq("user_id", user.id)
      .order("as_of", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(5),
    supabase
      .from("telegram_links")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string }>(),
    supabase
      .from("payments")
      .select("status, invite_link, ref_id")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaidPayment>(),
    supabase
      .from("risk_assessments")
      .select("total_score, risk_category, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("risk_revalidations")
      .select("expired_at")
      .eq("user_id", user.id)
      .order("expired_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ expired_at: string }>(),
    supabase
      .from("announcements")
      .select("id, title, body_md, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(20),
    supabase
      .from("announcement_deliveries")
      .select("announcement_id")
      .eq("user_id", user.id)
      .eq("channel", "in_app")
      .eq("status", "seen"),
    // All portfolio versions for history display
    supabase
      .from("portfolios")
      .select("id, allocations, notes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const access = await getAccess();
  const holdingSnapshot = await loadPortfolioSnapshot();
  const [prices, debts] = await Promise.all([loadPriceRows(holdingSnapshot.holdings?.positions ?? []), loadVersionDebts(holdingSnapshot.holdings?.id ?? null)]);
  const sheet = buildBalanceSheet({ positions: holdingSnapshot.holdings?.positions ?? [], debts: debts.debts, priceRows: prices.data ?? [], now: new Date(), recorded: !!holdingSnapshot.holdings, assetsReady: holdingSnapshot.ready, debtsReady: holdingSnapshot.ready && debts.ready, pricesFailed: prices.status === "error" });
  const sectionEntries = {
    profile: profileRes, assessment: assessmentRes, portfolio: portfolioRes, holdings: holdingsRes,
    snapshots: snapshotsRes, transactions: txRes, telegram: telegramRes, payment: paymentRes,
    scoreHistory: scoreHistoryRes, revalidation: revalidationRes, announcements: announcementsRes,
    seen: seenRes, portfolioVersions: portfolioVersionsRes,
  };
  const sections = Object.fromEntries(Object.entries(sectionEntries).map(([key, result]) =>
    [key, (() => { const state = readState<unknown>(result, `DASHBOARD_${key.toUpperCase()}`); return { status: state.status, ...(state.status === "error" ? { code: state.code } : {}) }; })()]));

  const seenSet = new Set((seenRes.data ?? []).map((d) => d.announcement_id));
  const announcements = (announcementsRes.data ?? []).map((a) => ({
    ...a,
    seen: seenSet.has(a.id),
  }));

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-6 space-y-4">
          {access.standing === null ? <ReadError label="وضعیت دسترسی" code="DASHBOARD_ACCESS" /> : <AccessStatusCard access={access} />}
            <BalanceSheetSummary sheet={sheet} version={holdingSnapshot.holdings?.version ?? null} />
          {holdingSnapshot.ready ? <HoldingsSummary valuation={valuePositions(holdingSnapshot.holdings?.positions ?? [], prices.data ?? [], new Date())} version={holdingSnapshot.holdings?.version ?? null} pricesFailed={prices.status === "error"} /> : <ReadError label="دارایی‌های نسخه‌دار" code="PORTFOLIO_READ" />}
          <Link href="/dashboard/consultation" className="btn btn-outline min-h-11">پروندهٔ مشاوره و اقدام بعدی</Link>
          {/* بستنِ حلقه: از داشبورد به میزِ بازار. طرفِ دیگرِ همین مسیر در
              `/market` و `/symbol/[symbol]` است. */}
          <Link
            href="/market"
            className="card px-4 py-3.5 flex items-center justify-between gap-3 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
                میزِ بازار
              </span>
              <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
                وضعیتِ امروز، و مواردی که ارزشِ نگاهِ دوباره دارند.
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold whitespace-nowrap"
              style={{ color: "var(--navy)" }}
            >
              رفتن به میز
              <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
            </span>
          </Link>
        </div>
        <DashboardClient
          sections={sections}
          userId={user.id}
          userEmail={user.email ?? ""}
          userName={profileRes.data?.full_name ?? "سرمایه‌گذار"}
          userRole={profileRes.error ? "user" : profileRes.data?.role ?? "user"}
          assessment={assessmentRes.data ?? null}
          portfolio={portfolioRes.data ?? null}
          holdings={holdingsRes.data ?? []}
          snapshots={snapshotsRes.data ?? []}
          transactions={txRes.data ?? []}
          telegramLinked={Boolean(telegramRes.data)}
          payment={paymentRes.data ?? null}
          scoreHistory={scoreHistoryRes.data ?? []}
          revalidationExpiredAt={revalidationRes.data?.expired_at ?? null}
          announcements={announcements}
          portfolioVersions={portfolioVersionsRes.data ?? []}
        />
      </main>
      <Footer />
    </>
  );
}
