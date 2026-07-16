import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "شرایط استفاده | قطب‌نمای بازار",
  description: "شرایط استفاده از خدمات پلتفرم قطب‌نمای بازار",
};

export default function TermsPage() {
  return (
    <article className="leading-8 text-justify" style={{ color: "var(--text)" }}>
      <h1 className="font-display text-3xl font-bold mb-8" style={{ color: "var(--navy-deep)" }}>
        شرایط استفاده
      </h1>

      <section className="flex flex-col gap-5 text-sm">
        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۱. پذیرش شرایط
        </h2>
        <p>
          با استفاده از این وب‌سایت و خدمات آن، شما این شرایط را می‌پذیرید. اگر با بخشی از این
          شرایط موافق نیستید، لطفاً از خدمات استفاده نکنید.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۲. ماهیت خدمات
        </h2>
        <p>
          این پلتفرم ابزار پشتیبانی از تصمیم‌گیری است؛ داده، نمودار و چارچوب تحلیلی ارائه می‌کند
          و توصیهٔ خرید یا فروش نیست. سطح‌های دسترسی (بازدیدکننده، ثبت‌نامی، دسترسی کامل از طریق
          مشاوره یا وبینار) طبق توضیحات هر محصول اعمال می‌شود و مدت دسترسی کامل در زمان خرید
          مشخص است.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۳. حساب کاربری
        </h2>
        <p>
          مسئولیت حفظ محرمانگی اطلاعات ورود بر عهدهٔ کاربر است. اشتراک‌گذاری حساب دارای دسترسی
          کامل با دیگران مجاز نیست و می‌تواند به تعلیق دسترسی منجر شود.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۴. مالکیت محتوا و استفادهٔ مجاز از داده
        </h2>
        <p>
          محتوای تحلیلی، کارت‌های امتیاز و چارچوب‌های محاسباتی متعلق به این پلتفرم است.
          داده‌های خام قابل دانلود (CSV) برای استفادهٔ شخصی و پژوهشی آزاد است؛ بازنشر انبوه یا
          تجاری بدون ذکر منبع مجاز نیست.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۵. پرداخت و بازپرداخت
        </h2>
        <p>
          پرداخت‌ها از طریق درگاه معتبر انجام می‌شود. شرایط بازپرداخت هر محصول (وبینار یا
          مشاوره) در صفحهٔ همان محصول اعلام می‌شود.
        </p>

        <h2 className="font-bold text-base mt-2" style={{ color: "var(--navy-deep)" }}>
          ۶. تغییرات
        </h2>
        <p>
          این شرایط ممکن است به‌روزرسانی شود؛ نسخهٔ جاری همیشه در همین صفحه در دسترس است و
          ادامهٔ استفاده به معنای پذیرش نسخهٔ جدید است.
        </p>
      </section>
    </article>
  );
}
