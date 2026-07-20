import Link from "next/link";
import { Instagram, Send, Linkedin } from "lucide-react";
import Logo from "../ui/Logo";

const SOCIAL_LINKS = [
  { href: "https://instagram.com/arashsafari",   label: "اینستاگرام", icon: <Instagram size={18} /> },
  { href: "https://t.me/arashsafari",            label: "تلگرام",     icon: <Send size={18} /> },
  { href: "https://linkedin.com/in/arashsafari", label: "لینکدین",    icon: <Linkedin size={18} /> },
];

// گروه‌های فوتر هم‌راستا با ناوبری ۵-ناحیه‌ای (WP-A)
const FOOTER_GROUPS = [
  {
    title: "بازار و نماد",
    links: [
      { href: "/market",        label: "رصد بازار" },
      { href: "/market/map",    label: "نقشهٔ بازار" },
      { href: "/market/funds",  label: "صندوق‌ها" },
      { href: "/market/stocks", label: "تابلوی سهام" },
      { href: "/data",          label: "بانک داده" },
      { href: "/codal",         label: "فید اطلاعیه‌های کدال" },
    ],
  },
  {
    title: "تحلیل و یادگیری",
    links: [
      { href: "/analyses",  label: "کارنامهٔ قابل راستی‌آزمایی" },
      { href: "/insights",  label: "تحلیل‌های اجتماعی" },
      { href: "/notes",     label: "یادداشت روزانه" },
      { href: "/webinars",  label: "وبینار فصلی" },
      { href: "/#faq",      label: "سؤالات متداول" },
      { href: "/terminal",  label: "ترمینال تحلیلگر" },
      { href: "/dashboard", label: "داشبورد کاربری" },
    ],
  },
  {
    title: "حقوقی",
    links: [
      { href: "/legal/privacy",    label: "حریم خصوصی" },
      { href: "/legal/terms",      label: "شرایط استفاده" },
      { href: "/legal/disclaimer", label: "سلب مسئولیت" },
    ],
  },
];

export default function Footer() {
  return (
    <footer
      className="mt-16 border-t"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        {/* Top: brand + link groups */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-1">
            <Logo size={48} showText textVariant="navy" />
            <p
              className="mt-5 text-sm leading-7"
              style={{ color: "var(--text-2)" }}
            >
              تحلیل علمی، پروفایل ریسک و طراحی سبد سرمایه‌گذاری اختصاصی
            </p>

            <div className="mt-5 flex items-center gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
                  style={{
                    width: 36,
                    height: 36,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    color: "var(--text-2)",
                  }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {FOOTER_GROUPS.map((g) => (
            <div key={g.title}>
              <h4
                className="font-display mb-4 text-sm font-bold"
                style={{ color: "var(--navy-deep)" }}
              >
                {g.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm transition-colors hover:underline"
                      style={{ color: "var(--text-2)" }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div
          className="rounded-xl p-5 mb-8 text-xs leading-7 text-justify"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            color: "var(--text-2)",
          }}
        >
          <strong style={{ color: "var(--navy-deep)" }}>سلب مسئولیت رسمی: </strong>
          این پلتفرم صرفاً ابزاری برای پشتیبانی از تصمیم‌گیری مالی است. هیچ‌گونه تضمینی برای کسب سود وجود ندارد و سرمایه‌گذاری در بازارهای مالی همواره با ریسک از دست رفتن اصل سرمایه همراه است. مسئولیت نهایی تمامی تصمیمات سرمایه‌گذاری بر عهده خود کاربر است.
        </div>

        {/* Bottom row */}
        <div
          className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            © ۱۴۰۵ آرش صفری — تمامی حقوق محفوظ است.
          </p>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری · Investment Analyst &amp; Advisor
          </p>
        </div>
      </div>
    </footer>
  );
}
