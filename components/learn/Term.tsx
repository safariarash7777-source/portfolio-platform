"use client";

// <Term id="..."> — tooltip درجا (WP-G) طبق SPEC-learning-hub §۳
// short را به‌صورت tooltip نشان می‌دهد و به صفحهٔ واژه در واژه‌نامه لینک می‌دهد.
// id ناموجود → children بدون tooltip (خراب نمی‌شود، صادقانه ساده رندر می‌شود).

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const hovered = useRef(false);
  const focused = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const t = getTerm(id);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const close = useCallback(() => {
    cancelClose();
    // Removing the portal need not dispatch mouseleave; do not retain its hover.
    hovered.current = false;
    setOpen(false);
  }, [cancelClose]);
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    // Allow the pointer to cross the 6px gap into the portalled tooltip.
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (!hovered.current && !focused.current) setOpen(false);
    }, 150);
  };
  const isWithinTooltip = (target: EventTarget | null) =>
    target instanceof Node &&
    (anchor.current?.contains(target) || tooltip.current?.contains(target));
  const leave = (event: React.MouseEvent<HTMLSpanElement>) => {
    // Portal -> trigger may not emit mouseenter on their shared React ancestor.
    if (isWithinTooltip(event.relatedTarget)) {
      hovered.current = true;
      cancelClose();
      return;
    }
    hovered.current = false;
    scheduleClose();
  };

  useLayoutEffect(() => cancelClose, [cancelClose]);

  useLayoutEffect(() => {
    if (!open || !t) return;
    const place = () => {
      if (!anchor.current || !tooltip.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const tip = tooltip.current.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) {
        close();
        return;
      }
      const below = rect.bottom + 6;
      setPosition({
        left: Math.max(8, Math.min(rect.right - tip.width, width - tip.width - 8)),
        top: Math.max(8, Math.min(below + tip.height <= height - 8 ? below : rect.top - tip.height - 6, height - tip.height - 8)),
      });
    };
    // Hover does not move focus. Observe Escape without consuming other controls' events.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    place();
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelClose();
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, t, close, cancelClose]);

  if (!t) return <>{children ?? id}</>;

  return (
    <span
      ref={anchor}
      className="relative inline-block"
      onMouseEnter={() => { hovered.current = true; show(); }}
      onMouseLeave={leave}
    >
      <Link
        href={`/learn/glossary#${t.id}`}
        className="inline-flex min-h-11 cursor-help items-center underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)] rounded"
        style={{ color: "inherit", textDecorationColor: "var(--line-strong, #b9c2d0)" }}
        onFocus={() => { focused.current = true; show(); }}
        onBlur={() => { focused.current = false; scheduleClose(); }}
        aria-describedby={open ? tooltipId : undefined}
      >
        {children ?? t.term}
      </Link>
      {open ? createPortal(
        <span
          ref={tooltip}
          id={tooltipId}
          role="tooltip"
          dir="rtl"
          onMouseEnter={() => { hovered.current = true; show(); }}
          onMouseLeave={leave}
          className="fixed z-50 block w-64 max-w-[calc(100vw-16px)] whitespace-normal break-words rounded-lg px-3 py-2 text-right text-[12px] font-normal leading-6 shadow-lg"
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? "visible" : "hidden",
            background: "var(--navy-deep, #16233a)",
            color: "#fff",
            border: "1px solid var(--line, #2a3a55)",
          }}
        >
          <span className="mb-0.5 block font-bold">{t.term}</span>
          {t.short}
          <span className="mt-1 block text-[10px] opacity-70">برای توضیح کامل کلیک کنید ↗</span>
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
