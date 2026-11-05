"use client";

// T6 — هاب نماد: پوستهٔ تب‌ها (موبایل‌اول).
// تب‌ها: نمای کلی · بنیادی · گزارش‌ها · مجامع — محتوای هر تب از سرور به‌صورت
// ReactNode می‌آید (server components داخل تب‌ها). تب فعال با hash در URL
// همگام می‌شود تا لینک مستقیم به هر تب ممکن باشد.

import { useEffect, useId, useState, type ReactNode } from "react";
import MarketAutoRefresh from "../market/MarketAutoRefresh";
import styles from "./SymbolDossier.module.css";
import type { CompanyView } from "@/lib/company-view";

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
  previewView = null,
  companySources,
}: {
  overview: ReactNode;
  fundamental: ReactNode;
  reports: ReactNode;
  assembly: ReactNode;
  previewView?: CompanyView | null;
  companySources?: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("overview");
  const [view, setView] = useState<CompanyView>(previewView ?? "decision");
  const tabId = useId();

  useEffect(() => {
    if (!previewView) return;
    const restore = () => {
      const value = new URLSearchParams(window.location.search).get('view');
      setView(value === 'decision' || value === 'dossier' ? value : previewView);
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [previewView]);

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
    <div className={styles.tabs} data-company-view={previewView ? view : undefined}>
      <MarketAutoRefresh />
      {previewView ? <section className={styles.previewToolbar} aria-label="مقایسهٔ دو چیدمان شرکت">
        <div><strong>پیش‌نمایش صفحهٔ شرکت</strong><p>دو چیدمان از همان گزارش‌ها و نمودارها؛ دادهٔ ناموجود تکمیل نمی‌شود.</p></div>
        <div className={styles.previewSwitch} role="group" aria-label="چیدمان صفحه">
          {([['decision', 'نمای پرسش‌محور'], ['dossier', 'پروندهٔ مستند']] as const).map(([key, label]) => <button
            key={key} type="button" aria-pressed={view === key} onClick={() => {
              setView(key);
              const url = new URL(window.location.href);
              url.searchParams.set('view', key);
              window.history.replaceState(null, '', url);
            }}>{label}</button>)}
        </div>
      </section> : null}
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
            {tab.key === 'fundamental' && previewView ? <div className={styles.previewFundamental}>
              {(view === 'dossier' ? ['sources', 'path', 'charts'] : ['path', 'charts', 'sources']).map(section => section === 'path' ? <nav key={section} className={styles.previewReadingPath} aria-label="مسیر خواندن تحلیل شرکت">
                <strong>{view === 'decision' ? 'از پرسش شروع کنید' : 'فهرست پرونده'}</strong>
                <a href="#chart-5y-trend">روند درآمد</a><a href="#chart-net-profit">سود خالص</a>
                <a href="#chart-margins">حاشیهٔ سود</a><a href="#chart-product-rates">نرخ محصولات</a>
                <a href="#chart-prod-vs-sales">مقدار تولید و فروش</a><a href="#company-sources">منبع و دوره</a>
              </nav> : section === 'sources' ? <div key={section} className={styles.previewSourceSlot}>{companySources}</div>
                : <div key={section} className={styles.previewChartSlot}>{fundamental}</div>)}
            </div> : { overview, fundamental, reports, assembly }[tab.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
