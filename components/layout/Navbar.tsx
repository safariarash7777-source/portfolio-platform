"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/Logo";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { accountEntryHref } from "@/components/account/returnPath";

const links = [
  { href: "/webinars", label: "دوره و وبینار" },
  { href: "/market", label: "بازار و صندوق‌ها" },
  { href: "/insights", label: "مطالب" },
  { href: "/consultation", label: "درخواست مشاوره" },
];
export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.user));
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session?.user)),
    );
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);
  return (
    <header ref={header} className="public-header">
      <a
        href="#main-content"
        className="public-skip-link"
        onClick={(event) => {
          const main = document.querySelector("main");
          if (!main) return;
          event.preventDefault();
          if (!main.id) main.id = "main-content";
          main.tabIndex = -1;
          main.focus();
          main.scrollIntoView({ block: "start" });
        }}
      >
        رفتن به محتوای اصلی
      </a>
      <div className="public-container public-nav-row">
        <Link
          href="/"
          className="public-brand"
          aria-label="آرش صفری، صفحهٔ اصلی"
          onClick={() => setOpen(false)}
        >
          <Logo size={40} />
        </Link>
        <nav aria-label="ناوبری عمومی" className="public-desktop-nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                pathname === link.href || pathname.startsWith(`${link.href}/`)
                  ? "page"
                  : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="public-nav-tools">
          <ThemeToggle />
          <Link
            href={
              signedIn ? "/dashboard" : accountEntryHref("/login", "/dashboard")
            }
            className="btn btn-outline public-account-link"
          >
            {signedIn
              ? "پنل عضو"
              : signedIn === null
                ? "حساب کاربری"
                : "ورود اعضا"}
          </Link>
          <button
            ref={toggle}
            type="button"
            className="btn btn-ghost public-menu-toggle"
            aria-label={open ? "بستن منو" : "باز کردن منو"}
            aria-expanded={open}
            aria-controls="public-mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X size={22} aria-hidden />
            ) : (
              <Menu size={22} aria-hidden />
            )}
          </button>
        </div>
      </div>
      {open ? (
        <nav
          id="public-mobile-nav"
          className="public-container public-mobile-nav"
          aria-label="ناوبری عمومی موبایل"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
