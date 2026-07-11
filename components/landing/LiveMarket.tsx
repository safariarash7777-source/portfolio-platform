"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";
import {
  formatUsd, formatSignedPercent, describeDelta, deltaColor, toPersianDigits,
} from "@/lib/format";

interface Row {
  id: string;
  faName: string;
  symbol: string;
  price: number;
  change24h: number | null;
}

interface MarketPayload {
  crypto: Row[];
  fetchedAt: number;
  ok: boolean;
}

const REFRESH_MS = 5 * 60 * 1000;
const SHOW = 8;

/**
 * پنلِ زندهٔ بازار در لندینگ — چیدمانِ پنل‌های قیمتِ تلگرامی (ردیف: نام/نماد،
 * قیمت، تغییرِ ۲۴ساعته). دادهٔ واقعی از /api/market؛ لودینگ = اسکلتون،
 * شکستِ منبع = حالتِ خالیِ صادقانه. هیچ عددِ ساختگی.
 * TODO(etfbaz): وقتی endpointِ دادهٔ بازارِ ایران (etfbaz) از محیطِ production
 * در دسترس و مستند شد، به‌عنوانِ providerِ دوم به همین پنل اضافه شود
 * (طلا/ارز/صندوق‌ها) — چیدمانِ ردیف‌ها همین می‌ماند.
 */
export default function LiveMarket() {
  const [data, setData] = useState<MarketPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market");
        const json = (await res.json()) as MarketPayload;
        if (!alive) return;
        if (json?.ok && json.crypto?.length) {
          setData(json);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const rows = data?.crypto.slice(0, SHOW) ?? [];
  const ageMin = data ? Math.max(0, Math.round((Date.now() - data.fetchedAt) / 60000)) : null;

  return (
    <section id="market" className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex flex-col items-center text-center gap-3 mb-10">
          <span className="eyebrow">رصد بازار</span>
          <h2
            className="font-display"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            بازار، همین حالا — زنده
          </h2>
          <div className="divider-gold" />
        </Reveal>

        <Reveal>
          <div className="card-elevated overflow-hidden max-w-3xl mx-auto">
            {/* هدر پنل */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}
            >
              <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                <span className="live-dot" aria-hidden />
                قیمت‌های لحظه‌ای
              </span>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                {ageMin != null
                  ? `به‌روزرسانی: ${ageMin === 0 ? "هم‌اکنون" : `${toPersianDigits(ageMin)} دقیقه پیش`}`
                  : failed
                    ? ""
                    : "در حال دریافت…"}
              </span>
            </div>

            {/* بدنه */}
            {failed ? (
              <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-3)" }}>
                دادهٔ بازار هم‌اکنون در دسترس نیست. چند دقیقهٔ دیگر دوباره سر بزنید.
              </div>
            ) : rows.length === 0 ? (
              <ul aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
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
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[color:var(--surface-2)]"
                    style={{ borderTop: i ? "1px solid var(--line)" : "none" }}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>
                        {r.faName}
                      </span>
                      <span className="text-[11px] uppercase" style={{ color: "var(--text-3)" }} dir="ltr">
                        {r.symbol}
                      </span>
                    </span>
                    <span className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm font-bold" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                        {formatUsd(r.price)}
                      </span>
                      {r.change24h != null && (
                        <span
                          className="inline-flex justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[72px]"
                          style={{
                            color: deltaColor(r.change24h),
                            background: r.change24h > 0
                              ? "rgba(21,128,61,0.09)"
                              : r.change24h < 0
                                ? "rgba(185,28,28,0.08)"
                                : "var(--surface-2)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span aria-hidden="true">{formatSignedPercent(r.change24h)}</span>
                          <span className="sr-only">{describeDelta(r.change24h)}</span>
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
                قیمت‌ها دلاری و صرفاً اطلاع‌رسانی‌اند؛ توصیهٔ خرید/فروش نیستند.
              </span>
              <Link href="/market" className="btn btn-outline" style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
                مشاهدهٔ کامل بازار
                <ArrowLeft size={14} />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
