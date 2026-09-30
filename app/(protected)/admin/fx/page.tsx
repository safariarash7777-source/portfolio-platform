// The parent admin layout checks the user's role. The hosted dashboard also
// requires its own password, including when opened outside this frame.

import Link from "next/link";
import FxFrame from "@/components/admin/FxFrame";

export const metadata = {
  title: "داشبورد کامل نرخ ارز — پنل مدیریت",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminFxPage() {
  const dashboardUrl = process.env.FX_DASHBOARD_URL?.trim() || "https://62-60-191-24.sslip.io/";
  const embedUrl = new URL(dashboardUrl);
  embedUrl.searchParams.set("embed", "true");

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display text-2xl md:text-3xl font-bold mt-1"
          style={{ color: "var(--navy-deep)" }}
        >
          داشبورد کامل نرخ ارز
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--text-2)" }}>
          نرخ زندهٔ ارز و طلا، مدل‌های اقتصادسنجی، تحلیل حباب و پیش‌بینی.
          برای ورود، رمز داشبورد را در کادر زیر وارد کنید.
        </p>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="underline">
            باز کردن داشبورد در صفحهٔ جدا
          </a>
          <Link href="/admin/fx/native" className="underline">نمای تحلیلی سایت</Link>
        </div>
      </header>
      <FxFrame src={embedUrl.toString()} />
    </div>
  );
}
