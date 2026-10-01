import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadConsultation } from "@/lib/consultation/service";
import ConsultationWorkbench from "@/components/consultation/ConsultationWorkbench";
import ReadError from "@/components/dashboard/ReadError";
export const metadata = {title:"پروندهٔ مشاوره"};
export const dynamic = "force-dynamic";
export default async function ConsultationPage({searchParams}:{searchParams:Promise<{relation?:string}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/consultation");
  const {relation}=await searchParams;
  let data;
  try {data=await loadConsultation(relation);} catch {data=null;}
  return <main className="mx-auto max-w-6xl p-5 space-y-5">
    <Link href="/dashboard" className="btn btn-outline">بازگشت به داشبورد</Link>
    <h1 className="font-display text-2xl font-bold">پروندهٔ مشاوره و اقدام بعدی</h1>
    <p className="text-sm leading-7">این پرونده سابقهٔ جلسه، هدف و اقدام‌های توافق‌شده را نگه می‌دارد. دسترسی مشاور را خودتان می‌دهید و هر زمان می‌توانید لغو کنید.</p>
    {data ? <ConsultationWorkbench key={data.selected?.id ?? "empty"} data={data} /> : <ReadError label="پروندهٔ مشاوره" code="CONSULTATION_READ" />}
  </main>;
}
