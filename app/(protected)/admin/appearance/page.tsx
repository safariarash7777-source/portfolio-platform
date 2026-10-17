import MediaAppearanceSettings from "@/components/insights/MediaAppearanceSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "چیدمان سایت آرش" };

export default function SiteAppearancePage() {
  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display mt-1 text-2xl font-bold"
          style={{ color: "var(--heading)" }}
        >
          چیدمان سایت آرش
        </h1>
        <p
          className="mt-3 text-sm leading-7"
          style={{ color: "var(--text-2)" }}
        >
          هر سه طرح در دسترس‌اند. ابتدا پیش‌نمایش را ببینید و سپس طرح دلخواه را
          برای بازدیدکنندگان ذخیره کنید.
        </p>
      </header>
      <MediaAppearanceSettings />
    </div>
  );
}
