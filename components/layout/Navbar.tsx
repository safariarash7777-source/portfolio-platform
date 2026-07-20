"use client";

// ناوبری ۵-گروهی بر پایهٔ ۵ ناحیهٔ Blueprint (WP-A):
// بازار · نماد · تحلیل‌ها · یادگیری · ترمینال — همهٔ ۹ مقصد قبلی حفظ شده‌اند.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Logo from "../ui/Logo";
import ThemeToggle from "../ui/ThemeToggle";

type NavItem = { href: string; label: string; desc?: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

// ۵ گروهِ ناحیه‌ای — ترتیب طبق Blueprint
const NAV_GROUPS: NavGroup[] = [
  {
    key: "market",
    label: "بازار",
    items: [
      { href: "/market",       label: "رصد بازار",  desc: "نبض امروز بازار" },
      { href: "/market/map",   label: "نقشهٔ بازار", desc: "نمای کاشی‌ای صنایع" },
      { href: "/market/funds", label: "صندوق‌ها",    desc: "NAV و حباب صندوق‌ها" },
      { href: "/codal",        label: "کدال",        desc: "فید اطلاعیه‌های رسمی" },
    ],
  },
  {
    key: "symbol",
    label: "نماد",
    items: [
      { href: "/data",          label: "بانک داده",    desc: "همهٔ دارایی‌ها + خروجی CSV" },
      { href: "/market/stocks", label: "تابلوی سهام",  desc: "دیده‌بانی لحظه‌ای سهام" },
    ],
  },
  {
    key: "analyses",
    label: "تحلیل‌ها",
    items: [
      { href: "/analyses", label: "کارنامه",            desc: "کارنامهٔ قابل راستی‌آزمایی" },
      { href: "/insights", label: "تحلیل‌های اجتماعی",  desc: "تجمیع تلگرام و اینستاگرام" },
      { href: "/notes",    label: "یادداشت روزانه",     desc: "یادداشت‌های روزانهٔ سایت" },
    ],
  },
  {
    key: "learn",
    label: "یادگیری",
    items: [
      { href: "/webinars", label: "وبینار", desc: "وبینارهای فصلی" },
    ],
  },
  {
    key: "terminal",
    label: "ترمینال",
    items: [
      { href: "/terminal",  label: "ترمینال تحلیلگر", desc: "ابزار تصمیم حرفه‌ای" },
      { href: "/dashboard", label: "داشبورد",         desc: "حساب کاربری شما" },
    ],
  },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // بستن دراپ‌داون با کلیک بیرون یا Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-all"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
        borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
        boxShadow: scrolled ? "var(--shadow-sm)" : "none",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 h-[72px] flex items-center justify-between gap-4">
        {/* Logo lockup */}
        <Link href="/" className="outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy)] rounded-md">
          <Logo size={44} showText textVariant="navy" />
        </Link>

        {/* Desktop nav — ۵ گروه با دراپ‌داون */}
        <nav ref={navRef} className="hidden md:flex items-center gap-1" aria-label="ناوبری اصلی">
          {NAV_GROUPS.map((g) => (
            <div key={g.key} className="relative">
              <button
                type="button"
                className="px-3 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1"
                style={{ color: openGroup === g.key ? "var(--navy)" : "var(--text-2)" }}
                aria-expanded={openGroup === g.key}
                aria-haspopup="menu"
                onClick={() => setOpenGroup((v) => (v === g.key ? null : g.key))}
              >
                {g.label}
                <ChevronDown
                  size={14}
                  style={{
                    transition: "transform 150ms",
                    transform: openGroup === g.key ? "rotate(180deg)" : "none",
                  }}
                />
              </button>

              {openGroup === g.key && (
                <div
                  role="menu"
                  className="absolute top-full mt-1 min-w-[220px] rounded-xl p-2 z-50"
                  style={{
                    insetInlineStart: 0,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--shadow-md, var(--shadow-sm))",
                  }}
                >
                  {g.items.map((item) => (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      onClick={() => setOpenGroup(null)}
                      className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[color:var(--surface-2)]"
                    >
                      <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>
                        {item.label}
                      </span>
                      {item.desc && (
                        <span className="block text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                          {item.desc}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/#waitlist" className="btn btn-gold hidden sm:inline-flex">
            عضویت در لیست انتظار
          </Link>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden btn btn-ghost"
            aria-label={open ? "بستن منو" : "باز کردن منو"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu — گروه‌بندی‌شده */}
      {open && (
        <div
          id="mobile-menu"
          className="md:hidden border-t max-h-[calc(100vh-72px)] overflow-y-auto"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-3 flex flex-col">
            {NAV_GROUPS.map((g) => (
              <div key={g.key} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
                <div className="py-1 text-xs font-bold" style={{ color: "var(--text-3)" }}>
                  {g.label}
                </div>
                {g.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block py-2.5 text-sm font-medium"
                    style={{ color: "var(--text)" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
            <Link
              href="/#waitlist"
              onClick={() => setOpen(false)}
              className="btn btn-gold mt-3 w-full"
            >
              عضویت در لیست انتظار
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
