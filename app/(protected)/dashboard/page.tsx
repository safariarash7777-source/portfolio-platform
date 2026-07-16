import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";
import AccessStatusCard from "@/components/dashboard/AccessStatusCard";
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
  ]);

  const access = await getAccess();

  const seenSet = new Set((seenRes.data ?? []).map((d) => d.announcement_id));
  const announcements = (announcementsRes.data ?? []).map((a) => ({
    ...a,
    seen: seenSet.has(a.id),
  }));

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-6">
          <AccessStatusCard access={access} />
        </div>
        <DashboardClient
          userId={user.id}
          userEmail={user.email ?? ""}
          userName={profileRes.data?.full_name ?? "سرمایه‌گذار"}
          userRole={profileRes.data?.role ?? "user"}
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
