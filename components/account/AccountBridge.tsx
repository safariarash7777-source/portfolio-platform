/**
 * پلِ حساب — مسیرِ رفت‌وبرگشتِ روشن بینِ صفحه‌های بازار و حسابِ کاربر.
 *
 * ── چرا وجود دارد ──────────────────────────────────────────────────────────
 * صفحه‌های بازار و حسابِ کاربری تا امروز دو جزیره بودند: کاربری که میزِ بازار
 * را می‌دید راهی به داشبوردش نداشت، و کاربری که در داشبورد بود نمی‌دانست
 * همین حالا چه چیزی روی میز است. این کامپوننت همان یک قدمِ گم‌شده است.
 *
 * ── چه چیزی را عوض نمی‌کند ────────────────────────────────────────────────
 * هیچ. فقط `getAccess()` را **می‌خواند** و لینک نشان می‌دهد. هیچ دسترسی‌ای
 * نمی‌دهد، هیچ سطحی را تغییر نمی‌دهد، و هیچ مسیرِ پرداختی را دست نمی‌زند —
 * گیتِ واقعی همچنان `middleware.ts` و `getAccess()` است.
 */
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import type { AccessInfo } from "@/lib/access";
import { formatJalali } from "@/lib/format";

/**
 * متنِ زیرِ عنوان — از `access.standing` که **سرور** حساب کرده، نه از حدسِ UI.
 *
 * پیش از این، «دسترسی‌اش منقضی شده» و «هیچ‌وقت نداشته» هر دو `registered` با
 * `via: null` بودند و همین یک جمله را می‌گرفتند. کسی که اشتراکش دیروز تمام
 * شده نباید پیامِ خوشامدِ کاربرِ تازه ببیند.
 *
 * `standing === null` یعنی سرور **نتوانست** بفهمد. آنجا عمداً هیچ ادعایی
 * دربارهٔ سابقهٔ کاربر نمی‌کنیم — جملهٔ خنثی، نه حدس.
 */
function subtitle(access: AccessInfo): string {
  if (access.level === "full") {
    return access.expiresAt
      ? `دسترسی کامل فعال است · تا ${formatJalali(access.expiresAt, false)}`
      : "دسترسی کامل فعال است.";
  }
  if (access.level === "visitor") {
    return "واچ‌لیست، یادداشت و پیگیریِ نمادها به حسابِ شما گره می‌خورد.";
  }
  switch (access.standing) {
    case "expired":
      return access.standingSince
        ? `دورهٔ دسترسیِ شما در ${formatJalali(access.standingSince, false)} به پایان رسیده است.`
        : "دورهٔ دسترسیِ شما به پایان رسیده است.";
    case "revoked":
      return "دسترسیِ شما لغو شده است. برای پیگیری با پشتیبانی تماس بگیرید.";
    case "scheduled":
      return access.standingSince
        ? `دسترسیِ شما ثبت شده و از ${formatJalali(access.standingSince, false)} فعال می‌شود.`
        : "دسترسیِ شما ثبت شده و هنوز شروع نشده است.";
    case "never":
      return "واچ‌لیست و یادداشت‌های شما در داشبورد نگه داشته می‌شود.";
    default:
      // `null` — وضعیت خوانده نشد. هیچ ادعایی دربارهٔ سابقه نمی‌کنیم.
      return "واچ‌لیست و یادداشت‌های شما در داشبورد نگه داشته می‌شود.";
  }
}

export default function AccountBridge({
  access,
  backTo,
}: {
  access: AccessInfo;
  /** اگر داده شود، یک راهِ برگشت به همان صفحه‌ای که کاربر از آن آمده نشان می‌دهد. */
  backTo?: { href: string; label: string };
}) {
  const signedIn = access.level !== "visitor";

  return (
    <section
      className="card px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
      aria-label="مسیرِ حسابِ کاربری"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
          {signedIn ? "حسابِ شما" : "با حساب، این صفحه‌ها به هم وصل می‌شوند"}
        </p>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
          {subtitle(access)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {backTo ? (
          <Link
            href={backTo.href}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-3 py-2 transition-colors"
            style={{ color: "var(--navy)", background: "var(--surface-2)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
            {backTo.label}
          </Link>
        ) : null}

        {signedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-lg px-3.5 py-2 transition-colors"
            style={{ background: "var(--navy)", color: "var(--text-on-navy)", boxShadow: "var(--shadow-sm)" }}
          >
            <LayoutDashboard size={15} strokeWidth={2.2} aria-hidden />
            داشبورد من
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-3 py-2 transition-colors"
              style={{ color: "var(--navy)", background: "var(--surface-2)" }}
            >
              <LogIn size={15} strokeWidth={2.2} aria-hidden />
              ورود
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-lg px-3.5 py-2 transition-colors"
              style={{ background: "var(--navy)", color: "var(--text-on-navy)", boxShadow: "var(--shadow-sm)" }}
            >
              <UserPlus size={15} strokeWidth={2.2} aria-hidden />
              ساختِ حساب
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
