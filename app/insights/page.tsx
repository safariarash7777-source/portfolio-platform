import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MediaHub from "@/components/insights/MediaHub";
import { readSiteAppearance } from "@/lib/appearance/site-layout-server";
import { pageMetadata } from "@/lib/metadata";
import { readPublicMedia } from "@/lib/media/public-read.server";

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
  const [media, setting] = await Promise.all([
    readPublicMedia(),
    readSiteAppearance(supabase, search),
  ]);
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
        items={media.items}
        globalLayout={layout}
        appearancePreview={setting.previewLayout !== null}
        appearanceReadFailed={setting.state === "unavailable"}
        sourceMode="existing"
        initialMode={media.state === "unavailable" ? "error" : "ready"}
      />
      <Footer />
    </>
  );
}
