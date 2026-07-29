"use client";

import { useEffect, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/format";

/**
 * نوارِ حقایقِ محصول — فقط اعدادِ واقعیِ قابل‌اثبات از خودِ محصول
 * (نه آمارِ کاربر/بازده — الزامِ صداقتِ داده). شمارشِ اعداد هنگامِ دیده‌شدن؛
 * زیر reduced-motion یا بدونِ JS عددِ نهایی مستقیم نمایش داده می‌شود.
 */
const FACTS = [
  { value: 22, label: "سؤالِ آزمون ریسک" },
  { value: 6, label: "بخشِ ارزیابی رفتاری و مالی" },
  { value: 180, label: "روز اعتبار هر پروفایل" },
  // زمان‌بندیِ واقعی در `vercel.json` است: `0 6 * * *` (روزانه). این عدد قبلاً
  // «۵ دقیقه» بود که با هیچ اجرایی مطابقت نداشت — همان ادعای صداقتِ بالای فایل
  // را نقض می‌کرد. هر تغییرِ زمان‌بندی باید همین‌جا هم به‌روز شود.
  { value: 1, label: "بار در روز، چرخهٔ پایش قیمت و هشدار" },
];

function CountUp({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(target); // پیش‌فرض: عددِ نهایی (بدون JS/reduced-motion هم درست است)

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const D = 900;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / D);
          const eased = 1 - Math.pow(1 - p, 3); // ease-out
          setVal(Math.round(eased * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        setVal(0);
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {toPersianDigits(val)}
    </span>
  );
}

export default function ProductFacts() {
  return (
    <section
      className="border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-10 md:py-12">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
          {FACTS.map((f, i) => (
            <div
              key={f.label}
              className="flex flex-col items-center text-center gap-1.5"
              style={{
                borderInlineStart: i % 2 === 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <dd
                className="font-display order-1"
                style={{
                  color: "var(--navy-deep)",
                  fontSize: "clamp(2rem, 4.5vw, 3rem)",
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                <CountUp target={f.value} />
              </dd>
              <dt className="order-2 text-xs sm:text-sm" style={{ color: "var(--text-3)" }}>
                {f.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
