// ابر داشبورد ارز ادمین — پورت TS داشبورد اقتصادسنجی Streamlit (models.py/sensitivity.py).
// گیت role=admin از layout والد (app/(protected)/admin/layout.tsx) + middleware اعمال می‌شود.
// مدل‌های سبک (PPP چندپایه، پولی، حباب، حساسیت، پیش‌بینی) زنده اجرا می‌شوند؛
// مدل‌های سنگین (PSY/GARCH/MC) در مرحلهٔ ۲ پیش‌محاسبه می‌شوند.

import AdminFxDashboard from "@/components/admin/AdminFxDashboard";
import { getFxDashboardData } from "@/lib/fx/dataLoader";

export const metadata = {
  title: "ابر داشبورد ارز — پنل مدیریت",
};

export const dynamic = "force-dynamic";

export default async function AdminFxPage() {
  const data = await getFxDashboardData();

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display text-2xl md:text-3xl font-bold mt-1"
          style={{ color: "var(--navy-deep)" }}
        >
          ابر داشبورد ارز — هستهٔ راهبری تحلیل کلان
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--text-2)" }}>
          مدل‌های اقتصادسنجی نرخ ارز (PPP چندپایه، پولی، حساسیت، پیش‌بینی رو به جلو) روی
          دادهٔ کلان ۱۳۳۸ تاکنون + نرخ زندهٔ دلار از رله. هرجا با امکانات موجود سایت
          هم‌پوشانی دارد (صندوق‌های طلا، رصد بازار) به همان‌ها متصل می‌شود — دوباره‌سازی نمی‌شود.
        </p>
      </header>
      <AdminFxDashboard data={data} />
    </div>
  );
}
