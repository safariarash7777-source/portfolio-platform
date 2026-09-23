"use client";

/**
 * تمِ جاری برای نمودارهای canvas، و پالتی که با تغییرِ تم دوباره خوانده می‌شود.
 *
 * ── مسئله‌ای که حل می‌کند ─────────────────────────────────────────────────
 * `lightweight-charts` روی canvas می‌کشد و متغیرهای CSS را نمی‌فهمد، پس رنگ‌ها
 * **یک بار در لحظهٔ mount** خوانده می‌شدند. نتیجه: کاربری که تم را عوض می‌کرد،
 * صفحه‌ای می‌دید که همه‌چیزش تیره شده بود جز نمودار — که با پس‌زمینهٔ روشن و
 * خطِ سرمه‌ای سرِ جایش مانده بود، تا وقتی صفحه دوباره بارگذاری شود.
 *
 * ── چرا نمودار بازساخته نمی‌شود ───────────────────────────────────────────
 * ساده‌ترین راه، گذاشتنِ تم در وابستگیِ افکتِ ساخت بود. ولی `createChart`
 * دوباره یعنی نمودارِ تازه: دادهٔ ست‌شده، بازهٔ زمانیِ انتخابیِ کاربر (زوم و
 * اسکرول) و موقعیتِ کراس‌هیر همه از بین می‌رفتند. پس این هوک فقط یک **نشانهٔ
 * تم** می‌دهد و مصرف‌کننده با `applyOptions` رنگ‌ها را عوض می‌کند — که نه به
 * داده دست می‌زند نه به بازهٔ دید.
 */

import { useEffect, useState } from "react";

export type ThemeToken = "light" | "dark";

/** خواندنِ تم از همان جایی که `ThemeToggle` می‌نویسد: کلاسِ `dark` روی `<html>`. */
function currentTheme(): ThemeToken {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * نشانهٔ تمِ جاری. با تغییرِ کلاسِ `<html>` (کلیدِ تمِ سایت) و با تغییرِ
 * ترجیحِ سیستم به‌روز می‌شود.
 *
 * مقدارِ اولیه عمداً `"light"` است و در اولین افکت اصلاح می‌شود: خواندنِ
 * `document` در رندرِ اولِ سرور ممکن نیست و hydration را ناهماهنگ می‌کند.
 */
export function useThemeToken(): ThemeToken {
  const [theme, setTheme] = useState<ThemeToken>("light");

  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // وقتی کاربر انتخابِ صریحی نکرده باشد، تم از ترجیحِ سیستم می‌آید و
    // می‌تواند بدونِ هیچ تغییری در DOM عوض شود.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", sync);
    };
  }, []);

  return theme;
}

export interface ChartPalette {
  bg: string;
  text: string;
  line: string;
  navy: string;
  gold: string;
}

/**
 * پالتِ نمودار از توکن‌های زندهٔ CSS.
 *
 * استثنای مستندِ C4: canvas متغیرِ CSS نمی‌فهمد، پس مقدارِ **خودِ توکن** در
 * زمانِ اجرا خوانده می‌شود و hex فقط fallbackِ هم‌ارزِ همان توکن است.
 */
export function readChartPalette(): ChartPalette {
  const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => cs?.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--surface", "#FFFFFF"),
    text: v("--text-2", "#334155"),
    line: v("--line", "#E5E3DC"),
    // `--navy-ink` و نه `--navy`: سرمهٔ برند روی زمینهٔ تیره تقریباً نامرئی است.
    navy: v("--navy-ink", "#1E3A8A"),
    gold: v("--gold", "#B8860B"),
  };
}

/** گزینه‌های ظاهریِ مشترکِ نمودار — همان‌هایی که با تغییرِ تم باید عوض شوند. */
export function chartThemeOptions(p: ChartPalette) {
  return {
    layout: { background: { color: p.bg }, textColor: p.text },
    grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
    rightPriceScale: { borderColor: p.line },
    timeScale: { borderColor: p.line },
  };
}
