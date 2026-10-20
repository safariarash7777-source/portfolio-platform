import Link from "next/link";
import { ArrowUpLeft, BookOpen } from "lucide-react";
import s from "./PublicDesign.module.css";

export default function PublicHome() {
  return (
    <section className={s.homeHero} aria-labelledby="public-home-title">
      <div className={s.heroCopy}>
        <p className={s.eyebrow}>تحلیلگر و مشاور سرمایه‌گذاری</p>
        <h1 id="public-home-title">آرش صفری</h1>
        <p>مطالب و تحلیل‌های بازار، با ابزارهای ثبت و بررسی اطلاعات مالی شخصی.</p>
        <p>بازار ایران را دنبال می‌کنم و تحلیلم را با نام خودم منتشر می‌کنم.</p>
        <div className={s.actions}>
          <a href="#home-media" className={s.primary}>
            رسانهٔ آرش <ArrowUpLeft size={18} aria-hidden />
          </a>
          <Link href="/about">دربارهٔ آرش و روش کارش</Link>
        </div>
      </div>
      <section
        className={`${s.panel} ${s.journey}`}
        aria-labelledby="home-intro-title"
      >
        <header>
          <BookOpen size={22} aria-hidden />
          <h2 id="home-intro-title">در این وب‌سایت</h2>
        </header>
        <p>مطالب منتشرشده و روش کار آرش صفری؛ همراه با فضای مالی شخصی اعضا.</p>
        <nav className={s.introLinks} aria-label="مسیرهای آشنایی با آرش">
          <a href="#home-media">
            محتوای منتشرشده <ArrowUpLeft size={16} aria-hidden />
          </a>
          <Link href="/about">
            روش کار آرش <ArrowUpLeft size={16} aria-hidden />
          </Link>
          <a href="#waitlist">
            مسیرهای همکاری <ArrowUpLeft size={16} aria-hidden />
          </a>
        </nav>
      </section>
    </section>
  );
}
