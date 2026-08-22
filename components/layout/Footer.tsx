import Link from "next/link";
import { Instagram, Send } from "lucide-react";
import Logo from "../ui/Logo";
import { PLATFORM_META } from "@/lib/content-hub";

/**
 * فوتر — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * اصلاحِ باگِ واقعی: سه لینکِ شبکهٔ اجتماعی دستگیرهٔ **حدسی** بودند و با
 * `lib/content-hub.ts` — که خودش را «منبعِ واحدِ حقیقت» اعلام می‌کند — نمی‌خواندند:
 *   t.me/arashsafari ✗ در برابر t.me/arashsafariiiiiiii ✓
 *   instagram.com/arashsafari ✗ در برابر instagram.com/arash_safariiiiiii/ ✓
 *   linkedin.com/in/arashsafari ✗ — هیچ‌جای مخزن تأیید نشده ⇒ حذف شد
 * حالا مستقیم از `PLATFORM_META` خوانده می‌شود تا دوباره واگرا نشود.
 *
 * بقیهٔ تغییرات: خطِ هویت دو بار تکرار شده بود (یکی شد) · لینکِ `/#faq` حذف شد
 * (سکشنِ FAQ حذف شده) · جعبهٔ سلبِ مسئولیت به یک بندِ ساده تبدیل شد.
 *
 * مسیرهای بازار عمداً همگی اینجا مانده‌اند: چون از ناوبری برداشته شدند، این
 * فوتر تنها ورودیِ سراسریِ آن‌هاست و حذفشان به SEO آسیب می‌زد.
 */
const PREVIEW_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  : null;
const IS_PRODUCTION = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

const SOCIAL = [
  { href: PLATFORM_META.telegram.followUrl, label: PLATFORM_META.telegram.label, icon: Send },
  { href: PLATFORM_META.instagram.followUrl, label: PLATFORM_META.instagram.label, icon: Instagram },
].filter((s): s is { href: string; label: string; icon: typeof Send } => Boolean(s.href));

const GROUPS = [
  {
    title: "بازارها",
    links: [
      { href: "/market", label: "رصد بازار" },
      { href: "/market/map", label: "نقشهٔ بازار" },
      { href: "/market/funds", label: "صندوق‌ها" },
      { href: "/market/stocks", label: "تابلوی سهام" },
      { href: "/market/options", label: "اختیار معامله" },
      { href: "/codal", label: "کدال" },
      { href: "/data", label: "بانک داده" },
    ],
  },
  {
    title: "تحلیل‌ها",
    links: [
      { href: "/analyses", label: "کارنامه" },
      { href: "/notes", label: "یادداشت روزانه" },
      { href: "/insights", label: "تحلیل‌های اجتماعی" },
      { href: "/learn/glossary", label: "واژه‌نامهٔ مالی" },
    ],
  },
  {
    title: "محصولات",
    links: [
      { href: "/webinars", label: "وبینار" },
      { href: "/#waitlist", label: "مشاورهٔ اختصاصی" },
    ],
  },
  {
    title: "درباره و قوانین",
    links: [
      { href: "/about", label: "دربارهٔ آرش صفری" },
      { href: "/legal/privacy", label: "حریم خصوصی" },
      { href: "/legal/terms", label: "شرایط استفاده" },
      { href: "/legal/disclaimer", label: "سلب مسئولیت" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            {/* عنوانِ حرفه‌ای را خودِ Logo رندر می‌کند — تکرارش اینجا حذف شد. */}
            <Logo size={44} showText textVariant="navy" />
            {SOCIAL.length > 0 && (
              <div className="mt-6 flex items-center gap-2">
                {SOCIAL.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    title={s.label}
                    className="flex items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--surface-2)]"
                    style={{
                      width: 44,
                      height: 44,
                      border: "1px solid var(--line)",
                      color: "var(--text-2)",
                    }}
                  >
                    <s.icon size={18} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>

          {GROUPS.map((g) => (
            <div key={g.title}>
              <h4 className="font-display mb-4 text-sm font-bold" style={{ color: "var(--heading)" }}>
                {g.title}
              </h4>
              <ul className="flex flex-col">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex items-center text-sm transition-colors hover:underline"
                      style={{ color: "var(--text-2)", minHeight: 44 }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-3)", lineHeight: 1.9 }}>
            سرمایه‌گذاری در بازارهای مالی با ریسکِ از دست رفتنِ اصلِ سرمایه همراه است.
            هیچ بازدهی تضمین نمی‌شود و مسئولیتِ تصمیمِ نهایی با خودِ سرمایه‌گذار است.
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* بدونِ whitespace-nowrap: ظرفِ بیرونی flex-shrink-0 است و خودش
                نگهش می‌دارد؛ nowrap فقط یک خطرِ سرریزِ بی‌فایده اضافه می‌کرد. */}
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              © ۱۴۰۵ آرش صفری
            </p>
            {PREVIEW_SHA && !IS_PRODUCTION && (
              <a
                href={`https://github.com/safariarash7777-source/portfolio-platform/commit/${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded px-2 py-0.5 font-mono text-xs"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-3)" }}
                title="Preview build — نسخهٔ آزمایشی، نه Production"
              >
                preview · {PREVIEW_SHA}
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
