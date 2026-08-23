"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";
import { hasRealPrice } from "@/lib/market-price";
import { hasRealChange } from "@/lib/market-ticker-select";
import { computeFreshness } from "@/lib/market-freshness";
import {
  formatToman, formatUsd, formatSignedPercent, describeDelta, deltaColor,
} from "@/lib/format";

interface GlobalRow {
  id: string;
  faName: string;
  symbol: string;
  price: number;
  change24h: number | null;
}
interface IrRow {
  id: string;
  faName: string;
  price: number;
  unit: "toman" | "usd";
  change?: number | null;
  changePercent?: number | null;
}
interface MarketPayload {
  crypto: GlobalRow[];
  goldGlobal?: GlobalRow[];
  fetchedAt: number;
  ok: boolean;
  ir?: {
    gold: IrRow[];
    currency: IrRow[];
    funds: IrRow[];
    stocks: IrRow[];
    ok: boolean;
    /** مهرِ زمانیِ **رله** — دادهٔ ایران با این سنجیده می‌شود، نه با `fetchedAt`ِ بالا. */
    fetchedAt?: number;
  } | null;
}

interface DisplayRow {
  id: string;
  faName: string;
  sub?: string;
  priceText: string;
  change: number | null;
}

const REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000; // فقط ساعتِ نمایش؛ درخواستِ تازه نمی‌زند
const SHOW = 8;

/**
 * درصدِ تغییر فقط وقتی عبور می‌کند که عددِ متناهی باشد.
 * `formatSignedPercent(NaN)` رشتهٔ «• ٪NaN» و `formatSignedPercent(Infinity)`
 * رشتهٔ «▲ ٪Infinity» می‌سازد — هر دو شبیهِ داده‌اند. `hasRealPrice` قیمت را
 * می‌گیرد ولی درصد را نمی‌گرفت.
 */
const safeChange = (v: unknown): number | null => (hasRealChange(v) ? v : null);

const toDisplay = {
  global: (r: GlobalRow): DisplayRow => ({
    id: r.id, faName: r.faName, sub: r.symbol, priceText: formatUsd(r.price), change: safeChange(r.change24h),
  }),
  ir: (r: IrRow): DisplayRow => ({
    id: r.id, faName: r.faName,
    priceText: r.unit === "usd" ? formatUsd(r.price) : formatToman(r.price),
    change: safeChange(r.changePercent), // درصد (نه مقدارِ مطلقِ تومان)
  }),
  // C1 — UI نمادمحور: سهام/صندوق فقط نماد (طلا/ارز/کریپتو نماد بورسی نیستند — نام می‌ماند).
  irTicker: (r: IrRow): DisplayRow => ({
    id: r.id, faName: r.id,
    priceText: r.unit === "usd" ? formatUsd(r.price) : formatToman(r.price),
    change: safeChange(r.changePercent),
  }),
};

/**
 * پنلِ زندهٔ بازار — تب‌های دسته‌ای (طلا/ارز/صندوق/سهام/کریپتو). هر تب فقط وقتی
 * ظاهر می‌شود که منبعش واقعاً داده داده باشد: دادهٔ ایران از رلهٔ داخلی
 * (lib/market-ir.ts + relay/)، دادهٔ جهانی از CoinGecko. لودینگ = اسکلتون،
 * شکستِ کامل = حالتِ خالیِ صادقانه. هیچ عددِ ساختگی.
 */
