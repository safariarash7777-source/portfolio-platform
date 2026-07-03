import { createClient } from "@/lib/supabase/server";
import AdminClient from "../AdminClient";

export const metadata = {
  title: "مدیریت پلتفرم",
};

type Tab = "users" | "portfolio" | "waitlist" | "payments";
function normalizeTab(t?: string): Tab {
  return t === "portfolio" || t === "waitlist" || t === "payments" ? t : "users";
}

export default async function AdminManagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();

  const [profilesRes, assessmentsRes, portfoliosRes, waitlistRes, paymentsRes, revalidationsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("risk_assessments")
        .select("user_id, risk_category, total_score, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("portfolios").select("user_id"),
      supabase
        .from("waitlist")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("id, user_id, amount, ref_id, status, created_at, verified_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("risk_revalidations")
        .select("user_id, expired_at")
        .order("expired_at", { ascending: false }),
    ]);

  const latestAssessments = new Map<
    string,
    { category: string; score: number | null; date: string }
  >();
  for (const a of assessmentsRes.data ?? []) {
    if (!latestAssessments.has(a.user_id)) {
      latestAssessments.set(a.user_id, {
        category: a.risk_category,
        score: a.total_score ?? null,
        date: a.created_at,
      });
    }
  }

  const portfolioUserIds = new Set(
    (portfoliosRes.data ?? []).map((p) => p.user_id)
  );

  // آخرین رویدادِ انقضای دستی برای هر کاربر
  const latestRevalidation = new Map<string, string>();
  for (const r of revalidationsRes.data ?? []) {
    if (!latestRevalidation.has(r.user_id)) latestRevalidation.set(r.user_id, r.expired_at);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const isRiskExpired = (lastDate: string | null, userId: string): boolean => {
    if (!lastDate) return false;
    const last = new Date(lastDate).getTime();
    const forced = latestRevalidation.get(userId);
    const forcedExpired = forced != null && new Date(forced).getTime() > last && new Date(forced).getTime() <= now;
    return forcedExpired || now > last + 180 * DAY_MS;
  };

  const users = (profilesRes.data ?? []).map((p) => {
    const assessment = latestAssessments.get(p.id) ?? null;
    return {
      ...p,
      risk_category: assessment?.category ?? null,
      risk_score: assessment?.score ?? null,
      risk_date: assessment?.date ?? null,
      has_portfolio: portfolioUserIds.has(p.id),
      risk_expired: isRiskExpired(assessment?.date ?? null, p.id),
    };
  });

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, { name: p.full_name ?? null, email: p.email ?? null }])
  );
  const payments = (paymentsRes.data ?? []).map((p) => {
    const prof = profileById.get(p.user_id);
    return {
      id: p.id,
      user_name: prof?.name ?? null,
      user_email: prof?.email ?? null,
      amount: p.amount,
      ref_id: p.ref_id,
      status: p.status,
      created_at: p.created_at,
      verified_at: p.verified_at,
    };
  });

  return (
    <AdminClient
      users={users}
      waitlist={waitlistRes.data ?? []}
      payments={payments}
      initialTab={normalizeTab(tab)}
    />
  );
}
