import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketModuleAccess } from "@/lib/market-module-access";
import { isMarketModule, MARKET_MODULE_DESTINATIONS } from "@/lib/market-module-contract";
import { formatJalali } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function CourseMarketModule({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<{ cohort?: string }> }) {
  const [{ module }, { cohort }] = await Promise.all([params, searchParams]);
  if (!isMarketModule(module)) notFound();
  if (cohort && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cohort)) notFound();
  const grant = await getMarketModuleAccess(module, cohort);
  const destination = MARKET_MODULE_DESTINATIONS[module];
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8" dir="rtl">
    <Link className="inline-flex min-h-11 items-center underline" href="/dashboard">خانهٔ من</Link>
    <h1 className="font-display text-2xl font-bold">{destination.title}</h1>
    {grant.allowed ? <section className="card space-y-3 p-5">
      <p>{destination.question}</p>
      <p className="text-sm">{grant.until ? `دسترسی این ماژول تا ${formatJalali(grant.until)}` : "این ماژول برای حساب شما فعال است."}</p>
      <Link href={destination.href} className="btn-primary inline-flex min-h-11 items-center">باز کردن داشبورد</Link>
      <p className="text-sm">تاریخ معتبر، منبع و پوشش داده را کنار هر بخش بخوانید.</p>
    </section> : <section className="card space-y-3 p-5" role="status">
      <h2 className="text-lg font-bold">{grant.reason === "unavailable" ? "وضعیت دسترسی قابل بررسی نیست" : "این ماژول برای دورهٔ انتخاب‌شده فعال نیست"}</h2>
      <p>عضویت فعال و مجوز همین ماژول باید تأیید شود. اطلاعات حساب و پروندهٔ شخصی شما مستقل باقی می‌مانند.</p>
      <Link href={destination.href} className="inline-flex min-h-11 items-center underline">نمای عمومی بازار</Link>
    </section>}
  </main>;
}
