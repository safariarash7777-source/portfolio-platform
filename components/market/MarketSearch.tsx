"use client";

/**
 * جست‌وجوی نماد و صندوق — بالای هر صفحهٔ بازار.
 *
 * ── مسئله‌ای که حل می‌کند ─────────────────────────────────────────────────
 * پیش از این، `/market` هیچ راهِ مستقیمی برای رسیدن به یک نماد نداشت؛ تنها
 * مسیر، اسکرول تا تابلوی سهام (حدودِ ۲۲۰۰ پیکسل پایین‌تر) و جست‌وجو در همان
 * جدول بود. یعنی کاربری که می‌داند دنبالِ چیست، مجبور بود از کنارِ همهٔ
 * چیزهایی که نمی‌خواست رد شود.
 *
 * ── چرا جست‌وجو سمتِ کلاینت است ───────────────────────────────────────────
 * نمایه از همان اسنپ‌شاتی می‌آید که صفحه برای بقیهٔ بخش‌ها **already** خوانده
 * است؛ پس هیچ درخواستِ تازه‌ای به BrsApi یا حتی به سرورِ خودمان نمی‌خورد
 * (قاعدهٔ Q3: دادهٔ اضافه جمع نمی‌شود). در عوض نتیجه بی‌تأخیر ظاهر می‌شود.
 * ردیفِ نمایه عمداً باریک است (`buildSearchIndex`) تا حجمِ روی سیم کم بماند.
 */

import { useState, useRef, useMemo, useId, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUrlBackedText } from "@/lib/useUrlState";
import { Search, X, CornerDownLeft } from "lucide-react";
import { searchMarket, type MarketSearchEntry } from "@/lib/market-nav";
import { toLatinDigits } from "@/lib/format";

/** برچسبِ نوعِ نتیجه — کاربر باید بداند روی چه چیزی کلیک می‌کند. */
function kindLabel(e: MarketSearchEntry): string {
  if (e.kind === "fund") return e.type ? `صندوق · ${e.type}` : "صندوق";
  return "سهم";
}

export default function MarketSearch({
  index,
  /** مبدأ — در URL مقصد می‌رود تا صفحهٔ نماد بداند «برگشت به کجا». */
  from,
  autoFocusOnMount = false,
}: {
  index: readonly MarketSearchEntry[];
  from?: string;
  autoFocusOnMount?: boolean;
}) {
  const router = useRouter();

  /**
   * متنِ جست‌وجو در URL می‌نشیند (`?find=`).
   *
   * ── چرا ──────────────────────────────────────────────────────────────
   * معیارِ پذیرش: «بازار ← جست‌وجوی نماد ← جزئیات ← برگشت **با حفظ جست‌وجو**».
   * با `useState` تنها، دکمهٔ برگشتِ مرورگر به صفحه‌ای برمی‌گشت که کادرش خالی
   * بود و کاربر باید از نو تایپ می‌کرد.
   *
   * نامِ پارامتر عمداً `find` است و نه `q`: تابلوی سهام و دیده‌بانِ صندوق‌ها
   * از قبل `?q=` را برای جست‌وجوی **داخلِ جدولِ خودشان** گرفته‌اند. یک نامِ
   * مشترک یعنی تایپ در کادرِ بالا جدولِ پایین را هم فیلتر می‌کرد.
   */
  const [query, setQuery] = useUrlBackedText("find");

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // ارقامِ فارسی قبل از مقایسه به لاتین می‌روند (قاعدهٔ CLAUDE.md: toLatinDigits
  // پیش از اعتبارسنجی/پارس) — وگرنه نمادی که رقم دارد با تایپِ فارسی پیدا نمی‌شود.
  const results = useMemo(
    () => searchMarket(index, toLatinDigits(query)),
    [index, query],
  );

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;

  useEffect(() => setActive(0), [query]);

  // بستن با کلیکِ بیرون — بدونِ این، پنل روی محتوای صفحه باز می‌ماند.
  useEffect(() => {
    if (!showPanel) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showPanel]);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  function go(entry: MarketSearchEntry) {
    const qs = from ? `?from=${encodeURIComponent(from)}` : "";
    // `push` (نه replace): رفتن به صفحهٔ نماد یک قدمِ واقعی در تاریخچه است، پس
    // «برگشت» باید به همین صفحه با همین جست‌وجو برگردد — و چون متنِ جست‌وجو
    // در URLِ همین صفحه است، برگشت خودش کادر را پر می‌کند.
    router.push(`/symbol/${encodeURIComponent(entry.id)}${qs}`);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Escape اول پنل را می‌بندد، بارِ دوم متن را پاک می‌کند — مسیرِ خروجِ روشن.
      if (showPanel) setOpen(false);
      else setQuery("");
      return;
    }
    if (!showPanel || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active] ?? results[0]);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full" dir="rtl">
      <label htmlFor={`${listId}-input`} className="sr-only">
        جست‌وجوی نماد یا صندوق
      </label>
      <div
        className="flex items-center gap-2 rounded-xl border px-3 transition-colors focus-within:ring-2"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line-strong)",
          minHeight: 46,
          // @ts-expect-error — متغیرِ CSS برای حلقهٔ فوکوس روی توکنِ برند
          "--tw-ring-color": "var(--navy)",
        }}
      >
        <Search size={17} aria-hidden style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && results[active] ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="نماد یا نام صندوق — مثلاً وبملت یا طلا"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--text)", height: 44 }}
        />
        {trimmed.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="پاک‌کردن جست‌وجو"
            className="flex flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={{ width: 36, height: 36, color: "var(--text-3)" }}
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border"
          style={{ background: "var(--surface)", borderColor: "var(--line-strong)", boxShadow: "var(--shadow-lg)" }}
        >
          {results.length === 0 ? (
            /* حالتِ بدونِ نتیجه — صریح، و با راهِ خروج. سکوت یا فهرستِ خالی
               کاربر را در تردید می‌گذارد که آیا جست‌وجو کار کرد یا نه. */
            <div className="px-4 py-4">
              <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>
                نمادی با «{trimmed}» پیدا نشد
              </p>
              <p className="mt-1 text-xs leading-6" style={{ color: "var(--text-3)" }}>
                جست‌وجو روی نمادها و صندوق‌های آخرین اسنپ‌شات انجام می‌شود. املای نماد را بررسی
                کنید یا از تابلوی سهام و صندوق‌ها فهرستِ کامل را ببینید.
              </p>
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="نتایج جست‌وجو" className="max-h-80 overflow-y-auto">
              {results.map((r, i) => (
                <li key={`${r.kind}-${r.id}`} role="option" id={`${listId}-opt-${i}`} aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className="flex w-full items-center justify-between gap-3 px-3 text-right transition-colors"
                    style={{
                      minHeight: 48,
                      background: i === active ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold" style={{ color: "var(--heading)" }}>
                        {r.id}
                      </span>
                      {r.name && r.name !== r.id ? (
                        <span className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>
                          {r.name}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: r.kind === "fund" ? "var(--gold-tint)" : "var(--surface-2)",
                          color: r.kind === "fund" ? "var(--gold-ink)" : "var(--text-2)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {kindLabel(r)}
                      </span>
                      {i === active ? (
                        <CornerDownLeft size={13} aria-hidden style={{ color: "var(--text-3)" }} />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
