import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const supabase = await createClient();

  const [profilesRes, assessmentsRes, portfoliosRes, waitlistRes] =
    await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("risk_assessments").select("user_id, risk_category, created_at").order("created_at", { ascending: false }),
      supabase.from("portfolios").select("user_id"),
      supabase.from("waitlist").select("*").order("created_at", { ascending: false }),
    ]);

  const latestAssessments = new Map<string, string>();
  for (const a of assessmentsRes.data ?? []) {
    if (!latestAssessments.has(a.user_id)) {
      latestAssessments.set(a.user_id, a.risk_category);
    }
  }

  const portfolioUserIds = new Set((portfoliosRes.data ?? []).map((p) => p.user_id));

  const users = (profilesRes.data ?? []).map((p) => ({
    ...p,
    risk_category: latestAssessments.get(p.id) ?? null,
    has_portfolio: portfolioUserIds.has(p.id),
  }));

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <AdminClient users={users} waitlist={waitlistRes.data ?? []} />
      </main>
      <Footer />
    </>
  );
}
