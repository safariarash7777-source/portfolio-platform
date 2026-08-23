"use client";

/**
 * ناوبری — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * از ۵ گروه / ۱۴ لینکِ عمومی به ۴ گروه / ۷ لینک.
 * تغییرات:
 *  - «بازار امروز» و «رصد بازار» هر دو به `/market` می‌رفتند — یکی شدند.
 *  - دراپ‌داونِ ۷ موردیِ «بازارها» برداشته شد: `/market` خودش تابلوهای سهام،
 *    صندوق، اختیار و نقشه را لیست می‌کند (`components/market/MarketClient.tsx`)
 *    و `/codal` و `/data` در فوتر می‌مانند. مخاطبِ عمومی با همهٔ قابلیت‌ها
 *    هم‌زمان روبه‌رو نمی‌شود، ولی هیچ مسیری یتیم نمی‌ماند.
 *  - در هدر فقط **یک** اقدامِ اصلی می‌ماند («مشاوره»)؛ «ورود» ثانویه است.
 *  - دراپ‌داون حالا با خروجِ فوکوس (Tab) هم بسته می‌شود، نه فقط کلیکِ بیرون.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Logo from "../ui/Logo";
import ThemeToggle from "../ui/ThemeToggle";

type NavItem = { href: string; label: string };
type NavGroup = { key: string; label: string; href?: string; items?: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { key: "market", label: "بازار", href: "/market" },
  {
    key: "analyses",
    label: "تحلیل‌ها",
    items: [
      { href: "/analyses", label: "کارنامه" },
      { href: "/notes", label: "یادداشت روزانه" },
      { href: "/insights", label: "تحلیل‌های اجتماعی" },
    ],
  },
  {
    key: "products",
    label: "محصولات",
    items: [
      { href: "/webinars", label: "وبینار" },
      { href: "/#waitlist", label: "مشاورهٔ اختصاصی" },
    ],
  },
  { key: "about", label: "دربارهٔ آرش", href: "/about" },
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

  // بستنِ دراپ‌داون: کلیکِ بیرون · Escape · خروجِ فوکوس با Tab
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (navRef.current && next && !navRef.current.contains(next)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const el = navRef.current;
    el?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      el?.removeEventListener("focusout", onFocusOut);
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
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 h-[72px] flex items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy)]"
        >
          <Logo size={44} showText textVariant="navy" />
        </Link>

        {/* ناوبریِ دسکتاپ */}
        <nav ref={navRef} className="hidden md:flex items-center gap-1" aria-label="ناوبری اصلی">
          {NAV_GROUPS.map((g) => {
            if (g.href) {
              return (
                <Link
                  key={g.key}
                  href={g.href}
                  className="inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{ color: "var(--text-2)", minHeight: 44 }}
                >
                  {g.label}
                </Link>
              );
            }
            const isOpen = openGroup === g.key;
            return (
              <div key={g.key} className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{ color: isOpen ? "var(--navy)" : "var(--text-2)", minHeight: 44 }}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  onClick={() => setOpenGroup((v) => (v === g.key ? null : g.key))}
                >
                  {g.label}
                  <ChevronDown
                    size={14}
                    aria-hidden
                    style={{
                      transition: "transform 150ms",
                      transform: isOpen ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>

                {isOpen && g.items && (
                  <div
                    role="menu"
                    className="absolute top-full z-50 mt-1 min-w-[190px] rounded-xl p-1.5"
                    style={{
                      insetInlineStart: 0,
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      boxShadow: "var(--shadow-lg)",
                    }}
                  >
                    {g.items.map((item) => (
                      <Link
                        key={item.href}
                        role="menuitem"
                        href={item.href}
                        onClick={() => setOpenGroup(null)}
                        className="block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
                        style={{ color: "var(--text)" }}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/*
            نمایشِ واکنش‌گرا روی یک wrapper است، نه روی خودِ دکمه: کلاسِ `.btn`
            در `globals.css` بعد از `@tailwind utilities` تعریف شده و
            `display:inline-flex`ِ آن، `hidden`ِ بدون‌پیشوند را می‌بازاند
            (`md:hidden` که در media query است می‌برد — رفتارِ ناهمگون).
            نتیجه‌اش این بود که «مشاوره» در ۳۹۰px هم دیده می‌شد و لوگو را
            به دو خط می‌شکست. wrapper یک div ساده است و این مشکل را ندارد.
          */}
          <div className="hidden items-center gap-2 sm:flex">
            {/* یک اقدامِ اصلی در این ناحیه */}
            <Link href="/#waitlist" className="btn btn-gold">
              مشاوره
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
              style={{ color: "var(--text-2)", minHeight: 44 }}
            >
              ورود
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden btn btn-ghost"
            aria-label={open ? "بستن منو" : "باز کردن منو"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* منوی موبایل */}
      {open && (
        <div
          id="mobile-menu"
          className="md:hidden border-t max-h-[calc(100dvh-72px)] overflow-y-auto"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-3">
            {NAV_GROUPS.map((g) =>
              g.href ? (
                <Link
                  key={g.key}
                  href={g.href}
                  onClick={() => setOpen(false)}
                  className="border-b py-3.5 text-sm font-bold last:border-b-0"
                  style={{ borderColor: "var(--line)", color: "var(--text)" }}
                >
                  {g.label}
                </Link>
              ) : (
                <div key={g.key} className="border-b py-3" style={{ borderColor: "var(--line)" }}>
                  <div className="text-xs font-bold" style={{ color: "var(--text-3)" }}>
                    {g.label}
                  </div>
                  {g.items?.map((item) => (
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
              )
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/#waitlist" onClick={() => setOpen(false)} className="btn btn-gold w-full">
                درخواست مشاوره
              </Link>
              <Link href="/dashboard" onClick={() => setOpen(false)} className="btn btn-outline w-full">
                ورود
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
