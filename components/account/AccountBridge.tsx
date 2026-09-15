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
import { accountEntryHref, normalizeReturnPath } from "./returnPath";
import { accountSubtitle } from "./accountSubtitle";

export default function AccountBridge({
  access,
  backTo,
  returnTo = "/market",
}: {
  access: AccessInfo;
  /** اگر داده شود، یک راهِ برگشت به همان صفحه‌ای که کاربر از آن آمده نشان می‌دهد. */
  backTo?: { href: string; label: string };
  /** مقصد امنی که پس از ورود باید حفظ شود. فقط مسیر محلی پذیرفته می‌شود. */
  returnTo?: string;
}) {
  const signedIn = access.level !== "visitor";
  const safeReturnTo = normalizeReturnPath(returnTo, "/market");

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
          {accountSubtitle(access)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {backTo ? (
          <Link
            href={backTo.href}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={{ color: "var(--navy-ink)", background: "var(--surface-2)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
            {backTo.label}
          </Link>
        ) : null}

        {signedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={{ background: "var(--navy)", color: "var(--text-on-navy)", boxShadow: "var(--shadow-sm)" }}
          >
            <LayoutDashboard size={15} strokeWidth={2.2} aria-hidden />
            داشبورد من
          </Link>
        ) : (
          <>
            <Link
              href={accountEntryHref("/login", safeReturnTo)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
              style={{ color: "var(--navy-ink)", background: "var(--surface-2)" }}
            >
              <LogIn size={15} strokeWidth={2.2} aria-hidden />
              ورود
            </Link>
            <Link
              href={accountEntryHref("/register", safeReturnTo)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
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
