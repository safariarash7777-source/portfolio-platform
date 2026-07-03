import DashboardOverview from "@/components/admin/DashboardOverview";

export const metadata = {
  title: "داشبورد مدیریت",
};

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display text-2xl md:text-3xl font-bold mt-1"
          style={{ color: "var(--navy-deep)" }}
        >
          داشبورد
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          نمای کلی پلتفرم — کاربران، آزمون ریسک، پوشش پرتفوی و لیست انتظار.
        </p>
      </header>

      <DashboardOverview />
    </div>
  );
}
