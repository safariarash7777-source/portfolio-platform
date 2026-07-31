import DeskBoard from "@/components/admin/DeskBoard";

export const metadata = {
  title: "میزِ آرش | پنل مدیریت",
  robots: { index: false, follow: false },
};

// دسترسی در `app/(protected)/admin/layout.tsx` گیت می‌شود (نقشِ admin از
// `profiles.role`)؛ خودِ `/api/admin/desk` هم مستقلاً همان بررسی را تکرار
// می‌کند تا نما و داده هر کدام جداگانه محافظت شوند.
export const dynamic = "force-dynamic";

export default function AdminDeskPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          میزِ آرش
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          یک صفحه برای دیدنِ وضعیتِ روز. میز <strong>لایهٔ تجمیع است، نه موتورِ تازه</strong> —
          هیچ محاسبه‌ای اینجا انجام نمی‌شود و هر بخش می‌گوید از کدام داراییِ موجود می‌خوانَد.
          داشبوردهای فعلی (رادار، ارز، ترمینال، کدال، پرتفوی، کارنامه، محتوا) سرِ جایشان‌اند؛
          میز رویشان می‌نشیند، جایشان را نمی‌گیرد.
        </p>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-6" style={{ color: "var(--text-3)" }}>
          چهار حالت داریم و <strong>«خالی» با «در دسترس نیست» یکی نیست</strong>: منبعی که هست و
          رکوردی ندارد یک واقعیتِ معتبر است؛ منبعی که اصلاً نمی‌توانیم بپرسیم، دربارهٔ واقعیت
          هیچ نمی‌گوید. ادغامِ این دو همان اشتباهی است که تا امروز سه بار شاخص‌های این پروژه را
          بی‌فایده کرد.
        </p>
        <p
          className="mt-2 max-w-2xl rounded-lg px-3 py-2 text-[12px] leading-6"
          style={{ background: "var(--gold-tint)", color: "var(--text-2)" }}
        >
          ⚠️ این صفحه <strong>داخلی</strong> است و هیچ چیزی از آن به‌صورتِ خودکار عمومی نمی‌شود.
          پیش‌نویسِ روزانه پیش‌نویس می‌مانَد تا انسان تأیید کند (<code>DD-023</code>). بخش‌هایی که
          «در دسترس نیست» نشان می‌دهند منتظرِ اجرای migration مربوطه‌اند — و تا آن زمان
          <strong> عددِ جایگزین ساخته نمی‌شود</strong>.
        </p>
      </div>
      <DeskBoard />
    </div>
  );
}
