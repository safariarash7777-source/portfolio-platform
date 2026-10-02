import ArashCommandDesk from "@/components/admin/ArashCommandDesk";
import { loadAdminIntelligenceView } from "@/lib/intelligence/admin-view";
import P07DeskIntegration from "@/components/admin/P07DeskIntegration";
import P07DeskScenario from "@/components/admin/P07DeskScenario";

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
export default async function AdminDeskPage({ searchParams }: { searchParams: Promise<{ p07?: string }> }) {
  const view = await loadAdminIntelligenceView();
  const params = await searchParams;
  const sample = process.env.NODE_ENV === 'development' && params.p07 === 'sample';
  return <div className="space-y-8"><ArashCommandDesk view={view} />{sample ? <P07DeskScenario/> : <P07DeskIntegration/>}</div>;
}
