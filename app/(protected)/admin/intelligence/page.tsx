import IntelligenceDesk from "@/components/admin/IntelligenceDesk";
import { loadAdminIntelligenceView } from "@/lib/intelligence/admin-view";

export const metadata = {
  title: "گردش هوشمندی دستی | پنل مدیریت",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * نمای تخصصیِ ثبت، بازبینی و تمرین.
 *
 * نقطهٔ شروعِ روزانه `/admin/desk` است؛ این مسیر به‌عنوانِ drill-down باقی
 * می‌ماند تا گردش دستی، تاریخچه و سنجه‌های تمرین از صفحهٔ فرماندهی جدا اما
 * هم‌منبع باشند.
 */
export default async function AdminIntelligencePage() {
  const view = await loadAdminIntelligenceView();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold" style={{ color: "var(--gold)" }}>
          موتور زیرِ میز فرماندهی
        </p>
        <h1 className="mt-1 font-display text-xl font-extrabold" style={{ color: "var(--text)" }}>
          گردش هوشمندی دستی
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          ثبت رخداد و شاهد، ساخت سناریو، سنجش اثر احتمالی بر سبد مرجع و بازبینی انسانی.
          هیچ Agent، LLM یا انتشار خودکاری در این مسیر وجود ندارد.
        </p>
      </div>

      <IntelligenceDesk {...view} />
    </div>
  );
}
