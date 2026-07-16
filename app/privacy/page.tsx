import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata = {
  title: "حریم خصوصی",
  description: "چه داده‌ای نگه می‌داریم، چرا، و چه چیزی را هرگز ذخیره نمی‌کنیم.",
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--navy-deep)" }}>
            حریم خصوصی
          </h1>
          <div className="mt-6 space-y-5 text-sm leading-8 text-justify" style={{ color: "var(--text-2)" }}>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>چه داده‌ای نگه می‌داریم:</strong>{" "}
              نشانی ایمیل و اطلاعات حساب کاربری؛ پاسخ‌های پرسش‌نامهٔ ریسک؛ اطلاعاتی که خودتان در
              داشبورد ثبت می‌کنید (مانند دارایی‌ها و تراکنش‌های سبد)؛ واچ‌لیست و هشدارهای قیمتی؛ و
              سوابق ثبت‌نام و پرداخت وبینارها. این داده‌ها فقط برای ارائهٔ همان خدمات استفاده می‌شوند.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>چه چیزی را ذخیره نمی‌کنیم:</strong>{" "}
              اطلاعات کارت بانکی شما نزد ما نگهداری نمی‌شود؛ پرداخت‌ها به‌طور کامل از طریق درگاه
              پرداخت مجاز (زرین‌پال) انجام می‌شود و ما فقط نتیجهٔ تراکنش (موفق/ناموفق و کد پیگیری)
              را دریافت می‌کنیم.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>اشتراک‌گذاری با اشخاص ثالث:</strong>{" "}
              دادهٔ شخصی شما فروخته یا اجاره داده نمی‌شود و جز در موارد الزام قانونی در اختیار شخص
              ثالث قرار نمی‌گیرد. اتصال اختیاری حساب تلگرام صرفاً برای دریافت اعلان‌هاست و هر زمان
              قابل قطع است.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>کوکی‌ها:</strong>{" "}
              فقط برای ورود امن به حساب و نگهداری نشست استفاده می‌شوند، نه برای ردیابی تبلیغاتی.
            </p>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>حذف حساب:</strong>{" "}
              برای حذف حساب و داده‌های شخصی مرتبط، از طریق ایمیل پشتیبانی درخواست دهید تا مطابق
              قوانین جاری انجام شود.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
