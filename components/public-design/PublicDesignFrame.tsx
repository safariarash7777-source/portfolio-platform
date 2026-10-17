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
import type { SiteAppearance } from "@/lib/appearance/site-layout";
import SiteLayoutPreview from "./SiteLayoutPreview";
import SiteAppearanceWarning from "./SiteAppearanceWarning";

export default function PublicDesignFrame({
  appearance,
  page,
  navigation,
  footer,
  children,
}: {
  appearance: SiteAppearance;
  page: "home" | "market";
  navigation: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const query = useSearchParams();
  const values = query?.getAll("design");
  const preview =
    appearance.state === "ready" && appearance.previewLayout !== null;
  const globalLayout = appearance.globalLayout ?? 1;
  const layout =
    preview && query?.get("appearance_preview") === "1"
      ? publicLayout(values && values.length > 1 ? values : values?.[0])
      : preview && !query
        ? appearance.previewLayout!
        : globalLayout;
  function choose(next: PublicLayout) {
    if (!preview) return;
    const url = new URL(window.location.href);
    url.searchParams.set("appearance_preview", "1");
    url.searchParams.set("design", String(next));
    // Keep the exact same loaded data, filters and scroll; this is presentation only.
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  const entries = [
    {
      href: publicLayoutHref("/", layout, preview),
      label: "خانه",
      Icon: Home,
      active: page === "home",
    },
    {
      href: publicLayoutHref("/market", layout, preview),
      label: "بازار",
      Icon: LineChart,
      active: page === "market",
    },
    {
      href: publicLayoutHref("/insights", layout, preview),
      label: "رسانه",
      Icon: Newspaper,
    },
    { href: "/learn", label: "یادگیری", Icon: BookOpen },
    { href: "/dashboard", label: "میز من", Icon: LayoutDashboard },
  ];
  return (
    <div
      dir="rtl"
      data-public-layout={appearance.state === "ready" ? layout : "fallback"}
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
          {preview && (
            <a
              className={s.railSettings}
              href="#public-appearance"
              aria-label="انتخاب چیدمان"
            >
              <SlidersHorizontal size={21} aria-hidden />
              <span>چیدمان</span>
            </a>
          )}
        </aside>
        <main id="public-main" className={s.main}>
          {appearance.state === "unavailable" && <SiteAppearanceWarning />}
          {preview && <SiteLayoutPreview layout={layout} onChoose={choose} />}
          {children}
        </main>
      </div>
      {footer}
    </div>
  );
}
