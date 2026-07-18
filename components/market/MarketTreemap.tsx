"use client";

// نقشهٔ بازار (T2-ج) — treemap با recharts (کتابخانهٔ موجود پروژه، بدون وابستگی جدید).
// اندازهٔ کاشی: ارزش معاملات روز (تومان) یا ارزش بازار — قابل انتخاب.
// رنگ کاشی: درصد تغییر پایانی در ۷ پلهٔ سبز/خاکستری/قرمز (همان پله‌های نبض بازار).
// کلیک روی کاشی → صفحهٔ نماد. دادهٔ ناموجود حذف می‌شود — هیچ عدد ساختگی.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { toPersianDigits, formatSignedPercent, formatTomanShort } from "@/lib/format";
import type { IrStockRow } from "@/lib/market-ir";

type SizeMode = "value" | "marketValue";
type Universe = "stocks" | "funds";

function num(x: unknown): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** رنگ ۷پله‌ای بر اساس درصد تغییر — همان بازه‌های «نبض بازار» */
function bucketColor(chg: number | null): string {
  if (chg == null) return "#9ca3af";
  if (chg > 4) return "#15803d";
  if (chg > 2) return "#22c55e";
  if (chg > 0.5) return "#86efac";
  if (chg >= -0.5) return "#9ca3af";
  if (chg >= -2) return "#fca5a5";
  if (chg >= -4) return "#ef4444";
  return "#b91c1c";
}

interface TileDatum {
  name: string;
  size: number;
  chg: number | null;
  sizeLabel: string;
  [key: string]: unknown;
}

function Tile(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  chg?: number | null;
  onOpen: (name: string) => void;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", chg = null, onOpen } = props;
  if (width < 4 || height < 4 || !name) return null;
  const showText = width > 44 && height > 26;
  const showPct = width > 56 && height > 42;
  return (
    <g onClick={() => onOpen(name)} style={{ cursor: "pointer" }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bucketColor(chg)}
        stroke="var(--bg)"
        strokeWidth={1.5}
        rx={3}
      />
      {showText ? (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showPct ? -6 : 4)}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={Math.min(14, Math.max(10, width / 8))}
          fontWeight={700}
          style={{ pointerEvents: "none" }}
        >
          {name}
        </text>
      ) : null}
      {showPct && chg != null ? (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={10}
          style={{ pointerEvents: "none" }}
        >
          {formatSignedPercent(chg)}
        </text>
      ) : null}
    </g>
  );
}

export default function MarketTreemap({
  stocks,
  funds,
}: {
  stocks: IrStockRow[];
  funds: IrStockRow[];
}) {
  const router = useRouter();
  const [universe, setUniverse] = useState<Universe>("stocks");
  const [sizeMode, setSizeMode] = useState<SizeMode>("value");

  const data: TileDatum[] = useMemo(() => {
    const base = universe === "stocks" ? stocks : funds;
    const items: TileDatum[] = [];
    for (const r of base) {
      // value = ریال → تومان /10؛ marketValue = ریال → تومان /10
      const raw = sizeMode === "value" ? num(r.value) : num(r.marketValue);
      if (raw == null || raw <= 0) continue;
      const toman = raw / 10;
      items.push({
        name: r.id,
        size: toman,
        chg: num(r.closingChangePercent) ?? num(r.changePercent),
        sizeLabel: formatTomanShort(toman),
      });
    }
    items.sort((a, b) => b.size - a.size);
    return items.slice(0, 150);
  }, [stocks, funds, universe, sizeMode]);

  const openSymbol = (name: string) => {
    router.push(`/symbol/${encodeURIComponent(name)}`);
  };

  const seg = (
    on: boolean
  ): React.CSSProperties =>
    on
      ? { background: "var(--navy)", color: "var(--text-on-navy)" }
      : { color: "var(--text-3)" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-full border p-1"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <button
            type="button"
            onClick={() => setUniverse("stocks")}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={seg(universe === "stocks")}
          >
            سهام
          </button>
          <button
            type="button"
            onClick={() => setUniverse("funds")}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={seg(universe === "funds")}
          >
            صندوق‌ها
          </button>
        </div>
        <div
          className="flex rounded-full border p-1"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <button
            type="button"
            onClick={() => setSizeMode("value")}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={seg(sizeMode === "value")}
          >
            اندازه: ارزش معاملات
          </button>
          <button
            type="button"
            onClick={() => setSizeMode("marketValue")}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={seg(sizeMode === "marketValue")}
          >
            اندازه: ارزش بازار
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          {toPersianDigits(data.length)} نماد بزرگ‌تر بر اساس {sizeMode === "value" ? "ارزش معاملات امروز" : "ارزش بازار"} — رنگ: درصد تغییر پایانی
        </p>
      </div>

      {data.length === 0 ? (
        <div
          className="mt-5 rounded-2xl border px-5 py-10 text-center text-sm"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-3)" }}
        >
          داده‌ای برای نمایش موجود نیست — خارج از ساعات بازار یا داده هنوز دریافت نشده است.
        </div>
      ) : (
        <div
          className="mt-5 overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div style={{ width: "100%", height: 560 }} dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={data}
                dataKey="size"
                nameKey="name"
                isAnimationActive={false}
                content={<Tile onOpen={openSymbol} />}
              >
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as TileDatum | undefined;
                    if (!p) return null;
                    return (
                      <div
                        dir="rtl"
                        className="rounded-xl border px-3 py-2 text-xs shadow-sm"
                        style={{
                          borderColor: "var(--line)",
                          background: "var(--surface)",
                          color: "var(--navy-deep)",
                        }}
                      >
                        <p className="font-bold">{p.name}</p>
                        <p className="mt-1" style={{ color: "var(--text-2)" }}>
                          {sizeMode === "value" ? "ارزش معاملات: " : "ارزش بازار: "}
                          {p.sizeLabel}
                        </p>
                        <p style={{ color: "var(--text-2)" }}>
                          تغییر پایانی: {p.chg != null ? formatSignedPercent(p.chg) : "—"}
                        </p>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
        <span>راهنمای رنگ:</span>
        {[
          { l: "> ٪۴", c: "#15803d" },
          { l: "٪۲ تا ٪۴", c: "#22c55e" },
          { l: "٪۰٫۵ تا ٪۲", c: "#86efac" },
          { l: "±٪۰٫۵", c: "#9ca3af" },
          { l: "−٪۰٫۵ تا −٪۲", c: "#fca5a5" },
          { l: "−٪۲ تا −٪۴", c: "#ef4444" },
          { l: "< −٪۴", c: "#b91c1c" },
        ].map((b) => (
          <span key={b.l} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: b.c }} />
            {b.l}
          </span>
        ))}
      </div>
    </div>
  );
}
