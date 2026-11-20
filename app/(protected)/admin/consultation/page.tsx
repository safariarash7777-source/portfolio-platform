import "@/components/consultation/consultation.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReadError from "@/components/dashboard/ReadError";
import ConsultationWorkspace from "@/components/consultation/ConsultationWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";
export const dynamic = "force-dynamic";
export const metadata = { title: "میز پرونده و تأیید مشاوره" };
export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ relation?: string }> }) {
  const selected = await searchParams;
  let actorId: string | null = null, unavailable = false;
  try { const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000); unavailable = authSessionFailure(auth.error) === 503; actorId = auth.error ? null : auth.data.user?.id ?? null; } catch { unavailable = true; }
  if (!unavailable && !actorId) redirect("/login");
  return <div dir="rtl" className="consult-folio min-w-0 space-y-6"><header className="consult-heading"><span className="consult-kicker">میز مشاوره · آرش صفری</span><h1>پرونده، تأیید و پیگیری</h1><p className="text-sm leading-7">پرونده‌ای را انتخاب کنید و نسخه را تا تأیید و انتشار پیگیری کنید.</p></header><Link href="/admin/users" className="btn btn-outline">فهرست کاربران</Link>
    {unavailable || !actorId ? <ReadError label="نشست میز مشاوره" code="CONSULTATION_AUTH" /> : <ConsultationWorkspace advisorDesk key={`${actorId}:${selected.relation ?? ""}`} expectedActorId={actorId} initialRelationshipId={selected.relation} />}
  </div>;
}
