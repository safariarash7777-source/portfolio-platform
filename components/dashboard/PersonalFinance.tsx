import Link from "next/link";
import ReadError from "@/components/dashboard/ReadError";
import { formatJalali, toPersianDigits } from "@/lib/format";

/** Display-only state from the existing canonical readers, never a saved model. */
export interface MemberFinanceSummary {
  assetsState: "ready" | "empty" | "error";
  version: number | null;
  recordedAt: string | null;
  assetCount: number | null;
  debtsState: "ready" | "empty" | "error";
  debtCount: number | null;
  scopeState: "confirmed" | "unconfirmed" | "empty" | "error";
  targetState: "ready" | "empty" | "error";
}


export default function PersonalFinance({ summary }: { summary?: MemberFinanceSummary }) {
  const assetsFailed = !summary || summary.assetsState === "error";
  return <section aria-label="وضعیت مالی شخصی" className="card-elevated p-5 md:p-6 mb-8 space-y-5">
    <div>
      <span className="eyebrow">پروندهٔ مالی شما</span>
      <h2 className="font-display text-xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>دارایی، بدهی و سبد من</h2>
      <p className="text-sm leading-7 mt-2" style={{ color: "var(--text-2)" }}>این وضعیت از آخرین ثبت نسخه‌دار همین حساب خوانده می‌شود. ثبت چند قلم به معنی کامل‌بودن اطلاعات مالی یا تأیید ارزش کل ثروت شما نیست.</p>
      {summary?.assetsState === "ready" && <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>نسخهٔ {toPersianDigits(summary.version!)}{summary.recordedAt && ` · ثبت در ${formatJalali(summary.recordedAt)}`}</p>}
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card p-4 space-y-3">
        <h3 className="font-bold">دارایی‌های من</h3>
        {assetsFailed ? <ReadError label="ثبت‌های دارایی" code="MEMBER_ASSETS" /> : <p className="text-sm leading-7">{summary.assetsState === "empty" ? "هنوز نسخه‌ای از دارایی‌ها ثبت نکرده‌اید." : `${toPersianDigits(summary.assetCount!)} قلم در آخرین نسخه ثبت شده است.`}</p>}
        <Link href="/dashboard/holdings" className="btn btn-outline min-h-11 w-full">مشاهده و ثبت دارایی</Link>
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="font-bold">بدهی‌های من</h3>
        {!summary || summary.debtsState === "error" ? <ReadError label="بدهی‌های این نسخه" code="MEMBER_DEBTS" /> : <p className="text-sm leading-7">{summary.debtsState === "empty" ? "پس از اولین ثبت دارایی، بدهی‌های همان نسخه را ثبت کنید." : summary.debtCount === 0 ? "بدهی‌ای در این نسخه ثبت نشده است؛ این به معنی نداشتن بدهی نیست." : `${toPersianDigits(summary.debtCount!)} بدهی در این نسخه ثبت شده است.`}</p>}
        <Link href="/dashboard/holdings" className="btn btn-outline min-h-11 w-full">مشاهده و ثبت بدهی</Link>
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="font-bold">سبد سرمایه‌گذاری من</h3>
        {!summary || summary.scopeState === "error" ? <ReadError label="محدودهٔ سبد این نسخه" code="MEMBER_SCOPE" /> : <p className="text-sm leading-7">{summary.scopeState === "empty" ? "برای تعیین اقلام سبد، ابتدا دارایی‌ها را ثبت کنید." : summary.scopeState === "confirmed" ? "محدودهٔ سرمایه‌گذاری این نسخه تأیید شده است." : "محدودهٔ سرمایه‌گذاری این نسخه هنوز تأیید نشده است."}</p>}
        {!summary || summary.targetState === "error" ? <ReadError label="هدف ثبت‌شدهٔ سبد" code="MEMBER_TARGET" /> : <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>{summary.targetState === "ready" ? "هدف ثبت‌شدهٔ حساب موجود است؛ مقایسه به اطلاعات معتبر نیاز دارد." : "هنوز هدفی در ثبت‌های نسخه‌دار حساب موجود نیست."}</p>}
        <Link href="/dashboard/holdings" className="btn btn-outline min-h-11 w-full">بررسی محدودهٔ سبد</Link>
      </div>
    </div>
    <div className="card p-4 space-y-3">
      <h3 className="font-bold">درآمد، هزینه و جریان نقد</h3>
      <p className="text-sm leading-7">دفتر مستقلِ برنامه و واقعیت برای حساب‌ها و دورهٔ انتخابی شما؛ نبود ثبت، درآمد یا هزینهٔ صفر را تأیید نمی‌کند. دارایی و قسط خودکار به این دفتر منتقل نمی‌شوند.</p>
      <Link href="/dashboard/cashflow" className="btn btn-outline min-h-11">بازکردن دفتر جریان نقد</Link>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-4 space-y-3">
        <h3 className="font-bold">بودجهٔ دوره</h3>
        <p className="text-sm leading-7">برنامهٔ درآمد و هزینه را با ثبت‌های واقعی همان دوره و حساب‌ها مقایسه کنید. دسته‌های هزینه از همان دفتر جریان نقد خوانده می‌شوند.</p>
        <Link href="/dashboard/cashflow#period-budget" className="btn btn-outline min-h-11">بررسی بودجه و هزینه‌ها</Link>
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="font-bold">هدف‌های مالی من</h3>
        <p className="text-sm leading-7">برای پس‌انداز خود مبلغ و موعد تعیین کنید؛ مقدار کنارگذاشته‌شده را همراه منبع ثبت و پیشرفت هدف را پیگیری کنید.</p>
        <Link href="/dashboard/goals" className="btn btn-outline min-h-11">ثبت و پیگیری هدف مالی</Link>
      </div>
    </div>
    <div className="card p-4 space-y-3">
      <h3 className="font-bold">پروندهٔ مشاوره و پیگیری</h3>
      <p className="text-sm leading-7">دسترسی مشاور به پرونده را خودتان فعال یا لغو کنید؛ نسخهٔ منتشرشده برای شما و اقدام بعدی را ببینید و پرسش خود را برای مشاور ثبت کنید.</p>
      <Link href="/dashboard/consultation" className="btn btn-outline min-h-11">بازکردن پروندهٔ مشاوره</Link>
    </div>
    <p className="text-xs leading-7" style={{ color: "var(--text-3)" }}>مسیرهای دارایی، بدهی و سبد در صفحهٔ دارایی و بدهی باز می‌شوند؛ دفتر جریان نقد دوره و نسخه‌های مستقل دارد. مبلغ یا بازدهی از سوابق قبلی به این ثبت‌ها اضافه نمی‌شود.</p>
  </section>;
}
