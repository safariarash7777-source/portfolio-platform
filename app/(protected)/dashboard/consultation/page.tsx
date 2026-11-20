import "@/components/consultation/consultation.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ReadError from "@/components/dashboard/ReadError";
import ConsultationWorkspace from "@/components/consultation/ConsultationWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروندهٔ مشاوره و پیگیری" };
export default async function ConsultationPage({ searchParams }: { searchParams: Promise<{ relation?: string }> }) {
  const selected = await searchParams;
  let actorId: string | null = null, unavailable = false;
  try { const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000); unavailable = authSessionFailure(auth.error) === 503; actorId = auth.error ? null : auth.data.user?.id ?? null; } catch { unavailable = true; }
  if (!unavailable && !actorId) redirect("/login?next=/dashboard/consultation");
  return <><Navbar /><main id="main-content" dir="rtl" className="consult-folio mx-auto w-full max-w-[1176px] space-y-5 px-4 py-6 sm:px-[26px] sm:py-8">
    <header className="consult-heading"><span className="consult-kicker">فضای مالی شخصی · آرش صفری</span><h1>پروندهٔ مشاوره و پیگیری</h1><p className="text-sm leading-7">جمع‌بندی مشاور، قدم بعدی و زمان بازبینی را در یک‌جا ببینید.</p></header>
    <nav aria-label="مسیرهای مالی عضو" className="consult-links"><Link href="/dashboard">داشبورد</Link><Link href="/dashboard/cashflow">جریان نقد و بودجه</Link><Link href="/dashboard/goals">هدف‌ها</Link></nav>
    {unavailable || !actorId ? <ReadError label="نشست پروندهٔ مشاوره" code="CONSULTATION_AUTH" /> : <ConsultationWorkspace key={`${actorId}:${selected.relation ?? ""}`} expectedActorId={actorId} initialRelationshipId={selected.relation} />}
  </main><Footer /></>;
}
