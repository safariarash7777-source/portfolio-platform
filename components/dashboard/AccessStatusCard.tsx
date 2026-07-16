// کارت وضعیت دسترسی در داشبورد — سند مانیتایز (فاز ۱۱).
// registered: دو مسیر ارتقا (وبینار فصلی / مشاوره) + لینک ترمینال قفل‌شده
// full: نمایش نوع دسترسی و تاریخ انقضا + لینک مستقیم ترمینال
import Link from "next/link";
import type { AccessInfo } from "@/lib/access";
import { formatJalali, toPersianDigits } from "@/lib/format";

const VIA_LABEL: Record<string, string> = {
  admin: "مدیر سامانه",
  consulting: "مشتری مشاوره",
  webinar: "شرکت‌کنندهٔ وبینار",
  manual: "اعطای ویژه",
};

export default function AccessStatusCard({ access }: { access: AccessInfo }) {
  if (access.level === "full") {
    return (
      <section
        className="card p-5"
        style={{ borderInlineStart: "none" }}
        aria-label="وضعیت دسترسی"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              سطح دسترسی
            </p>
            <p className="mt-1 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
              دسترسی کامل — {VIA_LABEL[access.via ?? ""] ?? access.via}
            </p>
            {access.expiresAt ? (
              <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                اعتبار تا {formatJalali(access.expiresAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/terminal"
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--navy)", color: "var(--text-on-navy)" }}
            >
              ترمینال تحلیلگر
            </Link>
            <Link
              href="/data"
              className="btn-outline rounded-full border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--line-strong)", color: "var(--navy)" }}
            >
              بانک دادهٔ بازار
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // registered — مسیرهای ارتقا
  return (
    <section className="card p-5" aria-label="وضعیت دسترسی">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        سطح دسترسی
      </p>
      <p className="mt-1 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
        کاربر ثبت‌نام‌شده
      </p>
      <p className="mt-2 text-sm leading-7" style={{ color: "var(--text-2)" }}>
        برای دسترسی کامل به ترمینال تحلیلگر (کارت امتیاز نمادها، بازهٔ ارزش‌گذاری، جریان پول
        هوشمند و ابزارهای کوانت) یکی از دو مسیر زیر را انتخاب کنید:
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--surface-2, var(--surface))" }}
        >
          <p className="font-semibold" style={{ color: "var(--navy-deep)" }}>
            وبینار فصلی
          </p>
          <p className="mt-1 text-xs leading-6" style={{ color: "var(--text-2)" }}>
            هر {toPersianDigits("3")} ماه یک‌بار برگزار می‌شود؛ شرکت‌کنندگان تا وبینار بعدی
            دسترسی کامل + عضویت کانال دارند.
          </p>
          <Link
            href="/#waitlist"
            className="mt-3 inline-block rounded-full px-4 py-1.5 text-xs font-semibold"
            style={{ background: "var(--gold)", color: "var(--text-on-gold)" }}
          >
            ثبت‌نام وبینار بعدی
          </Link>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--surface-2, var(--surface))" }}
        >
          <p className="font-semibold" style={{ color: "var(--navy-deep)" }}>
            مشاورهٔ اختصاصی
          </p>
          <p className="mt-1 text-xs leading-6" style={{ color: "var(--text-2)" }}>
            مشتریان مشاوره {toPersianDigits("3")} ماه دسترسی کامل به همهٔ ابزارهای تحلیلی
            دریافت می‌کنند.
          </p>
          <Link
            href="/#features"
            className="mt-3 inline-block rounded-full border px-4 py-1.5 text-xs font-semibold"
            style={{ borderColor: "var(--line-strong)", color: "var(--navy)" }}
          >
            درخواست مشاوره
          </Link>
        </div>
      </div>
    </section>
  );
}
