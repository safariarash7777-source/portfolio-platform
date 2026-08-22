"use client";

import { useEffect, useState } from "react";
import {
  formatToman, formatUsd, formatSignedPercent, describeDelta, deltaColor,
} from "@/lib/format";
import { selectTickerAssets, type TickerAsset } from "@/lib/market-ticker-select";
import { computeFreshness } from "@/lib/market-freshness";

const REFRESH_MS = 5 * 60 * 1000; // هم‌گام با کشِ سرور
const TICK_MS = 30 * 1000;        // فقط ساعتِ نمایش؛ درخواستِ تازه نمی‌زند

/**
 * نوارِ قیمتِ صفحهٔ اصلی.
 *
 * سه چیزی که این نسخه اصلاح می‌کند:
 *
 *  ۱. **انتخابِ دارایی.** قبلاً هرچه `/api/market` می‌داد چسبانده می‌شد — ده‌ها
 *     ارز و قلمِ طلا. حالا فهرستِ ثابتِ `HOMEPAGE_TICKER_IDS` (حداکثر ۱۲).
 *     دادهٔ کامل در `/market` دست‌نخورده است؛ اینجا فقط انتخاب می‌شود.
 *
 *  ۲. **تازگی.** قبلاً `fetchedAt`ِ سطحِ بالا (CoinGecko) کنارِ قیمتِ دلار و سکه
 *     نوشته می‌شد. حالا `computeFreshness` مهرِ زمانیِ همان منابعی را می‌گیرد
 *     که واقعاً رندر شده‌اند و قدیمی‌ترین را گزارش می‌کند.
 *
 *  ۳. **خواندنِ صفحه‌خوان.** کپیِ دومِ نوار — که فقط برای پیوستگیِ حرکت است —
 *     `aria-hidden` است، پس قیمت‌ها یک بار خوانده می‌شوند نه دو بار. زیرِ
 *     `prefers-reduced-motion` اصلاً ساخته نمی‌شود و نوار به‌جای حرکت،
 *     افقی اسکرول می‌شود تا محتوا با کیبورد و لمس در دسترس بماند.
 */
export default function MarketTicker() {
  const [assets, setAssets] = useState<TickerAsset[] | null>(null);
  const [stamps, setStamps] = useState<{ ir: number | null; global: number | null }>({ ir: null, global: null });
  const [now, setNow] = useState<number>(() => Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market");
        const json = await res.json();
        if (!alive) return;
        setAssets(selectTickerAssets(json));
        setStamps({
          ir: typeof json?.ir?.fetchedAt === "number" ? json.ir.fetchedAt : null,
          global: typeof json?.fetchedAt === "number" ? json.fetchedAt : null,
        });
      } catch {
        if (alive) setAssets([]);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ساعتِ نمایش: بدونِ این، «۲ دقیقه پیش» تا refreshِ بعدی ثابت می‌ماند و
  // گذارِ تازه→کهنه پنج دقیقه دیر دیده می‌شود.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // لودینگ یا نبودِ داده → نوار اصلاً ظاهر نمی‌شود (ارتفاعِ صفر از ابتدا، بدون CLS).
  if (!assets || assets.length === 0) return null;

  const freshness = computeFreshness({
    irFetchedAt: stamps.ir,
    globalFetchedAt: stamps.global,
    usesIr: assets.some((a) => a.origin === "ir"),
    usesGlobal: assets.some((a) => a.origin === "global"),
    now,
  });

  const row = (a: TickerAsset) => (
    <li key={a.id} className="inline-flex items-center gap-2 px-5 text-xs whitespace-nowrap">
      <span className="font-bold" style={{ color: "var(--text)" }}>{a.label}</span>
      <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {a.unit === "usd" ? formatUsd(a.price) : formatToman(a.price)}
      </span>
      {a.changePercent != null && (
        <span className="font-bold" style={{ color: deltaColor(a.changePercent), fontVariantNumeric: "tabular-nums" }}>
          <span aria-hidden="true">{formatSignedPercent(a.changePercent)}</span>
          <span className="sr-only">{describeDelta(a.changePercent)}</span>
        </span>
      )}
    </li>
  );

  return (
    <div
      data-testid="market-ticker"
      className="border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center">
        {/* برچسبِ وضعیت — سمتِ راست در RTL */}
        <div
          className="relative z-10 flex flex-shrink-0 items-center gap-2 py-2.5 ps-5 pe-4 text-xs font-bold"
          style={{
            background: "var(--surface)",
            color: "var(--heading)",
            borderInlineEnd: "1px solid var(--line)",
          }}
        >
          {freshness.showLiveDot && <span className="live-dot" aria-hidden />}
          {freshness.state === "fresh" ? (
            <>
              <span>وضعیت بازار</span>
              {/* مهرِ زمانی روی موبایل جا ندارد؛ حذفش ادعایی اضافه نمی‌کند. */}
              <span className="hidden font-normal sm:inline" style={{ color: "var(--text-3)" }}>
                · {freshness.label}
              </span>
            </>
          ) : (
            /* کهنه و نامشخص هر دو قیدند — روی موبایل هم باید دیده شوند. */
            <span>{freshness.label}</span>
          )}
        </div>

        <div className={`ticker-wrap flex-1 py-2.5${reduceMotion ? " ticker-wrap--static" : ""}`} dir="rtl">
          <div className="ticker-track">
            <ul className="ticker-row" aria-label="قیمت‌های بازار">
              {assets.map(row)}
            </ul>
            {/*
              کپیِ دوم فقط برای پیوستگیِ حرکت است. `aria-hidden` تا صفحه‌خوان
              قیمت‌ها را دو بار نخواند. زیرِ reduced-motion ساخته نمی‌شود.
            */}
            {!reduceMotion && (
              <ul className="ticker-row" aria-hidden="true">
                {assets.map(row)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
