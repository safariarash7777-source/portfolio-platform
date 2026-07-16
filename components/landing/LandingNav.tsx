"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "../ui/Logo";
import ThemeToggle from "../ui/ThemeToggle";

// لندینگ هم باید به سطوح اصلی محصول لینک بدهد، نه فقط انکرهای بازاریابی.
const NAV_LINKS = [
  { href: "/market",    label: "رصد بازار" },
  { href: "/data",      label: "بانک داده" },
  { href: "/webinars",  label: "وبینارها" },
  { href: "/#features", label: "قابلیت‌ها" },
  { href: "/#faq",      label: "سؤالات" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
        <Link
          href="/"
          className="outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy)] rounded-md"
        >
          <Logo size={44} showText textVariant="navy" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-md text-sm font-medium transition-colors hover:text-[color:var(--navy)]"
              style={{ color: "var(--text-2)" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
            ورود
          </Link>
          <Link href="/#waitlist" className="btn btn-gold hidden sm:inline-flex">
            لیست انتظار
          </Link>

          <button
            type="button"
            className="md:hidden btn btn-ghost"
            aria-label={open ? "بستن منو" : "باز کردن منو"}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
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

      {open && (
        <div
          id="landing-mobile-menu"
          className="md:hidden border-t"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm font-medium border-b"
                style={{ color: "var(--text)", borderColor: "var(--line)" }}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="btn btn-outline mt-3 w-full"
            >
              ورود
            </Link>
            <Link
              href="/#waitlist"
              onClick={() => setOpen(false)}
              className="btn btn-gold mt-2 w-full"
            >
              عضویت در لیست انتظار
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
