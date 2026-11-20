"use client";

// جستجوی واژه‌نامه (WP-G) — روی /learn (خلاصه) و /learn/glossary (کامل) استفاده می‌شود.
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Search } from "lucide-react";
import { GLOSSARY, searchGlossary, getTerm } from "@/lib/glossary";

export default function GlossarySearch({
  limit,
  full = false,
}: {
  /** حداکثر تعداد نتیجه (برای نمای خلاصهٔ هاب). */
  limit?: number;
  /** نمای کامل: long + seeAlso و انکر id (صفحهٔ واژه‌نامه). */
  full?: boolean;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const r = searchGlossary(q);
    return limit && !q.trim() ? r.slice(0, limit) : r;
  }, [q, limit]);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--navy)]">
        <Search size={18} aria-hidden="true" />
        <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجو؛ مثلاً حجم مبنا یا NAV"
        className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
        aria-label="جستجوی واژه‌نامه"
      />
        {q && (
          <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => { setQ(""); input.current?.focus(); }}>
            پاک کردن
          </button>
        )}
      </div>
      <p role="status" className="mt-2 text-sm">
        {q.trim() && `${results.length.toLocaleString("fa-IR")} نتیجه`}
      </p>
      {results.length === 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-3)" }}>
          واژهٔ دیگری جستجو کنید یا با «پاک کردن» به فهرست برگردید.
        </p>
      ) : (
        <div className={`mt-3 grid grid-cols-1 gap-3 ${full ? "" : "sm:grid-cols-2"}`}>
          {results.map((t) => (
            <div
              key={t.id}
              id={full ? t.id : undefined}
              className="scroll-mt-24 rounded-xl px-4 py-3 target:ring-2 target:ring-[var(--navy)]"
              style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
            >
              <h3 className="text-[14px] font-bold" style={{ color: "var(--navy-deep)" }}>
                {t.term}
              </h3>
              <p className="mt-1 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                {full ? t.long : t.short}
              </p>
              {full && t.seeAlso.length > 0 ? (
                <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                  مرتبط:{" "}
                  {t.seeAlso.map((id, i) => {
                    const ref = getTerm(id);
                    if (!ref) return null;
                    return (
                      <span key={id}>
                        {i > 0 ? "، " : ""}
                        <a href={`#${id}`} onClick={() => { if (q) flushSync(() => setQ("")); }} className="underline" style={{ color: "var(--navy)" }}>
                          {ref.term}
                        </a>
                      </span>
                    );
                  })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {!full && !q.trim() && limit && GLOSSARY.length > limit ? (
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
          {`${(GLOSSARY.length - limit).toLocaleString("fa-IR")} واژهٔ دیگر در واژه‌نامهٔ کامل`}
        </p>
      ) : null}
    </div>
  );
}
