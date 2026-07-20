"use client";

// <Term id="..."> — tooltip درجا (WP-G) طبق SPEC-learning-hub §۳
// short را به‌صورت tooltip نشان می‌دهد و به صفحهٔ واژه در واژه‌نامه لینک می‌دهد.
// id ناموجود → children بدون tooltip (خراب نمی‌شود، صادقانه ساده رندر می‌شود).

import { useState } from "react";
import Link from "next/link";
import { getTerm } from "@/lib/glossary";

export default function Term({
  id,
  children,
}: {
  id: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = getTerm(id);

  if (!t) return <>{children ?? id}</>;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={`/learn/glossary#${t.id}`}
        className="cursor-help underline decoration-dotted underline-offset-4"
        style={{ color: "inherit", textDecorationColor: "var(--line-strong, #b9c2d0)" }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? `term-tip-${t.id}` : undefined}
      >
        {children ?? t.term}
      </Link>
      {open ? (
        <span
          id={`term-tip-${t.id}`}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 block w-64 rounded-lg px-3 py-2 text-[12px] font-normal leading-6 shadow-lg"
          style={{
            background: "var(--navy-deep, #16233a)",
            color: "#fff",
            border: "1px solid var(--line, #2a3a55)",
          }}
        >
          <span className="mb-0.5 block font-bold">{t.term}</span>
          {t.short}
          <span className="mt-1 block text-[10px] opacity-70">برای توضیح کامل کلیک کنید ↗</span>
        </span>
      ) : null}
    </span>
  );
}
