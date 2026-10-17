"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Home,
  LayoutDashboard,
  LineChart,
  Newspaper,
  SlidersHorizontal,
} from "lucide-react";
import {
  publicLayoutHref,
  publicLayout,
  type PublicLayout,
} from "@/lib/public-design/layout";
import s from "./PublicDesign.module.css";

const VIEWS = ["دید بازار", "میز شواهد", "پایش"];

export default function PublicDesignFrame({
  initialLayout,
  page,
  navigation,
  footer,
  children,
}: {
  initialLayout: PublicLayout;
  page: "home" | "market";
  navigation: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const query = useSearchParams();
  const values = query?.getAll("design");
  const layout = values
    ? publicLayout(values.length > 1 ? values : values[0])
    : initialLayout;
  function choose(next: PublicLayout) {
    const url = new URL(window.location.href);
    if (next === 1) url.searchParams.delete("design");
    else url.searchParams.set("design", String(next));
    // Keep the exact same loaded data, filters and scroll; this is presentation only.
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  const entries = [
    {
      href: publicLayoutHref("/", layout),
      label: "خانه",
      Icon: Home,
      active: page === "home",
    },
    {
      href: publicLayoutHref("/market", layout),
      label: "بازار",
      Icon: LineChart,
      active: page === "market",
    },
    { href: "/insights", label: "رسانه", Icon: Newspaper },
    { href: "/learn", label: "یادگیری", Icon: BookOpen },
    { href: "/dashboard", label: "میز من", Icon: LayoutDashboard },
  ];
  return (
    <div
      dir="rtl"
      data-public-layout={layout}
      className={`${s.site} ${s[`layout${layout}`]} ${s[page]}`}
    >
      {navigation}
      <div className={s.frame}>
        <aside className={s.rail} aria-label="دسترسی سریع">
          {entries.map(({ href, label, Icon, active }) => (
            <Link
              prefetch={false}
              key={label}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
          <a
            className={s.railSettings}
            href="#public-appearance"
            aria-label="انتخاب چیدمان"
          >
            <SlidersHorizontal size={21} aria-hidden />
            <span>چیدمان</span>
          </a>
        </aside>
        <main id="public-main" className={s.main}>
          <div className={s.appearance} id="public-appearance">
            <span>چیدمان این صفحه</span>
            <div aria-label="چیدمان صفحه">
              {VIEWS.map((name, i) => (
                <button
                  key={name}
                  aria-pressed={layout === i + 1}
                  onClick={() => choose((i + 1) as PublicLayout)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          {children}
        </main>
      </div>
      {footer}
    </div>
  );
}
