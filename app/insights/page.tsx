import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import InsightsGrid from "@/components/insights/InsightsGrid";
import Link from "next/link";
import { Send, Instagram } from "lucide-react";
import { type ContentItem, isPlatform, isKind, PLATFORM_META } from "@/lib/content-hub";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "تحلیل‌های اجتماعی",
  description:
    "بازنشر محتوای کانال تلگرام آرش صفری — تحلیل‌ها و دیدگاه‌های منتشرشده، بدون ویرایش. توصیهٔ خرید یا فروش نیست.",
  path: "/insights",
});

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_hub")
    .select("id, platform, kind, content_url, title, description, published_at")
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(60);

  // فقط ردیف‌هایی با پلتفرم/نوعِ معتبر (نگهبانِ نمایش).
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

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 pt-10 pb-16">
          <header className="mb-8">
            <span className="eyebrow">ناحیهٔ تحلیل‌ها · شبکه‌های اجتماعی</span>
            <h1
              className="font-display text-3xl md:text-4xl font-bold mt-2"
              style={{ color: "var(--navy-deep)" }}
            >
              تحلیل‌های اجتماعی
            </h1>
            <p className="text-sm md:text-base mt-3 leading-8 max-w-2xl" style={{ color: "var(--text-2)" }}>
              تجمیعِ جدیدترین تحلیل‌ها، ویدیوها و پست‌های آرش صفری از شبکه‌های اجتماعی، یک‌جا. برای دیدنِ
              کاملِ هر مطلب روی کارت بزنید تا به منبعِ اصلی بروید. در همین ناحیه،{" "}
              <Link href="/notes" className="font-bold hover:underline" style={{ color: "var(--navy)" }}>
                یادداشت روزانهٔ بازار
              </Link>{" "}
              (نگاه کوتاه روزانهٔ خود سایت) و{" "}
              <Link href="/analyses" className="font-bold hover:underline" style={{ color: "var(--navy)" }}>
                کارنامهٔ قابل راستی‌آزمایی
              </Link>{" "}
              را هم ببینید.
            </p>

            {/* دکمه‌های دنبال‌کردن */}
            <div className="flex flex-wrap gap-3 mt-5">
              {PLATFORM_META.telegram.followUrl && (
                <a
                  href={PLATFORM_META.telegram.followUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Send size={15} />
                  کانالِ تلگرام
                </a>
              )}
              {PLATFORM_META.instagram.followUrl && (
                <a
                  href={PLATFORM_META.instagram.followUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Instagram size={15} />
                  اینستاگرام
                </a>
              )}
            </div>
          </header>

          <InsightsGrid items={items} />

          <p className="text-[11px] leading-6 mt-8" style={{ color: "var(--text-3)" }}>
            محتوا صرفاً اطلاع‌رسانی و آموزشی است؛ توصیهٔ مستقیمِ خرید/فروش یا وعدهٔ بازدهی نیست.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
