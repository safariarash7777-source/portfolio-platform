import Link from "next/link";
import Image from "next/image";

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
      className="mt-16 relative overflow-hidden"
      style={{ background: "var(--navy-deep)", color: "rgba(255,255,255,0.72)" }}
    >
      {/* Brand gold glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-160px", left: "-120px", width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,208,122,0.08) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-14">
        {/* Top: brand + link groups */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-1">
            {/* Logo in a cream chip so the navy mark stays visible */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 52, height: 52, background: "#fff" }}
              >
                <Image src="/logo.png" alt="نشان آرش صفری" width={40} height={40} className="object-contain" />
              </div>
              <div className="leading-tight">
                <div className="font-display font-bold" style={{ color: "#fff", fontSize: 18 }}>
                  آرش صفری
                </div>
                <div style={{ color: "var(--gold-soft)", fontSize: 12, marginTop: 2 }}>
                  تحلیلگر و مشاور سرمایه‌گذاری
                </div>
              </div>
            </div>
            <p className="mt-5 text-sm leading-7" style={{ color: "rgba(255,255,255,0.6)" }}>
              تحلیل علمی، پروفایل ریسک و طراحی سبد سرمایه‌گذاری اختصاصی
            </p>
          </div>

          {FOOTER_GROUPS.map((g) => (
            <div key={g.title}>
              <h4 className="font-display mb-4 text-sm font-bold" style={{ color: "#fff" }}>
                {g.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm transition-colors hover:text-[color:var(--gold-soft)]"
                      style={{ color: "rgba(255,255,255,0.7)" }}
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
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <strong style={{ color: "var(--gold-soft)" }}>سلب مسئولیت رسمی: </strong>
          این پلتفرم صرفاً ابزاری برای پشتیبانی از تصمیم‌گیری مالی است. هیچ‌گونه تضمینی برای کسب سود وجود ندارد و سرمایه‌گذاری در بازارهای مالی همواره با ریسک از دست رفتن اصل سرمایه همراه است. مسئولیت نهایی تمامی تصمیمات سرمایه‌گذاری بر عهده خود کاربر است.
        </div>

        {/* Bottom row */}
        <div
          className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            © ۱۴۰۴ آرش صفری — تمامی حقوق محفوظ است.
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری · Investment Analyst &amp; Advisor
          </p>
        </div>
      </div>
    </footer>
  );
}
