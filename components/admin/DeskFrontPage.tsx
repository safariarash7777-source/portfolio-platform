import Link from "next/link";
import { ArrowLeft, BookOpen, ClipboardCheck, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import s from "./DeskFrontPage.module.css";

/** A work queue entry, not a count: merely opening this page never queries
 * or publishes a case. All work continues behind its original route gate. */
export default function DeskFrontPage({ observedAt, quality, controls }: {
  observedAt: string; quality: string; controls: ReactNode;
}) {
  return <div className={`dos ${s.front}`} dir="rtl">
    <header className={s.mast}>
      <div><div className="dos-kicker"><span />آرش صفری · فضای مدیریت</div>
        <h1>میز کار آرش</h1></div>
      <div className={s.controls}>{controls}</div>
    </header>
    <div className={s.spread}>
      <section className={s.lead} aria-labelledby="desk-read-title">
        <div className={s.slug}><BookOpen size={17} aria-hidden /> پژوهش بازار</div>
        <h2 id="desk-read-title">چه چیزی ارزش بررسی دارد؟</h2>
        <p>نمای بازار را پایین همین صفحه بخوانید یا برای ثبت شواهد و پیگیری یک نماد، کاربرگ تحلیل را باز کنید.</p>
        <div className={s.linkRow}><Link prefetch={false} href="/admin/research" className={s.primary}>ورود به کاربرگ تحلیل <ArrowLeft size={15} aria-hidden /></Link>
          <Link prefetch={false} href="/symbol/فولاد#fundamental" className={s.textLink}>تحلیل عملکرد فولاد</Link></div>
      </section>
      <section className={s.review} aria-labelledby="desk-reviews-title">
        <div className={s.slug}><ClipboardCheck size={17} aria-hidden /> پیگیری اعضا</div>
        <h2 id="desk-reviews-title">پرونده‌های مشاوره</h2>
        <p>پروندهٔ مجاز را مرور کنید. پیش‌نویس، تأیید و انتشار برای عضو سه مرحلهٔ جدا هستند.</p>
        <Link prefetch={false} href="/admin/consultation" className={s.reviewLink}>ورود به میز مشاوره <ArrowLeft size={15} aria-hidden /></Link>
      </section>
    </div>
    <div className={s.edition}><div><Layers3 size={16} aria-hidden /><strong>داده‌های میز</strong></div>
      <span>{quality}</span><span>خواندن صفحه: {observedAt}</span>
      <Link prefetch={false} href="/admin/overview">آمار اعضا و سامانه <ArrowLeft size={14} aria-hidden /></Link>
    </div>
  </div>;
}
