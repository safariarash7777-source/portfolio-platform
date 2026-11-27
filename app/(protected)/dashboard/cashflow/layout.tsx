import type { ReactNode } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import BudgetEntryHeading from "@/components/portfolio/cashflow/BudgetEntryHeading";

/** This shell is outside the route's loading boundary. One focusable budget
 * destination survives identity checks, period reads, failures and selection. */
export default function CashFlowLayout({ children }: { children: ReactNode }) {
  return <><Navbar /><main id="main-content" dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8">
    <header className="private-workspace-heading"><span className="eyebrow">فضای مالی شخصی · آرش صفری</span>
      <h1 className="font-display text-2xl font-bold md:text-3xl" style={{ color: "var(--heading)" }}>جریان نقد شخصی</h1>
      <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>چه پولی در این دوره برنامه‌ریزی شده و چه پولی واقعاً جابه‌جا شده است؟ حساب‌ها، دوره و میزان پوشش اطلاعات را خودتان مشخص کنید.</p>
    </header>
    <nav aria-label="مسیرهای مالی عضو" className="flex flex-wrap gap-3"><Link href="/dashboard" className="btn btn-outline">داشبورد</Link><Link href="/dashboard/holdings" className="btn btn-outline">دارایی و بدهی</Link><Link href="/dashboard/goals" className="btn btn-outline">هدف‌های مالی</Link><a href="#period-budget" className="btn btn-outline">بودجهٔ دوره</a></nav>
    <p className="text-sm leading-7">این دفتر مستقل از دارایی‌ها و اقساط است؛ قسط یا ماندهٔ بدهی خودکار پرداخت واقعی نمی‌شود. حساب نقدیِ اینجا یک عنوان ثبت‌شده توسط شماست، نه اتصال یا تأیید بانک.</p>
    <BudgetEntryHeading />
    {children}
  </main><Footer /></>;
}
