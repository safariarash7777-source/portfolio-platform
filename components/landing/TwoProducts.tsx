import Link from "next/link";
import WaitlistForm from "./WaitlistForm";
export default function TwoProducts() {
  return (
    <section
      id="waitlist"
      className="public-section"
      aria-labelledby="consultation-title"
    >
      <div className="public-container public-consultation-grid">
        <div>
          <p className="public-eyebrow">مشاورهٔ مستقل</p>
          <h2 id="consultation-title">درخواست وقت مشاوره</h2>
          <p className="public-description">
            برای گفتگو دربارهٔ نیاز شخصی‌تان، درخواست تماس بفرستید. پس از
            هماهنگی موضوع و زمان، امکان برگزاری جلسه مشخص می‌شود. عضویت دوره شرط
            ارسال درخواست نیست.
          </p>
          <Link href="/consultation" className="public-text-link">
            جزئیات درخواست و پیگیری
          </Link>
          <p className="public-caption">
            ارسال ایمیل به معنی رزرو جلسه یا تأیید زمان نیست.
          </p>
        </div>
        <div className="public-form-card">
          <h3>شروع هماهنگی</h3>
          <p>
            ایمیل در دسترس‌تان را وارد کنید تا امکان تماس برای هماهنگی فراهم
            شود.
          </p>
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
