"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserPollEnvironment, startVisiblePoll } from "@/lib/visible-poll";

/** Refresh server cards/charts together while preserving tabs and local UI state. */
export default function MarketAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  useEffect(() => { busy.current = pending; }, [pending]);
  useEffect(() => startVisiblePoll(() => {
    // Avoid interrupting an edit and avoid overlapping an outstanding RSC refresh.
    const element = document.activeElement;
    if (busy.current || element?.matches("input, textarea, select, [contenteditable='true']")) return;
    startTransition(() => router.refresh());
  }, browserPollEnvironment()), [router]);
  return null;
}
