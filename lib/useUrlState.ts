"use client";

/**
 * وضعیتِ نما در URL — تا back/forward و «برگشت از صفحهٔ نماد» کار کنند.
 *
 * ── مسئله‌ای که حل می‌کند ─────────────────────────────────────────────────
 * فیلترِ صنعت، جست‌وجو و نمای انتخاب‌شده تا امروز فقط در `useState` بودند.
 * یعنی کاربری که در تابلوی سهام صنعتی را فیلتر می‌کرد، روی یک نماد کلیک
 * می‌کرد و «برگشت» می‌زد، به تابلویی برمی‌گشت که **همه‌چیزش پاک شده بود** و
 * باید از نو فیلتر می‌کرد. با نشستنِ وضعیت در URL، دکمهٔ برگشتِ مرورگر خودش
 * وضعیت را برمی‌گرداند و لینکِ صفحه هم قابلِ اشتراک می‌شود.
 *
 * ── مرزِ امنیتی ──────────────────────────────────────────────────────────
 * فقط وضعیتِ **غیرحساسِ نمایشی** اینجا می‌آید: نما، جست‌وجوی عمومی، فیلترِ
 * صنعت. هیچ توکن، شناسهٔ کاربر، یا دادهٔ سبد در URL نمی‌رود — URL در تاریخچهٔ
 * مرورگر، لاگِ سرور و Refererِ درخواست‌های بیرونی ثبت می‌شود.
 *
 * ── چرا `replace` و نه `push` ────────────────────────────────────────────
 * هر حرفی که کاربر تایپ می‌کند نباید یک ردیفِ تازه در تاریخچه بسازد؛ وگرنه
 * یک بار «برگشت» به‌جای صفحهٔ قبلی، حرفِ قبلیِ جست‌وجو را می‌آورد.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = useCallback(
    (key: string, fallback: string) => params.get(key) ?? fallback,
    [params],
  );

  const set = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        // مقدارِ پیش‌فرض در URL نمی‌ماند — URLِ تمیز، بدونِ پارامترِ بی‌معنی.
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { get, set };
}
