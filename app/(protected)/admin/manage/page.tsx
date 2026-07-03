import { createClient } from "@/lib/supabase/server";
import AdminClient from "../AdminClient";

export const metadata = {
  title: "مدیریت پلتفرم",
};

type Tab = "users" | "portfolio" | "waitlist";
function normalizeTab(t?: string): Tab {
  return t === "portfolio" || t === "waitlist" ? t : "users";
}

export default async function AdminManagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();

  const [profilesRes, assessmentsRes, portfoliosRes, waitlistRes] =
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

  const users = (profilesRes.data ?? []).map((p) => {
    const assessment = latestAssessments.get(p.id) ?? null;
    return {
      ...p,
      risk_category: assessment?.category ?? null,
      risk_score: assessment?.score ?? null,
      risk_date: assessment?.date ?? null,
      has_portfolio: portfolioUserIds.has(p.id),
    };
  });

  return (
    <AdminClient
      users={users}
      waitlist={waitlistRes.data ?? []}
      initialTab={normalizeTab(tab)}
    />
  );
}
