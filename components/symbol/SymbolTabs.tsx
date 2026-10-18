"use client";

// T6 — هاب نماد: پوستهٔ تب‌ها (موبایل‌اول).
// تب‌ها: نمای کلی · بنیادی · گزارش‌ها · مجامع — محتوای هر تب از سرور به‌صورت
// ReactNode می‌آید (server components داخل تب‌ها). تب فعال با hash در URL
// همگام می‌شود تا لینک مستقیم به هر تب ممکن باشد.

import { useEffect, useState, type ReactNode } from "react";
import MarketAutoRefresh from "../market/MarketAutoRefresh";

const TABS = [
  { key: "overview", label: "نمای کلی" },
  { key: "fundamental", label: "بنیادی" },
  { key: "reports", label: "گزارش‌ها" },
  { key: "assembly", label: "مجامع" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SymbolTabs({
  overview,
  fundamental,
  reports,
  assembly,
}: {
  overview: ReactNode;
  fundamental: ReactNode;
  reports: ReactNode;
  assembly: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("overview");

  // خواندن hash اولیه (لینک مستقیم به تب)
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      const panel = document.getElementById(h)?.closest("[data-symbol-tab]");
      const key = TABS.some((t) => t.key === h) ? h : panel?.getAttribute("data-symbol-tab");
      if (TABS.some((t) => t.key === key)) setActive(key as TabKey);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // A chart anchor exists inside its initially hidden tab. Scroll after that
  // panel is visible, without treating arbitrary URL text as a CSS selector.
  useEffect(() => {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target?.closest("[data-symbol-tab]")?.getAttribute("data-symbol-tab") === active)
      target.scrollIntoView({ block: "start" });
  }, [active]);

  const select = (key: TabKey) => {
    setActive(key);
    // hash بدون اسکرول‌پرش
    history.replaceState(null, "", `#${key}`);
  };

  return (
    <div>
      <MarketAutoRefresh />
      <div
        role="tablist"
        aria-label="بخش‌های صفحهٔ نماد"
        className="sticky top-[64px] z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl p-1"
        style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            onClick={() => select(t.key)}
            className="inline-flex min-h-11 min-w-fit flex-1 items-center justify-center whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={
              active === t.key
                ? { background: "var(--navy-deep)", color: "#fff" }
                : { color: "var(--text-2)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-6">
        <div data-symbol-tab="overview" hidden={active !== "overview"}>{overview}</div>
        <div data-symbol-tab="fundamental" hidden={active !== "fundamental"}>{fundamental}</div>
        <div data-symbol-tab="reports" hidden={active !== "reports"}>{reports}</div>
        <div data-symbol-tab="assembly" hidden={active !== "assembly"}>{assembly}</div>
      </div>
    </div>
  );
}
