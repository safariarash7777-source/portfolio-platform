"use client";

import { useEffect, useState } from "react";
import { formatJalali, formatTehranClock, toLatinDigits, toPersianDigits } from "@/lib/format";
import { MONTHLY_SCREEN_FRESH_MS } from "@/lib/fundamental/monthly-sales-clocks";

export function screenTimestamp(value?: string | null) {
  if (!value) return "نامشخص";
  if (/^1[34]\d{2}[/-]/.test(toLatinDigits(value))) return toPersianDigits(value);
  if (!Number.isFinite(Date.parse(value))) return toPersianDigits(value);
  return formatJalali(value, false) + " · " + formatTehranClock(value);
}

export function SalesReadNotice({ readState, checkedAt, label }: {
  readState?: "fresh" | "retained"; checkedAt?: string | null; label: string;
}) {
  const [, setRefresh] = useState(0);
  const now = Date.now();
  const stamp = checkedAt ? Date.parse(checkedAt) : NaN;
  const expires = stamp + MONTHLY_SCREEN_FRESH_MS;
  useEffect(() => {
    const remaining = expires - Date.now();
    if (readState === "retained" || !Number.isFinite(remaining) || remaining < 0 || remaining > 2 * MONTHLY_SCREEN_FRESH_MS) return;
    const timer = setTimeout(() => setRefresh(n => n + 1), remaining + 1);
    return () => clearTimeout(timer);
  }, [expires, readState]);
  const retained = readState === "retained";
  const unknown = !Number.isFinite(stamp) || stamp > now + MONTHLY_SCREEN_FRESH_MS;
  if (!retained && !unknown && now <= expires) return null;
  return <p role="status" className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm">
    {retained ? "نتیجهٔ خواندن تازه در دسترس نیست. آخرین نتیجهٔ کامل نمایش داده شده است." :
      unknown ? "زمان آخرین خواندن کامل قابل تأیید نیست." : "زمان بازبینی این نتیجه رسیده است."}
    {" "}{label} · آخرین خواندن کامل {unknown ? "نامشخص" : screenTimestamp(checkedAt) + " (تهران)"}
  </p>;
}
