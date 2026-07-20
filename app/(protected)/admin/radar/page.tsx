// پنل رصد ادمین (اسکرینر گلوگاه) — SPEC-admin-market-radar.md
// گیت role=admin از layout والد (app/(protected)/admin/layout.tsx) + middleware اعمال می‌شود.
// عدد خام کامل فقط این‌جا (تحلیلگر مجوزدار) — این صفحه هرگز عمومی نمی‌شود (robots در layout ادمین).

import AdminMarketRadar from "@/components/admin/AdminMarketRadar";
import { getRadarRows } from "@/lib/core/radarData";

export const metadata = {
  title: "رصد بازار — پنل مدیریت",
};

export const dynamic = "force-dynamic";

export default async function AdminRadarPage() {
  const rows = await getRadarRows();

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1
          className="font-display text-2xl md:text-3xl font-bold mt-1"
          style={{ color: "var(--navy-deep)" }}
        >
          رصد بازار — اسکرینر گلوگاه
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--text-2)" }}>
          چهار گلوگاه: جریان پول حقیقی و قدرت خریدار · تغییر عملیاتی زودهنگام (ن-۳۰) ·
          واگرایی تابلو · حجم نسبت به میانگین ۱۰ روزه. منبع: symbol_history و codal_reports
          (فقط خواندن). یافته‌های این پنل خوراک ناحیهٔ «صدای مشاور» و کارنامه است.
        </p>
      </header>
      {rows.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center text-sm"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}
        >
          دادهٔ تاریخچهٔ بازار در دسترس نیست — بعداً دوباره سر بزنید.
        </div>
      ) : (
        <AdminMarketRadar rows={rows} />
      )}
    </div>
  );
}
