import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import NotesFeed, { type Note } from "@/components/notes/NotesFeed";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "یادداشت روزانهٔ بازار",
  description:
    "نگاهِ کوتاهِ روزانهٔ آرش صفری به بازار طلا، ارز، بورس و کریپتو — چند بولت و یک جمع‌بندی.",
};

export default async function NotesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("market_notes")
    .select("id, title, body_md, tags, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(60);

  const notes: Note[] = (data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body_md: n.body_md,
    tags: n.tags ?? [],
    published_at: n.published_at,
  }));

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16">
          <header className="mb-8">
            <span className="eyebrow">ناحیهٔ تحلیل‌ها · یادداشت روزانهٔ سایت</span>
            <h1
              className="font-display text-3xl md:text-4xl font-bold mt-2"
              style={{ color: "var(--navy-deep)" }}
            >
              نگاهِ روزانه به بازار
            </h1>
            <p className="text-sm md:text-base mt-3 leading-8" style={{ color: "var(--text-2)" }}>
              تحلیلِ کوتاه و صادقانهٔ روزِ بازار — چند نکتهٔ کلیدی و یک جمع‌بندی. بدونِ وعدهٔ سود و
              بدونِ سیگنالِ مستقیمِ خرید و فروش؛ فقط زمینه برای تصمیمِ آگاهانهٔ خودت. پست‌ها و
              ویدیوهای شبکه‌های اجتماعی جداگانه در صفحهٔ{" "}
              <Link href="/insights" className="font-bold hover:underline" style={{ color: "var(--navy)" }}>
                تحلیل‌های اجتماعی
              </Link>{" "}
              جمع می‌شوند.
            </p>
          </header>

          <NotesFeed notes={notes} />
        </div>
      </main>
      <Footer />
    </>
  );
}
