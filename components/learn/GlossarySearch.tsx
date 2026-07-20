"use client";

// جستجوی واژه‌نامه (WP-G) — روی /learn (خلاصه) و /learn/glossary (کامل) استفاده می‌شود.
import { useMemo, useState } from "react";
import Link from "next/link";
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
  const results = useMemo(() => {
    const r = searchGlossary(q);
    return limit && !q.trim() ? r.slice(0, limit) : r;
  }, [q, limit]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجوی اصطلاح… (مثلاً حجم مبنا، NAV، صف خرید)"
        className="w-full rounded-lg px-4 py-2.5 text-[13px] outline-none"
        style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text-1)" }}
        aria-label="جستجوی واژه‌نامه"
      />
      {results.length === 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-3)" }}>
          چیزی پیدا نشد. واژهٔ دیگری امتحان کنید یا{" "}
          <Link href="/learn/glossary" className="underline">
            واژه‌نامهٔ کامل
          </Link>{" "}
          را ببینید.
        </p>
      ) : (
        <div className={`mt-3 grid grid-cols-1 gap-3 ${full ? "" : "sm:grid-cols-2"}`}>
          {results.map((t) => (
            <div
              key={t.id}
              id={full ? t.id : undefined}
              className="rounded-xl px-4 py-3"
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
                        <a href={`#${id}`} className="underline" style={{ color: "var(--navy)" }}>
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
