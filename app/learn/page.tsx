// /learn — هاب ناحیهٔ یادگیری (WP-G) طبق SPEC-learning-hub §۴
// کارت‌های دروس (placeholder تا تأیید آرش) + جستجوی واژه‌نامه (کلاینت).
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { LESSONS, hasPublishedLessons } from "@/lib/learn";
import GlossarySearch from "@/components/learn/GlossarySearch";

export const metadata: Metadata = {
  title: "یادگیری — سواد مالی از صفر | قطب‌نمای بازار",
  description:
    "مسیر یادگیری گام‌به‌گام بازار سرمایه و واژه‌نامهٔ اصطلاحات — ساده، صادق، آموزشی.",
};

export default function LearnPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="text-[11px] font-bold" style={{ color: "var(--text-3)" }}>
          ناحیهٔ یادگیری
        </p>
        <h1 className="font-display mt-1 text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          سواد مالی، از صفر و به زبان ساده
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          محتوای این بخش صرفاً آموزشی و مفهومی است — بدون توصیهٔ نماد، بدون سیگنال و بدون وعدهٔ
          بازدهی. هدف این است که هر اصطلاحی را که در سایت می‌بینید، همین‌جا و درجا بفهمید.
        </p>

        {/* مسیر یادگیری */}
        <h2 className="font-display mt-8 text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
          مسیر یادگیری گام‌به‌گام
        </h2>

        {/* `B-028` / `P2-G2-010` — صداقتِ سطحِ سکشن.
            پیش‌تر هر شش سرفصل کارتِ **کلیک‌پذیر** بودند که به صفحهٔ خالی می‌رسیدند.
            برچسبِ «به‌زودی» درست بود ولی کافی نبود: چیزی که کلیک می‌شود و صفحه باز
            می‌کند، در عمل «محتوای در دسترس» خوانده می‌شود.
            حالا تا انتشارِ اولین درس، سرفصل‌ها **فهرستِ غیرِقابلِ‌کلیک**‌اند —
            نه حذف شده‌اند، نه چیزی جعل شده. با `published: true` شدنِ هر درس،
            همان درس خودبه‌خود دوباره لینک می‌شود. */}
        {!hasPublishedLessons() ? (
          <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
            سرفصل‌های این مسیر نهایی شده‌اند، ولی <strong>هنوز هیچ درسی منتشر نشده</strong> —
            متن‌ها در بازبینی‌اند. فهرستِ زیر فقط برنامهٔ کار است، نه محتوای قابل‌مطالعه.
            آنچه همین حالا واقعاً در دسترس است، واژه‌نامهٔ اصطلاحاتِ پایین همین صفحه است.
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((l) => {
            const card = (
              <>
                <div className="flex items-center justify-between">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--navy)" }}
                  >
                    {l.order.toLocaleString("fa-IR")}
                  </span>
                  {!l.published ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
                    >
                      هنوز منتشر نشده
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[14px] font-bold" style={{ color: "var(--text-1)" }}>
                  {l.title}
                </h3>
                <p className="mt-1 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                  {l.summary}
                </p>
              </>
            );

            // درسِ منتشرنشده لینک نمی‌شود — کارتِ خاموش، نه دروازه به صفحهٔ خالی.
            return l.published ? (
              <Link
                key={l.slug}
                href={`/learn/${l.slug}`}
                className="rounded-xl px-4 py-4 transition-colors hover:opacity-90"
                style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
              >
                {card}
              </Link>
            ) : (
              <div
                key={l.slug}
                aria-disabled="true"
                className="rounded-xl px-4 py-4 opacity-70"
                style={{ background: "var(--surface)", border: "1px dashed var(--line)" }}
              >
                {card}
              </div>
            );
          })}
        </div>

        {/* جستجوی واژه‌نامه */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
              واژه‌نامهٔ اصطلاحات
            </h2>
            <Link href="/learn/glossary" className="text-[12px] hover:underline" style={{ color: "var(--navy)" }}>
              مشاهدهٔ واژه‌نامهٔ کامل ←
            </Link>
          </div>
          <div className="mt-3">
            <GlossarySearch limit={6} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
