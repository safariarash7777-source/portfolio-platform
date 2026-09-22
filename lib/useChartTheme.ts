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
  /** خطِ راهنما — عمداً کم‌کنتراست، تا با خودِ داده رقابت نکند. */
  grid: string;
  /** برچسبِ محور — متن است، پس کنتراستِ متن می‌خواهد. */
  axis: string;
  /**
   * پالتِ **دسته‌ای** برای سری‌های نمودار، به ترتیبِ استفاده.
   *
   * تا امروز هر نمودار رنگِ خودش را می‌ساخت (۶۳ hexِ خام در کامپوننت‌ها)، پس
   * دو نمودار در یک صفحه دو زبانِ رنگی داشتند و هیچ‌کدام با تم نمی‌چرخید.
   * این آرایه از توکن‌های `--data-*` می‌آید که در هر دو تم بالای ۵:۱ هستند.
   */
  series: string[];
}

/** تعدادِ رنگ‌های دسته‌ایِ تعریف‌شده در `globals.css` (`--data-1` … `--data-6`). */
export const SERIES_COLOR_COUNT = 6;

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
    grid: v("--grid", "#EDEBE3"),
    axis: v("--axis", "#556274"),
    series: Array.from({ length: SERIES_COLOR_COUNT }, (_, i) =>
      v(`--data-${i + 1}`, "#1E3A8A"),
    ),
  };
}

/**
 * رنگِ سریِ nام — با چرخش، تا نموداری با هفت سری هم بی‌رنگ نماند.
 *
 * چرخش یعنی سریِ هفتم رنگِ سریِ اول را می‌گیرد؛ در آن حالت رنگ دیگر به‌تنهایی
 * سری را نمی‌گوید و UI باید برچسبِ مستقیم یا الگو هم بگذارد (قاعدهٔ
 * «رنگ تنها حاملِ معنا نباشد»).
 */
export function seriesColor(p: ChartPalette, index: number): string {
  const n = p.series.length || 1;
  return p.series[((index % n) + n) % n];
}

/** گزینه‌های ظاهریِ مشترکِ نمودار — همان‌هایی که با تغییرِ تم باید عوض شوند. */
export function chartThemeOptions(p: ChartPalette) {
  return {
    layout: { background: { color: p.bg }, textColor: p.text },
    // خطِ راهنما از `--grid` می‌آید نه `--line`: مرزِ کارت و شبکهٔ نمودار دو
    // نقشِ متفاوت‌اند و وقتی یک رنگ بودند، شبکه به‌اندازهٔ قابِ کارت پررنگ
    // می‌شد و چشم را از خطِ داده می‌دزدید.
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    rightPriceScale: { borderColor: p.line },
    timeScale: { borderColor: p.line },
  };
}
