import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "حریم خصوصی | قطب‌نمای بازار",
  description: "سیاست حریم خصوصی پلتفرم قطب‌نمای بازار",
};

export default function PrivacyPage() {
  return (
    <article className="leading-8 text-justify" style={{ color: "var(--text)" }}>
      <h1 className="font-display text-3xl font-bold mb-8" style={{ color: "var(--navy-deep)" }}>
        حریم خصوصی
      </h1>

      <section className="flex flex-col gap-5 text-sm">
        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          چه داده‌هایی جمع‌آوری می‌شود؟
        </h2>
        <p>
          برای ساخت حساب کاربری، نشانی ایمیل و نام شما ذخیره می‌شود. در صورت ثبت‌نام در وبینار
          یا استفاده از خدمات مشاوره، اطلاعات پرداخت از طریق درگاه پرداخت معتبر پردازش می‌شود و
          شمارهٔ کارت یا اطلاعات بانکی شما هرگز روی سرورهای ما ذخیره نمی‌شود.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          داده‌ها چگونه استفاده می‌شوند؟
        </h2>
        <p>
          داده‌های حساب صرفاً برای ارائهٔ خدمات (ورود به سیستم، مدیریت دسترسی، اطلاع‌رسانی
          وبینار و پیگیری درخواست‌های مشاوره) استفاده می‌شود. اطلاعات شخصی شما به هیچ شخص یا
          شرکت ثالثی فروخته یا واگذار نمی‌شود.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          کوکی‌ها و نشست‌ها
        </h2>
        <p>
          برای حفظ وضعیت ورود شما از کوکی‌های ضروری نشست استفاده می‌شود. این کوکی‌ها برای
          کارکرد سایت لازم‌اند و شامل ردیابی تبلیغاتی نیستند.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          نگهداری و امنیت
        </h2>
        <p>
          داده‌ها در زیرساخت ابری امن با رمزنگاری در حین انتقال (HTTPS) نگهداری می‌شوند و
          دسترسی به آن‌ها با سیاست‌های سطح‌بندی‌شده (RLS) محدود شده است. در صورت درخواست حذف
          حساب، داده‌های شخصی شما حذف خواهد شد.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          تماس
        </h2>
        <p>
          برای هر پرسش دربارهٔ حریم خصوصی یا درخواست حذف داده، از طریق بخش تماس سایت یا
          شبکه‌های اجتماعی رسمی با ما در ارتباط باشید.
        </p>
      </section>
    </article>
  );
}
