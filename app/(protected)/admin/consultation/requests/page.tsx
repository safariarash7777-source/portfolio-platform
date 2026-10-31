import Link from "next/link";
import { redirect } from "next/navigation";
import ReadError from "@/components/dashboard/ReadError";
import TicketRequestWorkspace from "@/components/consultation/TicketRequestWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";
import { cashFlowUuid } from "@/lib/portfolio/cashFlowApiContract";
export const dynamic = "force-dynamic";
export const metadata = { title: "میز درخواست‌های مستقل مشاوره" };
export default async function TicketAdvisorPage({ searchParams }: { searchParams: Promise<{ relation?: string; request?: string }> }) {
  const selected = await searchParams;
  let actorId: string | null = null, unavailable = false;
  try { const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10_000); unavailable = authSessionFailure(auth.error) === 503; actorId = auth.error ? null : auth.data.user?.id ?? null; } catch { unavailable = true; }
  if (!unavailable && !actorId) redirect("/login");
  const invalid = selected.relation !== undefined && !cashFlowUuid(selected.relation) || selected.request !== undefined && (!cashFlowUuid(selected.request) || !selected.relation);
  return <div dir="rtl" className="min-w-0 space-y-5"><header className="space-y-2"><h1 className="font-display text-2xl font-bold">درخواست‌های مستقل، پاسخ و پیگیری</h1><p className="text-sm leading-7">مدیریت سایت مجوز دیدن پرونده یا پاسخ شخصی نیست. فقط رابطهٔ مجاز و نسخهٔ مشخص خوانده می‌شود؛ حق تجاری خدمت متصل نیست.</p></header>
    <Link className="btn btn-outline" href="/admin/consultation">میز رضایت و تأیید جمع‌بندی</Link>
    {unavailable || !actorId ? <ReadError label="نشست میز درخواست" code="TICKET_AUTH"/> : invalid ? <ReadError label="شناسهٔ رابطه یا درخواست" code="TICKET_SELECTION"/> : <TicketRequestWorkspace key={`${actorId}:${selected.relation ?? ""}:${selected.request ?? ""}`} expectedActorId={actorId} initialRelationshipId={selected.relation} initialRequestId={selected.request}/>}
  </div>;
}
