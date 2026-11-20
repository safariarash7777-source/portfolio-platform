import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";
import PersonalFinance, { type MemberFinanceSummary } from "@/components/dashboard/PersonalFinance";
import AccessStatusCard from "@/components/dashboard/AccessStatusCard";
import { getAccess } from "@/lib/access";
import { loadPortfolioSnapshot, loadVersionDebts, loadPriceRows } from "@/lib/portfolio/service";
import { readDossierHistory, DOSSIER_VERSION_LIMIT } from "@/lib/portfolio/dossier-history";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import { buildRecordedPayments, paymentReferenceDay } from "@/lib/portfolio/paymentSchedule";
import { loadInvestmentScope } from "@/lib/portfolio/scopeService";

export const metadata = {
  title: "فضای مالی شخصی",
  description: "حساب شخصی شما در پلتفرم آرش صفری؛ دارایی، بدهی و محدودهٔ سبد سرمایه‌گذاری.",
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
    portfolioVersionsRes, memberSnapshot,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("risk_assessments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
      .maybeSingle(),
    supabase
      .from("payments")
      .select("status, invite_link, ref_id")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
      .maybeSingle(),
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
    // Reuse the same owner-filtered reader as the versioned holdings workspace.
    loadPortfolioSnapshot(undefined, async () => supabase),
  ]);

  const selectedVersions = memberSnapshot.ready && memberSnapshot.holdings
    ? memberSnapshot.history.slice(0, DOSSIER_VERSION_LIMIT).map(v => ({ id: v.id, version: v.version, date: v.createdAt })) : [];
  const [memberDebts, memberScope, prices, dossierHistory] = await Promise.all([
    memberSnapshot.ready && memberSnapshot.holdings
      ? loadVersionDebts(memberSnapshot.holdings.id).catch(() => ({ ready: false, debts: [] }))
      : Promise.resolve({ ready: false, debts: [] }),
    memberSnapshot.ready && memberSnapshot.holdings
      ? loadInvestmentScope(memberSnapshot.holdings)
      : Promise.resolve({ status: "error" as const, review: null }),
    loadPriceRows(memberSnapshot.holdings?.positions ?? [], async () => supabase),
    readDossierHistory(supabase, user.id, selectedVersions, memberSnapshot.holdings?.positions ?? []),
  ]);
  const assetsState = !memberSnapshot.ready ? "error" : memberSnapshot.holdings ? "ready" : "empty";
  const now = new Date();
  const sheet = buildBalanceSheet({
    positions: memberSnapshot.holdings?.positions ?? [], debts: memberDebts.debts,
    priceRows: prices.data ?? [], now, recorded: !!memberSnapshot.holdings,
    assetsReady: memberSnapshot.ready, debtsReady: memberDebts.ready, pricesFailed: prices.status === "error",
  });
  const payments = buildRecordedPayments({
    debts: memberDebts.debts, ready: memberDebts.ready, recorded: !!memberSnapshot.holdings,
    referenceDay: paymentReferenceDay(now),
  });
  const memberFinance: MemberFinanceSummary = {
    // No saved values or note bodies from other contexts. Empty lists don't establish
    // zero wealth or zero debt. A subtotal with a gap is never called net worth.
    picture: {
      assets: sheet.valuation.subtotal,
      debts: memberDebts.debts.length ? sheet.debtValue : null,
      net: !sheet.partial && sheet.valuation.fullCoverage && memberDebts.debts.length ? sheet.netWorth : null,
      estimated: sheet.estimated,
      stale: sheet.valuation.gaps.some(gap => gap.reason === "stale_price"),
      pricesFailed: prices.status === "error",
      positions: sheet.valuation.positions.map(({ position, price, value, weightPct }) => ({
        id: position.positionKey, name: position.title || position.manualLabel || position.symbol || "قلم بدون عنوان",
        amount: value, source: price?.source ?? null, asOf: price?.asOf ?? null,
        weight: weightPct, estimated: price?.status === "estimated",
      })),
      // Show the first dated obligation in the existing sorted schedule, without
      // treating an elapsed date as proof of delinquency, or absence as payment.
      due: payments.items.find(item => item.dueOn !== null) ?? null,
      incompleteSchedule: payments.incompleteCount > 0,
      history: dossierHistory,
    },
    assetsState,
    version: memberSnapshot.holdings?.version ?? null,
    recordedAt: memberSnapshot.holdings ? memberSnapshot.history[0]?.createdAt ?? null : null,
    assetCount: memberSnapshot.ready && memberSnapshot.holdings ? memberSnapshot.holdings.positions.length : null,
    debtsState: assetsState === "empty" ? "empty" : !memberDebts.ready ? "error" : "ready",
    debtCount: assetsState === "ready" && memberDebts.ready ? memberDebts.debts.length : null,
    scopeState: assetsState === "empty" ? "empty" : memberScope.status === "error" ? "error" : memberScope.review ? "confirmed" : "unconfirmed",
    targetState: memberSnapshot.targetState ?? "error",
  };

  // A failed read is not a new member or an empty risk history.
  if (profileRes.error || !profileRes.data || assessmentRes.error || scoreHistoryRes.error) {
    return (
      <>
        <Navbar />
        <main id="main-content" dir="rtl" className="mx-auto w-full max-w-6xl py-6 space-y-6">
          <div role="alert" className="card p-6 space-y-4">
            <p>اطلاعات پروفایل یا سابقهٔ ارزیابی ریسک دریافت نشد. بخش ارزیابی ریسک تا بازیابی اطلاعات نمایش داده نمی‌شود؛ دفتر مالی شما در ادامه در دسترس است.</p>
            <a href="/dashboard" className="btn btn-outline">تلاش دوباره</a>
          </div>
          <PersonalFinance summary={memberFinance} />
        </main>
        <Footer />
      </>
    );
  }

  const access = await getAccess();

  const seenSet = new Set((seenRes.data ?? []).map((d) => d.announcement_id));
  const announcements = (announcementsRes.data ?? []).map((a) => ({
    ...a,
    seen: seenSet.has(a.id),
  }));

  return (
    <>
      <Navbar />
      <main id="main-content" style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <DashboardClient
          userId={user.id}
          userEmail={user.email ?? ""}
          userName={profileRes.data?.full_name ?? "سرمایه‌گذار"}
          userRole={profileRes.data?.role ?? "user"}
          memberFinance={memberFinance}
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
          financialReadErrors={{
            portfolio: Boolean(portfolioRes.error),
            holdings: Boolean(holdingsRes.error),
            snapshots: Boolean(snapshotsRes.error),
            transactions: Boolean(txRes.error),
            payment: Boolean(paymentRes.error),
            portfolioVersions: Boolean(portfolioVersionsRes.error),
          }}
        />
        <div className="mx-auto w-full max-w-6xl px-5 pb-6 space-y-4">
          <AccessStatusCard access={access} />
        </div>
        <div className="mx-auto w-full max-w-6xl px-5 pb-8">
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
      </main>
      <Footer />
    </>
  );
}
