import Link from "next/link";
import { publishedLessons } from "@/lib/learn";

export default function MemberLearning() {
  const lessons = publishedLessons();
  return <section className="card space-y-4 p-5" aria-labelledby="member-learning-title"><h2 id="member-learning-title" className="font-display text-xl font-bold">آموزش کوتاه و پرسش</h2>
    <p>درس‌های مجاز دوره از همان فهرست محتوای منتشرشده دریافت می‌شوند؛ در فهرست، نوع «درس» را انتخاب کنید.</p>
    {lessons.length ? <ul className="space-y-3">{lessons.map(lesson => <li key={lesson.slug}><Link className="inline-flex min-h-12 items-center font-bold underline" href={`/learn/${lesson.slug}`}>{lesson.title}</Link><p className="text-sm">{lesson.summary}</p></li>)}</ul> : <p className="text-sm">در ناحیهٔ عمومی یادگیری هنوز درس کوتاهی منتشر نشده است.</p>}
    <nav className="flex flex-wrap gap-3" aria-label="یادگیری و پرسش"><a className="btn btn-outline min-h-12" href="#member-publications-title">درس‌ها و محتوای منتشرشدهٔ دوره</a><Link className="btn btn-outline min-h-12" href="/glossary">توضیح واژه‌های بازار</Link><a className="btn btn-outline min-h-12" href="#member-question">ثبت پرسش آموزشی در نیازسنجی</a></nav>
    <p className="text-sm">پرسش نیازسنجی برای آماده‌سازی محتوای دوره ثبت می‌شود؛ رسید آن تضمین پاسخ فوری یا رزرو جلسهٔ مشاوره نیست.</p>
  </section>;
}
