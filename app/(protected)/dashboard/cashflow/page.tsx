import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ReadError from "@/components/dashboard/ReadError";
import CashFlowWorkspace from "@/components/portfolio/cashflow/CashFlowWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";

export const dynamic = "force-dynamic";
export const metadata = { title: "جریان نقد شخصی", description: "برنامه و واقعیت جریان نقد در حساب‌های انتخاب‌شده و دورهٔ ثبت‌شدهٔ شما." };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ startOn?: string; endOn?: string; version?: string }> }) {
  const selected = await searchParams;
  let ownerId: string | null = null, unavailable = false;
  try {
    const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000);
    unavailable = authSessionFailure(auth.error) === 503;
    ownerId = auth.error ? null : auth.data.user?.id ?? null;
  } catch { unavailable = true; }
  if (!unavailable && !ownerId) redirect("/login");
  return <><Navbar /><main id="main-content" dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8">
    <header className="arash-workspace-heading"><ArrowRightLeft size={34} strokeWidth={1.5} aria-hidden="true" /><h1 className="font-display">جریان نقد شخصی</h1></header>
    <nav aria-label="مسیرهای مالی عضو" className="member-jumps"><Link href="/dashboard" className="btn btn-outline">داشبورد</Link><Link href="/dashboard/holdings" className="btn btn-outline">دارایی و بدهی</Link><Link href="/dashboard/goals" className="btn btn-outline">هدف‌های مالی</Link><a href="#period-budget" className="btn btn-outline">بودجهٔ دوره</a></nav>
    <p className="text-sm leading-7">این دفتر مستقل از دارایی‌ها و اقساط است؛ قسط یا ماندهٔ بدهی خودکار پرداخت واقعی نمی‌شود. حساب نقدیِ اینجا یک عنوان ثبت‌شده توسط شماست، نه اتصال یا تأیید بانک.</p>
    {unavailable || !ownerId ? <ReadError label="نشستِ جریان نقد؛ ورود شما هنوز بررسی نشده است" code="CASHFLOW_AUTH" />
      : <CashFlowWorkspace key={`${ownerId}:${selected.startOn ?? ""}:${selected.endOn ?? ""}:${selected.version ?? ""}`} expectedOwnerId={ownerId} initialPeriod={{ startOn: selected.startOn ?? "", endOn: selected.endOn ?? "" }} initialVersion={selected.version} />}
  </main><Footer /></>;
}
