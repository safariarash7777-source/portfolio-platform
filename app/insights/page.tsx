import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MediaHub from "@/components/insights/MediaHub";
import { type ContentItem, isPlatform, isKind } from "@/lib/content-hub";
import { isMediaLayout } from "@/lib/media/layout-setting";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = pageMetadata({
  title: "تحلیل‌های اجتماعی",
  description: "بازنشر محتوای کانال تلگرام آرش صفری — تحلیل‌ها و دیدگاه‌های منتشرشده، بدون ویرایش. توصیهٔ خرید یا فروش نیست.",
  path: "/insights",
});

export default async function InsightsPage() {
  const supabase = await createClient();
  const [{ data, error: contentError }, setting] = await Promise.all([
    supabase.from("content_hub")
      .select("id, platform, kind, content_url, title, description, published_at")
      .is("deleted_at", null).not("published_at", "is", null)
      .order("published_at", { ascending: false }).limit(60),
    supabase.rpc("get_media_layout"),
  ]);
  const items: ContentItem[] = (data ?? [])
    .filter(r => isPlatform(r.platform) && isKind(r.kind))
    .map(r => ({ id: r.id, platform: r.platform, kind: r.kind, content_url: r.content_url,
      title: r.title, description: r.description, published_at: r.published_at }));
  // Only the RPC defines the initial default. A failed read is not a guessed
  // global decision, and browser prefs/hash cannot override a successful read.
  const layout = !setting.error && isMediaLayout(setting.data) ? setting.data : null;
  return <><Navbar />{layout === null ? <main className="mx-auto max-w-6xl px-5 py-12" role="alert">
    <h1 className="text-2xl font-bold">رسانهٔ آرش</h1>
    <p className="mt-4">خواندن تنظیم چیدمان ممکن نشد. دوباره صفحه را باز کنید.</p>
    <a href="/insights" className="btn btn-outline mt-4">تلاش مجدد</a>
  </main> : <MediaHub items={items} globalLayout={layout} sourceMode="existing" initialMode={contentError ? "error" : "ready"} />}
  <Footer /></>;
}
