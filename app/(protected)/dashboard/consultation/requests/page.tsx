import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ReadError from "@/components/dashboard/ReadError";
import TicketRequestWorkspace from "@/components/consultation/TicketRequestWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";
import { cashFlowUuid } from "@/lib/portfolio/cashFlowApiContract";
export const dynamic = "force-dynamic";
export const metadata = { title: "درخواست‌های مستقل مشاوره" };
export default async function TicketMemberPage({ searchParams }: { searchParams: Promise<{ relation?: string; request?: string }> }) {
  const selected = await searchParams;
  let actorId: string | null = null, unavailable = false;
  try { const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10_000); unavailable = authSessionFailure(auth.error) === 503; actorId = auth.error ? null : auth.data.user?.id ?? null; } catch { unavailable = true; }
  if (!unavailable && !actorId) redirect("/login?next=/dashboard/consultation/requests");
  const invalid = selected.relation !== undefined && !cashFlowUuid(selected.relation) || selected.request !== undefined && (!cashFlowUuid(selected.request) || !selected.relation);
  return <><Navbar/><main id="main-content" dir="rtl" className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
    <header className="space-y-2"><h1 className="font-display text-2xl font-bold">درخواست مستقل و پیگیری مشاوره</h1><p className="text-sm leading-7">درخواست را با رضایت و حق خدمت یکی نگیرید. حق واقعی خدمت هنوز متصل نیست؛ ثبت فقط در محیط تستِ صریح و مجاز قابل تمرین است.</p></header>
    <nav aria-label="مسیرهای عضو" className="flex flex-wrap gap-3"><Link className="btn btn-outline" href="/dashboard">خانهٔ عضو</Link><Link className="btn btn-outline" href="/dashboard/consultation">رضایت و جمع‌بندی‌های مشاوره</Link></nav>
    {unavailable || !actorId ? <ReadError label="نشست درخواست مشاوره" code="TICKET_AUTH"/> : invalid ? <ReadError label="شناسهٔ رابطه یا درخواست" code="TICKET_SELECTION"/> : <TicketRequestWorkspace key={`${actorId}:${selected.relation ?? ""}:${selected.request ?? ""}`} expectedActorId={actorId} initialRelationshipId={selected.relation} initialRequestId={selected.request}/>}
  </main><Footer/></>;
}
