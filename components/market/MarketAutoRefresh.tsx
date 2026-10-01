"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MarketRefreshCadence } from "@/lib/market-refresh";

/** Refresh the existing RSC read path; no new producer, API key or upstream request. */
export default function MarketAutoRefresh({ readAt, readFailed }: { readAt: number; readFailed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(readFailed);
  const cadence = useRef<MarketRefreshCadence | null>(null);
  const flight = useRef<{ readAt: number; startedAt: number; x: number; y: number; userMoved: boolean } | null>(null);
  const currentRead = useRef({ readAt, readFailed });
  const restoreScroll = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const position = restoreScroll.current;
    if (position) window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
  }, [failed]);

  useEffect(() => {
    currentRead.current = { readAt, readFailed };
    setFailed(readFailed);
  }, [readAt, readFailed]);

  useEffect(() => {
    if (!flight.current) return;
    // React's transition may become idle BEFORE the RSC response. A server render is the ack.
    if (pending || readAt === flight.current.readAt) return;
    setFailed(currentRead.current.readFailed);
    const completed = flight.current;
    // A new warning can trigger browser scroll anchoring. Do not undo an intentional user scroll.
    if (!completed.userMoved) {
      restoreScroll.current = completed;
      requestAnimationFrame(() => {
        const position = restoreScroll.current;
        if (position) window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      });
    }
    flight.current = null;
    cadence.current?.finish(Date.now());
  }, [pending, readAt]);

  useEffect(() => {
    cadence.current = new MarketRefreshCadence(Date.now());
    function check() {
      if (flight.current && Date.now() - flight.current.startedAt >= 30000) setFailed(true);
      // An unacknowledged request keeps its lease; a timeout must not start an overlapping read.
      if (!cadence.current?.begin(Date.now(), document.visibilityState === "visible")) return;
      restoreScroll.current = null;
      flight.current = { readAt: currentRead.current.readAt, startedAt: Date.now(), x: window.scrollX, y: window.scrollY, userMoved: false };
      startTransition(() => router.refresh());
    }
    function userMoved(event: Event) {
      if (event instanceof KeyboardEvent && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      restoreScroll.current = null;
      if (flight.current) flight.current.userMoved = true;
    }
    const timer = setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("wheel", userMoved, { passive: true });
    window.addEventListener("touchmove", userMoved, { passive: true });
    window.addEventListener("keydown", userMoved);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("wheel", userMoved);
      window.removeEventListener("touchmove", userMoved);
      window.removeEventListener("keydown", userMoved);
      restoreScroll.current = null;
      cadence.current = null;
      flight.current = null;
    };
  }, [router]);

  return failed ? <p role="status" className="mb-3 text-xs leading-6" style={{ color: "var(--warning)" }}>
    دریافت تازه انجام نشد؛ دادهٔ معتبر قبلی، در صورت وجود، حفظ شده و ممکن است کهنه باشد.
  </p> : null;
}
