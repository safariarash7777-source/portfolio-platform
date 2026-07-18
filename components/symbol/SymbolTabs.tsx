"use client";

// T6 — هاب نماد: پوستهٔ تب‌ها (موبایل‌اول).
// تب‌ها: نمای کلی · بنیادی · گزارش‌ها · مجامع — محتوای هر تب از سرور به‌صورت
// ReactNode می‌آید (server components داخل تب‌ها). تب فعال با hash در URL
// همگام می‌شود تا لینک مستقیم به هر تب ممکن باشد.

import { useEffect, useState, type ReactNode } from "react";

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
    const h = window.location.hash.replace("#", "");
    if (TABS.some((t) => t.key === h)) setActive(h as TabKey);
  }, []);

  const select = (key: TabKey) => {
    setActive(key);
    // hash بدون اسکرول‌پرش
    history.replaceState(null, "", `#${key}`);
  };

  return (
    <div>
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
            className="min-w-fit flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
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
        <div hidden={active !== "overview"}>{overview}</div>
        <div hidden={active !== "fundamental"}>{fundamental}</div>
        <div hidden={active !== "reports"}>{reports}</div>
        <div hidden={active !== "assembly"}>{assembly}</div>
      </div>
    </div>
  );
}
