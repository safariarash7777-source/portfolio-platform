import Link from "next/link";
import { ArrowLeft, CalendarDays, BookOpen, LineChart } from "lucide-react";
import { accountEntryHref } from "@/components/account/returnPath";

export default function Hero() {
  return (
    <section className="public-hero" aria-labelledby="service-title">
      <div className="public-container public-hero-grid">
        <div>
          <p className="public-eyebrow">
            آرش صفری · آموزش و تحلیل بازار سرمایه
          </p>
          <h1 id="service-title">مسیر راه سرمایه‌گذاری</h1>
          <p className="public-lead">
            وبینار فصلی و سه ماه همراهی با محتوای دوره و داشبوردهای بازار
          </p>
          <p className="public-description">
            یک دوره برای دنبال‌کردن آموزش، طرح پرسش و مطالعهٔ بازار. وبینار بخشی
            از دوره است؛ زمان شرکت و حدود دسترسی هر نوبت پیش از ثبت‌نام اعلام
            می‌شود.
          </p>
          <div className="public-actions">
            <Link href="/webinars" className="btn btn-primary">
              شناخت دوره و وبینار <ArrowLeft size={18} aria-hidden />
            </Link>
            <Link
              href={accountEntryHref("/login", "/dashboard")}
              className="btn btn-outline"
            >
              ورود اعضای مسیر راه
            </Link>
          </div>
          <p className="public-caption">
            برای مشاهدهٔ بازار و مطالب عمومی، عضویت لازم نیست.
          </p>
        </div>
        <aside
          className="public-program-card"
          aria-label="آنچه در مسیر راه دنبال می‌کنید"
        >
          <div className="public-card-heading">
            <span>مسیر راه</span>
            <span className="public-badge public-badge-on-navy">
              دورهٔ فصلی
            </span>
          </div>
          <h2>
            از جلسهٔ وبینار
            <br />
            تا ادامهٔ یادگیری
          </h2>
          <ul className="public-program-list">
            <li>
              <CalendarDays size={22} aria-hidden />
              <div>
                <strong>وبینار درون دوره</strong>
                <span>ارائهٔ موضوع و فرصت طرح پرسش</span>
              </div>
            </li>
            <li>
              <BookOpen size={22} aria-hidden />
              <div>
                <strong>محتوای دوره</strong>
                <span>مطالب و منابع منتشرشده برای اعضا</span>
              </div>
            </li>
            <li>
              <LineChart size={22} aria-hidden />
              <div>
                <strong>داشبوردهای بازار</strong>
                <span>مطالعهٔ داده با منبع و زمان دریافت</span>
              </div>
            </li>
          </ul>
          <p className="public-program-note">
            تاریخ، هزینه و ثبت‌نام نوبت بعد را در صفحهٔ دوره بررسی کنید. دسترسی
            به ضبط و منابع تابع شرایط همان نوبت است.
          </p>
          <Link href="/webinars" className="public-on-navy-link">
            جزئیات دوره و وبینار <ArrowLeft size={18} aria-hidden />
          </Link>
        </aside>
      </div>
    </section>
  );
}
