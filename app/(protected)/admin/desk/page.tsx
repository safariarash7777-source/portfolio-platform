import ArashCommandDesk from "@/components/admin/ArashCommandDesk";
import DeskStudio from "@/components/admin/DeskStudio";
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
export default async function AdminDeskPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const view = await loadAdminIntelligenceView();
  if (params.view === "studio" && (process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development")) return <DeskStudio view={view} />;
  return <ArashCommandDesk view={view} />;
}
