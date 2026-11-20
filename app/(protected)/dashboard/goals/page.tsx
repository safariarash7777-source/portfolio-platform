import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ReadError from "@/components/dashboard/ReadError";
import GoalsWorkspace from "@/components/portfolio/goals/GoalsWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";

export const dynamic = "force-dynamic";
export const metadata = { title: "هدف‌های مالی", description: "مبلغ و موعد هدف‌ها و میزان کنارگذاشته‌شدهٔ اظهارشده توسط شما." };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const selected = await searchParams;
  let ownerId: string | null = null, unavailable = false;
  try {
    const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000);
    unavailable = authSessionFailure(auth.error) === 503;
    ownerId = auth.error ? null : auth.data.user?.id ?? null;
  } catch { unavailable = true; }
  if (!unavailable && !ownerId) redirect("/login");
  return <><Navbar /><main id="main-content" dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8">
    <header className="space-y-2"><span className="eyebrow">فضای مالی شخصی · آرش صفری</span>
      <h1 className="font-display text-2xl font-bold md:text-3xl" style={{ color: "var(--navy-deep)" }}>هدف‌های مالی</h1>
      <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>برای هر هدف مبلغ و موعد مشخص کنید و مبلغ کنارگذاشته‌شده را با منبع و تاریخ ثبت کنید.</p>
    </header>
    <nav aria-label="مسیرهای مالی عضو" className="flex flex-wrap gap-3"><Link href="/dashboard" className="btn btn-outline">داشبورد</Link><Link href="/dashboard/cashflow" className="btn btn-outline">جریان نقد و بودجه</Link><Link href="/dashboard/holdings" className="btn btn-outline">دارایی و بدهی</Link></nav>
    <p className="text-sm leading-7">مبالغ کنارگذاشته‌شده اظهار شما هستند؛ این صفحه موجودی بانکی را تأیید نمی‌کند و بازده آینده فرض نمی‌کند. ثبت هدف، وجهی را منتقل یا از دارایی و جریان نقد کم نمی‌کند.</p>
    {unavailable || !ownerId ? <ReadError label="نشستِ هدف‌های مالی؛ ورود شما هنوز بررسی نشده است" code="GOALS_AUTH" />
      : <GoalsWorkspace key={`${ownerId}:${selected.version ?? ""}`} expectedOwnerId={ownerId} initialVersion={selected.version} />}
  </main><Footer /></>;
}
