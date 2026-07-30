// /learn/[slug] — صفحهٔ هر درس (WP-G)
// قید BRIEF: متن دروس نیاز به تأیید آرش دارد → بدنهٔ درس placeholder است و منتشر نمی‌شود.
// فقط عنوان، شرح کوتاه (از SPEC)، واژه‌های کلیدی لینک‌دار و «قدم بعدی» نمایش داده می‌شود.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { LESSONS, getLesson } from "@/lib/learn";
import { getTerm } from "@/lib/glossary";

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) return { title: "درس پیدا نشد | قطب‌نمای بازار" };
  return {
    title: `${lesson.title} | یادگیری — قطب‌نمای بازار`,
    description: lesson.summary,
    // `B-028`: بدنهٔ درسِ منتشرنشده placeholder است. صفحه **حذف نمی‌شود** (تا
    // پیش‌نویس و مسیر بمانند) ولی ایندکس‌شدنش هم درست نیست: صفحهٔ نازکی که
    // محتوایی ندارد نباید در نتایج جست‌وجو به‌عنوان درس ظاهر شود. با
    // `published: true` این قید خودبه‌خود برداشته می‌شود.
    robots: lesson.published ? undefined : { index: false, follow: true },
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();

  const next = LESSONS.find((l) => l.order === lesson.order + 1) ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-[11px] font-bold" style={{ color: "var(--text-3)" }}>
          ناحیهٔ یادگیری ·{" "}
          <Link href="/learn" className="hover:underline">
            بازگشت به مسیر یادگیری
          </Link>
        </p>
        <h1 className="font-display mt-1 text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          {`درس ${lesson.order.toLocaleString("fa-IR")}: ${lesson.title}`}
        </h1>
        <p className="mt-2 text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          {lesson.summary}
        </p>

        {/* بدنهٔ درس — placeholder تا تأیید متن توسط آرش (قید BRIEF/SPEC §۶) */}
        <section
          className="mt-6 rounded-xl px-5 py-6 text-center"
          style={{ background: "var(--surface)", border: "1px dashed var(--line-strong)" }}
        >
          <p className="text-[14px] font-bold" style={{ color: "var(--navy-deep)" }}>
            متن کامل این درس به‌زودی منتشر می‌شود
          </p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
            محتوای آموزشی این درس در حال آماده‌سازی و بازبینی نهایی است. تا آن زمان می‌توانید
            واژه‌های کلیدی همین درس را در واژه‌نامه بخوانید.
          </p>
        </section>

        {/* واژه‌های کلیدی درس — لینک‌دار به واژه‌نامه */}
        {lesson.glossaryIds.length > 0 ? (
          <section className="mt-6">
            <h2 className="font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
              واژه‌های کلیدی این درس
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {lesson.glossaryIds.map((id) => {
                const t = getTerm(id);
                if (!t) return null;
                return (
                  <Link
                    key={id}
                    href={`/learn/glossary#${id}`}
                    className="rounded-xl px-4 py-3 hover:opacity-90"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                  >
                    <h3 className="text-[13px] font-bold" style={{ color: "var(--text-1)" }}>
                      {t.term}
                    </h3>
                    <p className="mt-1 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                      {t.short}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* قدم بعدی */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {next ? (
            <Link
              href={`/learn/${next.slug}`}
              className="rounded-lg px-4 py-2 text-[13px] font-bold text-white"
              style={{ background: "var(--navy)" }}
            >
              {`قدم بعدی: ${next.title} ←`}
            </Link>
          ) : (
            <Link
              href="/learn"
              className="rounded-lg px-4 py-2 text-[13px] font-bold text-white"
              style={{ background: "var(--navy)" }}
            >
              بازگشت به مسیر یادگیری ←
            </Link>
          )}
          <Link href="/learn/glossary" className="text-[12px] hover:underline" style={{ color: "var(--navy)" }}>
            واژه‌نامهٔ کامل
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
