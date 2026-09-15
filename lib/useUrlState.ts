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

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * متنِ ورودی که در URL هم آینه می‌شود — بدونِ از دست رفتنِ حرف.
 *
 * ── باگی که این هوک می‌بندد ───────────────────────────────────────────────
 * اولین تلاش، `value` کادرِ جست‌وجو را مستقیم از URL خواند و هر کلید را با
 * `router.replace` نوشت. نتیجه فاجعه بود: ورودی **کنترل‌شده** بود ولی منبعش
 * ناهمگام به‌روز می‌شد، پس کاربر «صندوقاا» تایپ می‌کرد و فقط «ا» در کادر
 * می‌ماند — بقیهٔ حروف بینِ رندرها گم می‌شدند.
 *
 * ── راه‌حل ───────────────────────────────────────────────────────────────
 * منبعِ حقیقتِ **تایپ** محلی است (بی‌درنگ، بدونِ گم‌شدن)، و URL با تأخیر
 * آینه می‌شود. وقتی URL از بیرون عوض شود — برگشت/جلوی مرورگر یا لینک — مقدارِ
 * محلی خودش را با آن هماهنگ می‌کند.
 *
 * تأخیر هم صرفهٔ دیگری دارد: بدونِ آن هر کلید یک `router.replace` و یک رندرِ
 * دوبارهٔ کلِ درخت می‌شد.
 */
export function useUrlBackedText(
  key: string,
  delayMs = 250,
): [string, (next: string) => void] {
  const { get, set } = useUrlState();
  const urlValue = get(key, "");

  const [local, setLocal] = useState(urlValue);
  /** آخرین مقداری که خودمان در URL نوشتیم — تا تغییرِ خودمان را «بیرونی» نخوانیم. */
  const ours = useRef(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (urlValue !== ours.current) {
      // تغییر از بیرون آمد (back/forward یا لینک) — کادر باید تبعیت کند.
      ours.current = urlValue;
      setLocal(urlValue);
    }
  }, [urlValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const update = useCallback(
    (next: string) => {
      setLocal(next); // بی‌درنگ — هیچ حرفی گم نمی‌شود
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        ours.current = next;
        set({ [key]: next });
      }, delayMs);
    },
    [delayMs, key, set],
  );

  return [local, update];
}

/**
 * مسیرِ فعلی همراه با queryِ فعلی — برای ساختِ `?from=`.
 *
 * ── چرا لازم است ────────────────────────────────────────────────────────
 * لینکِ نماد تا امروز مبدأ را به‌صورتِ رشتهٔ ثابت می‌داد (`/market/stocks`)، پس
 * «برگشت» به تابلوی **بی‌فیلتر** می‌رسید. مقصد باید وضعیتِ همان لحظه را حمل
 * کند؛ اعتبارسنجی‌اش در `resolveBackTarget` سمتِ مقصد انجام می‌شود.
 */
export function useCurrentHref(): string {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
