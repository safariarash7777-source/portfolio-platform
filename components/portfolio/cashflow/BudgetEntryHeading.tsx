"use client";

import { useEffect, useRef } from "react";

/** A real fragment target in the server-rendered shell. On a streamed entry the
 * native fragment lookup may have preceded the shell; restore that arrival only,
 * and never move focus away from an interacted-with control or during a read. */
export default function BudgetEntryHeading() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#period-budget" || document.activeElement !== document.body) return;
    const el = heading.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, []);
  return <header className="space-y-1">
    <h2 ref={heading} id="period-budget" tabIndex={-1}
      className="scroll-mt-28 rounded-md font-display text-xl font-bold outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--focus)]">
      بودجهٔ دوره
    </h2>
    <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
      برای مقایسهٔ بودجه با درآمد و هزینهٔ واقعی، تاریخ شروع و پایان را انتخاب کنید.
    </p>
  </header>;
}
