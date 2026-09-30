import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WebinarsContent from "@/components/public/WebinarsContent";
import CourseCatalog from "@/components/public/CourseCatalog";
import { accountEntryHref } from "@/components/account/returnPath";
export const metadata: Metadata = {
  title: "مسیر راه و وبینار فصلی",
  description:
    "آشنایی با دورهٔ مسیر راه، وبینار درون دوره، زمان تهران و شرایط دسترسی؛ مشاهدهٔ رویدادهای منتشرشده.",
  alternates: { canonical: "/webinars" },
};
export default function WebinarsPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="public-page">
        <section className="public-section">
          <div className="public-container">
            <p className="public-eyebrow">دوره و رویدادهای آن</p>
            <h1>مسیر راه و وبینار فصلی</h1>
            <p className="public-lead">
              وبینار یک جلسه در مسیر دوره است؛ همراهی با محتوای دوره ادامه پیدا
              می‌کند.
            </p>
            <p className="public-description">
              برای کسانی که می‌خواهند موضوع‌های سرمایه‌گذاری را آموزش ببینند،
              پرسش خود را مطرح کنند و داده‌های بازار را دنبال کنند. موضوع، زمان،
              هزینه و مدت دسترسی هر نوبت باید پیش از ثبت‌نام اعلام شود.
            </p>
            <div className="public-actions">
              <Link
                href={accountEntryHref("/login", "/dashboard")}
                className="btn btn-primary"
              >
                ورود اعضای مسیر راه
              </Link>
              <Link href="/consultation" className="btn btn-outline">
                درخواست وقت مشاوره
              </Link>
            </div>
          </div>
        </section>
        <section className="public-section public-surface">
          <div className="public-container">
            <div className="public-section-heading">
              <div>
                <p className="public-eyebrow">پیش از شرکت</p>
                <h2>چه چیزی را بررسی کنید؟</h2>
              </div>
            </div>
            <div className="public-three-grid">
              <article className="public-step">
                <h3>موضوع و زمان وبینار</h3>
                <p>
                  عنوان و زمان واقعی هر رویداد در فهرست منتشرشده دیده می‌شود.
                  همهٔ زمان‌ها به وقت تهران نمایش داده می‌شوند.
                </p>
              </article>
              <article className="public-step">
                <h3>محتوا و حدود دسترسی</h3>
                <p>
                  سه ماه همراهی، هدف خدمت دوره است. شروع، پایان و دسترسی به ضبط
                  و منابع باید در شرایط همان نوبت مشخص شود.
                </p>
              </article>
              <article className="public-step">
                <h3>حساب و نحوهٔ شرکت</h3>
                <p>
                  ورود به حساب به تنهایی عضویت دوره ایجاد نمی‌کند. لینک شرکت و
                  محتوای خصوصی از مسیر حساب و با دسترسی معتبر ارائه می‌شود.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="public-section">
          <div className="public-container">
            <CourseCatalog />
            <div className="public-section-inner" />
            <Suspense
              fallback={<p role="status">در حال دریافت رویدادهای منتشرشده…</p>}
            >
              <WebinarsContent />
            </Suspense>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
