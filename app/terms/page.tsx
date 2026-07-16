import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata = {
  title: "شرایط استفاده",
  description: "قواعد استفاده از پلتفرم، حساب کاربری و سطوح دسترسی.",
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--navy-deep)" }}>
            شرایط استفاده
          </h1>
          <div className="mt-6 space-y-5 text-sm leading-8 text-justify" style={{ color: "var(--text-2)" }}>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>ماهیت خدمات:</strong>{" "}
              این پلتفرم ابزار اطلاع‌رسانی و پشتیبان تصمیم است؛ امکان ثبت سفارش یا انجام معامله
              ندارد و هیچ محتوایی در آن توصیهٔ خرید یا فروش نیست. جزئیات در صفحهٔ{" "}
              <a href="/disclaimer" className="underline">سلب مسئولیت</a> آمده است.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>حساب کاربری:</strong>{" "}
              مسئولیت حفاظت از اطلاعات ورود و فعالیت‌های انجام‌شده با حساب، بر عهدهٔ دارندهٔ حساب
              است. ثبت اطلاعات خلاف واقع یا استفاده از حساب دیگران مجاز نیست.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>سطوح دسترسی:</strong>{" "}
              بخش‌های عمومی سایت بدون ثبت‌نام در دسترس‌اند. برخی امکانات (داشبورد، واچ‌لیست، هشدار)
              نیازمند ثبت‌نام‌اند و امکانات تحلیلی پیشرفته (ترمینال) برای مشتریان مشاوره و
              شرکت‌کنندگان وبینار در بازهٔ مشخص فعال می‌شود. مدت و شرایط هر دسترسی هنگام اعطا
              اعلام می‌شود.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>پرداخت‌ها:</strong>{" "}
              پرداخت‌ها از طریق درگاه مجاز انجام می‌شود. در صورت لغو رویداد (مانند وبینار) از سوی
              برگزارکننده، وجه پرداختی مسترد می‌گردد.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>مالکیت محتوا:</strong>{" "}
              محتوای تحلیلی، متن‌ها و ساختار این سایت متعلق به پدیدآورنده است؛ استفادهٔ غیرتجاری با
              ذکر منبع آزاد است و بازنشر تجاری نیازمند اجازهٔ کتبی است.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>تغییرات:</strong>{" "}
              این شرایط ممکن است به‌روزرسانی شود؛ نسخهٔ جاری همیشه در همین صفحه در دسترس است و
              ادامهٔ استفاده از سایت به معنای پذیرش نسخهٔ جاری است.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
