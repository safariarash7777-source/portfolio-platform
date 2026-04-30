import Link from "next/link";
import Logo from "../ui/Logo";

const FOOTER_GROUPS = [
  {
    title: "محصول",
    links: [
      { href: "/#features", label: "خدمات و امکانات" },
      { href: "/#pricing",  label: "تعرفه‌ها" },
      { href: "/dashboard", label: "داشبورد کاربری" },
    ],
  },
  {
    title: "منابع",
    links: [
      { href: "/#faq",  label: "سؤالات متداول" },
      { href: "#",      label: "وبلاگ" },
      { href: "#",      label: "راهنمای سرمایه‌گذاری" },
    ],
  },
  {
    title: "حقوقی",
    links: [
      { href: "#", label: "حریم خصوصی" },
      { href: "#", label: "شرایط استفاده" },
      { href: "#", label: "سلب مسئولیت" },
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
              تحلیل علمی پروفایل ریسک و طراحی سبد سرمایه‌گذاری اختصاصی برای بازار سرمایه ایران.
            </p>
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
            © ۱۴۰۴ آرش صفری — تمامی حقوق محفوظ است.
          </p>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری · Investment Analyst &amp; Advisor
          </p>
        </div>
      </div>
    </footer>
  );
}