export default function LiveMarket() {
  const [data, setData] = useState<MarketPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market");
        const json = (await res.json()) as MarketPayload;
        if (!alive) return;
        const any =
          (json?.crypto?.length ?? 0) + (json?.goldGlobal?.length ?? 0) +
          (json?.ir ? json.ir.gold.length + json.ir.currency.length + json.ir.funds.length + json.ir.stocks.length : 0);
        if (any > 0) { setData(json); setFailed(false); }
        else setFailed(true);
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // بدونِ این، «۲ دقیقه پیش» تا refreshِ بعدی ثابت می‌ماند و گذارِ تازه→کهنه
  // پنج دقیقه دیرتر از واقعیت دیده می‌شود.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const cats = useMemo(() => {
    if (!data) return [];
    const ir = data.ir;
    // `usesIr` / `usesGlobal`: هر تب از کدام فید می‌خواند. تازگیِ هر تب با مهرِ
    // زمانیِ همان فید سنجیده می‌شود — تبِ «ارز» نباید با ساعتِ CoinGecko
    // برچسب بخورد و تبِ «کریپتو» نباید با ساعتِ رله.
    const list: {
      key: string; label: string; rows: DisplayRow[]; note?: string;
      usesIr: boolean; usesGlobal: boolean;
    }[] = [
      {
        key: "gold",
        label: "طلا و سکه",
        rows: [
          ...(ir?.gold ?? []).filter((r) => hasRealPrice(r.price)).map(toDisplay.ir),
          ...(data.goldGlobal ?? []).filter((r) => hasRealPrice(r.price)).map(toDisplay.global),
        ],
        usesIr: (ir?.gold ?? []).some((r) => hasRealPrice(r.price)),
        usesGlobal: (data.goldGlobal ?? []).some((r) => hasRealPrice(r.price)),
      },
      {
        key: "currency",
        label: "ارز",
        rows: (ir?.currency ?? []).filter((r) => hasRealPrice(r.price)).map(toDisplay.ir),
        usesIr: true,
        usesGlobal: false,
      },
      {
        key: "funds",
        label: "صندوق‌ها",
        rows: (ir?.funds ?? []).filter((r) => hasRealPrice(r.price)).map(toDisplay.irTicker),
        note: "NAV و بازدهِ روزانهٔ صندوق‌های طلا",
        usesIr: true,
        usesGlobal: false,
      },
      {
        key: "stocks",
        label: "سهام",
        rows: (ir?.stocks ?? []).filter((r) => hasRealPrice(r.price)).map(toDisplay.irTicker),
        usesIr: true,
        usesGlobal: false,
      },
      {
        key: "crypto",
        label: "کریپتو",
        rows: data.crypto.filter((r) => hasRealPrice(r.price)).map(toDisplay.global),
        usesIr: false,
        usesGlobal: true,
      },
    ];
    return list.filter((c) => c.rows.length > 0);
  }, [data]);

  const active = cats.find((c) => c.key === tab) ?? cats[0];

  // «کهنه» حالتِ سومی است بینِ سالم و در دسترس نبودن. بدونِ آن، دادهٔ دو ساعته
  // دقیقاً مثلِ دادهٔ لحظه‌ای به نظر می‌رسید.
  const freshness = computeFreshness({
    irFetchedAt: data?.ir?.fetchedAt ?? null,
    globalFetchedAt: data?.fetchedAt ?? null,
    usesIr: active?.usesIr ?? false,
    usesGlobal: active?.usesGlobal ?? false,
    now,
  });
  const isStale = freshness.state === "stale";

  return (
    <section id="market" className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="mb-10">
          <h2
            className="font-display"
            style={{
              color: "var(--heading)",
              fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
            }}
          >
            وضعیت امروز بازار
          </h2>
          <div aria-hidden className="divider-gold mt-4" />
        </Reveal>

        <Reveal>
          <div className="card-elevated overflow-hidden">
            {/* هدر + تب‌ها */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap"
              style={{ borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}
            >
              {/*
                عنوانِ «آخرین وضعیت بازار» عیناً تیترِ H2ِ همین سکشن را تکرار می‌کرد.
                حذف شد و جایش وضعیتِ تازگیِ داده — که باید حفظ شود — به برچسبِ
                اصلیِ پنل تبدیل شد.
              */}
              <span
                className="flex items-center gap-2 text-sm font-bold"
                style={{ color: isStale ? "var(--gold)" : "var(--heading)" }}
              >
                {/* نقطهٔ «زنده» فقط وقتی دادهٔ تازه داریم. روی دادهٔ کهنه یا
                    قطع‌شده، نشانهٔ زنده‌بودن یک ادعای غلط است. */}
                {!failed && freshness.showLiveDot && <span className="live-dot" aria-hidden />}
                {failed
                  ? "داده در دسترس نیست"
                  : !data
                    ? "در حال دریافت…"
                    : freshness.label}
              </span>
            </div>

            {cats.length > 1 && (
              <div
                className="flex gap-1 px-3 py-2 overflow-x-auto"
                style={{ borderBottom: "1px solid var(--line)" }}
                role="tablist"
                aria-label="دسته‌های بازار"
              >
                {cats.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={active?.key === c.key}
                    onClick={() => setTab(c.key)}
                    className="rounded-lg px-3.5 text-xs font-bold whitespace-nowrap transition-colors"
                    style={{
                      minHeight: 40,
                      ...(active?.key === c.key
                        ? { background: "var(--navy)", color: "var(--text-on-navy)" }
                        : { color: "var(--text-2)", background: "var(--surface-2)" }),
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {/* بدنه */}
            {failed ? (
              <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-3)" }}>
                دادهٔ بازار هم‌اکنون در دسترس نیست. چند دقیقهٔ دیگر دوباره سر بزنید.
              </div>
            ) : !active ? (
              /* سه ردیف، نه شش. اسکلتونِ بلند اولین برداشتِ بازدیدکننده را به یک
                 صفحهٔ نیمه‌ساخته تبدیل می‌کرد؛ ارتفاعِ کمتر همان اطلاع را می‌دهد
                 بدونِ آنکه صفحه را اشغال کند. */
              <ul aria-hidden>
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 px-5 py-3.5"
                      style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <span className="skeleton" style={{ width: 120, height: 14 }} />
                    <span className="skeleton" style={{ width: 90, height: 14 }} />
                    <span className="skeleton" style={{ width: 56, height: 20 }} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {active.rows.slice(0, SHOW).map((r, i) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[color:var(--surface-2)]"
                    style={{ borderTop: i ? "1px solid var(--line)" : "none" }}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>
                        {r.faName}
                      </span>
                      {r.sub && (
                        <span className="text-[11px] uppercase" style={{ color: "var(--text-3)" }} dir="ltr">
                          {r.sub}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm font-bold" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                        {r.priceText}
                      </span>
                      {r.change != null && (
                        <span
                          className="inline-flex justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[72px]"
                          style={{
                            color: deltaColor(r.change),
                            background: r.change > 0
                              ? "rgba(21,128,61,0.09)"
                              : r.change < 0
                                ? "rgba(185,28,28,0.08)"
                                : "var(--surface-2)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span aria-hidden="true">{formatSignedPercent(r.change)}</span>
                          <span className="sr-only">{describeDelta(r.change)}</span>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* فوتر پنل */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3.5"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {active?.note ?? "قیمت‌ها صرفاً اطلاع‌رسانی‌اند؛ توصیهٔ خرید/فروش نیستند."}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href="/data" className="btn btn-outline" style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
                  بانک دادهٔ نمادها
                  <ArrowLeft size={14} />
                </Link>
                <Link href="/market" className="btn btn-outline" style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
                  مشاهدهٔ کامل بازار
                  <ArrowLeft size={14} />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
