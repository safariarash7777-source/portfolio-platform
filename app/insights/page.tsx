import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MediaHub from "@/components/insights/MediaHub";
import { type ContentItem, isPlatform, isKind } from "@/lib/content-hub";
import { readSiteAppearance } from "@/lib/appearance/site-layout-server";
import { pageMetadata } from "@/lib/metadata";
import { withDeadline } from "@/lib/deadline";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = pageMetadata({
  title: "تحلیل‌های اجتماعی",
  description:
    "بازنشر محتوای کانال تلگرام آرش صفری — تحلیل‌ها و دیدگاه‌های منتشرشده، بدون ویرایش. توصیهٔ خرید یا فروش نیست.",
  path: "/insights",
});

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const [{ data, error: contentError }, setting] = await Promise.all([
    withDeadline(async (signal) => await supabase
      .from("content_hub")
      .select(
        "id, platform, kind, content_url, title, description, published_at",
      )
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(60)
      .abortSignal(signal), 4000).catch(() => ({ data: null, error: true })),
    readSiteAppearance(supabase, search),
  ]);
  const items: ContentItem[] = (data ?? [])
    .filter((r) => isPlatform(r.platform) && isKind(r.kind))
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      kind: r.kind,
      content_url: r.content_url,
      title: r.title,
      description: r.description,
      published_at: r.published_at,
    }));
  // Only the RPC defines the initial default. A failed read is not a guessed
  // global decision, and browser prefs/hash cannot override a successful read.
  const layout =
    setting.state === "ready"
      ? (setting.previewLayout ?? setting.globalLayout)
      : 1;
  return (
    <>
      <Navbar />
      <MediaHub
        items={items}
        globalLayout={layout}
        appearancePreview={setting.previewLayout !== null}
        appearanceReadFailed={setting.state === "unavailable"}
        sourceMode="existing"
        initialMode={contentError ? "error" : "ready"}
      />
      <Footer />
    </>
  );
}
