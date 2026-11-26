import Link from "next/link";
import DashboardOverview from "@/components/admin/DashboardOverview";
export const metadata = { title: "آمار اعضا و سامانه" };

export default function AdminDashboardPage() {
  return <div className="space-y-6">
    <header className="private-workspace-heading">
      <span>عملیات سامانه · آرش صفری</span><h1>آمار اعضا و سامانه</h1>
      <p>عضویت، تکمیل ارزیابی ریسک و پوشش پرتفوی را کنار هم بخوانید.</p>
      <nav aria-label="مسیرهای عملیات سامانه">
        <Link href="/admin/users">مشاهدهٔ اعضا</Link><Link href="/admin/manage?tab=waitlist">لیست انتظار</Link>
        <Link href="/admin/desk">بازگشت به میز کار</Link>
      </nav>
    </header><DashboardOverview />
  </div>;
}
