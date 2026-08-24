import ArashCommandDesk from "@/components/admin/ArashCommandDesk";
import { loadAdminIntelligenceView } from "@/lib/intelligence/admin-view";

export const metadata = {
  title: "میز فرماندهی هوشمندی آرش | پنل مدیریت",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * صفحهٔ اصلیِ کارِ روزانهٔ آرش.
 *
 * این صفحه موتور جدیدی نیست: قراردادِ گردش دستی را از
 * `loadAdminIntelligenceView` و سلامت منابع را از `DeskBoard` می‌گیرد، سپس
 * آن‌ها را در شش سؤال مصوب کنار هم می‌چیند.
 */
export default async function AdminDeskPage() {
  const view = await loadAdminIntelligenceView();
  return <ArashCommandDesk view={view} />;
}
