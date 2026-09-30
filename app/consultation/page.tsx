import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WaitlistForm from "@/components/landing/WaitlistForm";
import Link from "next/link";
import { accountEntryHref } from "@/components/account/returnPath";
export const metadata: Metadata = {
  title: "درخواست وقت مشاوره",
  description:
    "ثبت درخواست تماس برای هماهنگی موضوع و زمان مشاوره؛ ارسال درخواست به معنی رزرو تأییدشده نیست.",
  alternates: { canonical: "/consultation" },
};
export default function ConsultationPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="public-page">
        <section className="public-section">
          <div className="public-container">
            <p className="public-eyebrow">هماهنگی جلسهٔ مستقل</p>
            <h1>درخواست وقت مشاوره</h1>
            <p className="public-lead">
              ابتدا درخواست تماس، سپس هماهنگی موضوع و زمان.
            </p>
            <div className="public-consultation-grid public-section-inner">
              <div>
                <h2>پس از ارسال چه اتفاقی می‌افتد؟</h2>
                <ol className="public-process-list">
                  <li>
                    <strong>ثبت اطلاعات تماس</strong>
                    <p>
                      در این مرحله فقط ایمیل شما ثبت می‌شود؛ اطلاعات مالی شخصی
                      لازم نیست.
                    </p>
                  </li>
                  <li>
                    <strong>بررسی موضوع و زمان</strong>
                    <p>
                      در تماس بعدی، موضوع جلسه و بازه‌های زمانی مناسب هماهنگ
                      می‌شود.
                    </p>
                  </li>
                  <li>
                    <strong>تأیید مستقل جلسه</strong>
                    <p>
                      زمان، هزینه و امکان برگزاری باید جداگانه تأیید شود. این
                      فرم تقویم وقت آزاد ندارد.
                    </p>
                  </li>
                </ol>
                <div className="public-notice">
                  <h3>پیگیری درخواست</h3>
                  <p>
                    پس از ارسال موفق، رسید همین صفحه را می‌بینید. برای ادامهٔ
                    هماهنگی ایمیل دریافتی را بررسی کنید. این رسید، رزرو یا وضعیت
                    آنلاین درخواست نیست.
                  </p>
                  <p>
                    اگر از قبل حساب دارید،{" "}
                    <Link
                      className="public-text-link"
                      href={accountEntryHref(
                        "/login",
                        "/dashboard/consultation",
                      )}
                    >
                      وارد بخش مشاورهٔ حساب خود شوید
                    </Link>
                    .
                  </p>
                </div>
              </div>
              <div className="public-form-card">
                <h2>درخواست تماس</h2>
                <p>عضویت مسیر راه برای ارسال درخواست لازم نیست.</p>
                <WaitlistForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
