"use client";

// T6 — هاب نماد: پوستهٔ تب‌ها (موبایل‌اول).
// تب‌ها: نمای کلی · بنیادی · گزارش‌ها · مجامع — محتوای هر تب از سرور به‌صورت
// ReactNode می‌آید (server components داخل تب‌ها). تب فعال با hash در URL
// همگام می‌شود تا لینک مستقیم به هر تب ممکن باشد.

import { useEffect, useId, useState, type ReactNode } from "react";
import MarketAutoRefresh from "../market/MarketAutoRefresh";
import styles from "./SymbolDossier.module.css";

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
  const tabId = useId();

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
    <div className={styles.tabs}>
      <MarketAutoRefresh />
      <div
        role="tablist"
        aria-label="بخش‌های صفحهٔ نماد"
        className={styles.tabList}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            id={`${tabId}-${t.key}-tab`}
            role="tab"
            aria-controls={`${tabId}-${t.key}-panel`}
            aria-selected={active === t.key}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => select(t.key)}
            onKeyDown={(event) => {
              const index = TABS.findIndex((tab) => tab.key === t.key);
              const nextIndex = event.key === "Home" ? 0
                : event.key === "End" ? TABS.length - 1
                : event.key === "ArrowLeft" ? (index + 1) % TABS.length
                : event.key === "ArrowRight" ? (index - 1 + TABS.length) % TABS.length
                : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = TABS[nextIndex].key;
              select(next);
              document.getElementById(`${tabId}-${next}-tab`)?.focus();
            }}
            className={styles.tab}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {TABS.map((tab) => (
          <div key={tab.key} role="tabpanel" id={`${tabId}-${tab.key}-panel`}
            aria-labelledby={`${tabId}-${tab.key}-tab`} tabIndex={0}
            data-symbol-tab={tab.key} hidden={active !== tab.key}>
            {{ overview, fundamental, reports, assembly }[tab.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
