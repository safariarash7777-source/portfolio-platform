import HealthBoard from "@/components/admin/HealthBoard";

export const metadata = {
  title: "سلامتِ سامانه | پنل مدیریت",
  robots: { index: false, follow: false },
};

// دسترسی در `app/(protected)/admin/layout.tsx` گیت می‌شود (نقشِ admin از
// `profiles.role`)؛ خودِ API هم مستقلاً همان بررسی را تکرار می‌کند تا نما و
// داده هر کدام جداگانه محافظت شوند.
export const dynamic = "force-dynamic";

export default function AdminHealthPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          سلامتِ سامانه
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          وضعیتِ عملیاتیِ زنده. چهار حالت داریم و <strong>«نامعلوم» با «خراب» یکی نیست</strong> —
          شاخصی که منبعش وجود ندارد نه سالم است نه خراب، و پنهان‌کردنش زیرِ یکی از آن دو
          باعث می‌شود یا هشدارِ کاذب بگیریم یا خرابیِ واقعی را نبینیم.
        </p>
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-3)" }}>
          این صفحه هیچ سکرت، توکن، آدرسِ دیتابیس یا دادهٔ شخصیِ کاربر نشان نمی‌دهد؛ از
          متغیرهای محیطی فقط <strong>حاضر/غایب</strong> گزارش می‌شود.
        </p>
      </div>
      <HealthBoard />
    </div>
  );
}
