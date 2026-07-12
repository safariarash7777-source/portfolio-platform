"use client";

import { useMemo, useState } from "react";
import { PieChart } from "lucide-react";
import { toPersianDigits, formatSignedPercent, deltaColor, describeDelta } from "@/lib/format";

export interface FundRow {
  id: string;
  faName: string;
  type?: string;
  change?: number | null;
  assetB?: number | null; // خالص دارایی، میلیارد تومان
}

/** میلیارد تومان → متن فارسی؛ ≥۱۰۰۰ → «هزار میلیارد». */
function fmtAssetB(b: number): string {
  if (b >= 1000) {
    const t = b / 1000;
    return `${toPersianDigits(t.toFixed(t % 1 === 0 ? 0 : 1)).replace(".", "٫")} هزار میلیارد تومان`;
  }
  return `${toPersianDigits(b.toLocaleString("en-US")).replace(/,/g, "٬")} میلیارد تومان`;
}

/** پس‌زمینه/متنِ کاشیِ نقشهٔ بازار بر پایهٔ تغییرِ روز — توکنِ semantic + شدت بر حسب اندازه. */
function tile(change: number | null) {
  if (change == null) return { bg: "var(--surface-2)", fg: "var(--text-2)" };
  const mag = Math.min(Math.abs(change), 4) / 4; // 0..1
  const a = 0.16 + mag * 0.64; // 0.16..0.8
  const base = change > 0 ? "21,128,61" : change < 0 ? "185,28,28" : "100,116,139";
  return { bg: `rgba(${base},${a.toFixed(2)})`, fg: a > 0.5 ? "var(--text-on-navy)" : "var(--text)" };
}

/**
 * دیده‌بانِ صندوق‌ها — الگوی مشترکِ داشبوردهای صندوق (KPI + فیلترِ نوع + نقشهٔ
 * بازار + برترین‌ها + نسبتِ مثبت/منفی). دادهٔ واقعی از رلهٔ fipiran؛ اندازهٔ
 * کاشی = خالص دارایی، رنگ = تغییرِ روز. هیچ عددِ ساختگی؛ خالی → حالتِ صادقانه.
 * فقط ویژگی‌هایی که با دادهٔ موجود «قابل‌اثبات» است — نه ورود پول/سرانه/حقوقی.
 */
export default function FundsBoard({ funds }: { funds: FundRow[] }) {
  const types = useMemo(() => {
    const s = new Set<string>();
    for (const f of funds) if (f.type) s.add(f.type);
    return ["همه", ...[...s]];
  }, [funds]);
  const [type, setType] = useState("همه");

  const rows = useMemo(
    () => (type === "همه" ? funds : funds.filter((f) => f.type === type)),
    [funds, type]
  );

  const stats = useMemo(() => {
    const withChange = rows.filter((f) => typeof f.change === "number") as Required<Pick<FundRow, "change">>[] & FundRow[];
    const totalAsset = rows.reduce((s, f) => s + (f.assetB ?? 0), 0);
    const avg = withChange.length ? withChange.reduce((s, f) => s + (f.change as number), 0) / withChange.length : null;
    const pos = withChange.filter((f) => (f.change as number) > 0).length;
    const posRatio = withChange.length ? Math.round((pos / withChange.length) * 100) : null;
    return { count: rows.length, totalAsset, avg, posRatio, rated: withChange.length };
  }, [rows]);

  if (funds.length === 0) {
    return (
      <div className="card p-6 flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}>
          <PieChart size={18} />
        </span>
        <div>
          <h3 className="font-display font-bold" style={{ color: "var(--navy-deep)" }}>دیده‌بان صندوق‌ها</h3>
          <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
            به‌محضِ اتصالِ منبعِ دادهٔ بازارِ ایران، خالص دارایی، بازده روز و نقشهٔ صندوق‌ها همین‌جا نمایش داده می‌شود.
          </p>
        </div>
      </div>
    );
  }

  const top = [...rows].sort((a, b) => (b.assetB ?? 0) - (a.assetB ?? 0));
  const mapCells = top.slice(0, 24);
  const list = top.slice(0, 8);

  // نقشهٔ بازار را در ردیف‌های ۴تایی (موبایل ۲) با flex-grow ∝ دارایی می‌چینیم.
  const rowsOf = <T,>(arr: T[], n: number) =>
    arr.reduce<T[][]>((acc, x, i) => (i % n ? acc[acc.length - 1].push(x) : acc.push([x]), acc), []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="eyebrow">رصد صندوق‌ها</span>
          <h2 className="font-display text-xl md:text-2xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
            دیده‌بان صندوق‌های سرمایه‌گذاری
          </h2>
        </div>
      </div>

      {/* فیلترِ نوع */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="نوع صندوق">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className="rounded-full px-4 text-xs font-bold whitespace-nowrap transition-colors"
            style={{
              minHeight: 40,
              ...(type === t
                ? { background: "var(--navy)", color: "var(--text-on-navy)" }
                : { background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--line)" }),
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* KPIها */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="تعداد صندوق" value={toPersianDigits(stats.count)} />
        <Kpi label="جمع دارایی" value={fmtAssetB(stats.totalAsset)} small />
        <Kpi
          label="میانگین بازده روز"
          value={stats.avg == null ? "—" : formatSignedPercent(stats.avg)}
          color={stats.avg == null ? undefined : deltaColor(stats.avg)}
        />
        <Kpi
          label="نسبت مثبت"
          value={stats.posRatio == null ? "—" : `٪${toPersianDigits(stats.posRatio)}`}
          color={stats.posRatio == null ? undefined : stats.posRatio >= 50 ? "var(--success)" : "var(--danger)"}
        />
      </div>

      {/* نسبت مثبت/منفی */}
      {stats.posRatio != null && (
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ border: "1px solid var(--line)" }}
               role="img" aria-label={`${toPersianDigits(stats.posRatio)} درصد صندوق‌ها مثبت`}>
            <div style={{ width: `${stats.posRatio}%`, background: "var(--success)" }} />
            <div style={{ width: `${100 - stats.posRatio}%`, background: "var(--danger)" }} />
          </div>
          <div className="flex justify-between mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span>مثبت ٪{toPersianDigits(stats.posRatio)}</span>
            <span>منفی ٪{toPersianDigits(100 - stats.posRatio)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* نقشهٔ بازار */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-display font-bold mb-1" style={{ color: "var(--navy-deep)" }}>نقشهٔ بازار</h3>
          <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>
            اندازه: خالص دارایی · رنگ: بازده روز
          </p>
          <div className="space-y-1.5">
            {rowsOf(mapCells, 4).map((r, ri) => (
              <div key={ri} className="flex gap-1.5">
                {r.map((f) => {
                  const t = tile(f.change ?? null);
                  return (
                    <div
                      key={f.id}
                      className="rounded-md px-2 py-2 min-w-0 flex flex-col justify-center"
                      style={{ flexGrow: Math.max(f.assetB ?? 1, 1), flexBasis: 0, background: t.bg, minWidth: 64, minHeight: 56 }}
                      title={`${f.faName} — ${f.change != null ? formatSignedPercent(f.change) : "—"}`}
                    >
                      <span className="text-[11px] font-bold truncate" style={{ color: t.fg }}>{f.faName}</span>
                      {f.change != null && (
                        <span className="text-[11px]" style={{ color: t.fg, fontVariantNumeric: "tabular-nums" }}>
                          <span aria-hidden="true">{formatSignedPercent(f.change)}</span>
                          <span className="sr-only">{describeDelta(f.change)}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* برترین‌ها بر اساس دارایی */}
        <div className="card p-5">
          <h3 className="font-display font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
            بزرگ‌ترین صندوق‌ها
          </h3>
          <ul className="space-y-2.5">
            {list.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-sm font-bold truncate block" style={{ color: "var(--text)" }}>{f.faName}</span>
                  {f.assetB != null && (
                    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{fmtAssetB(f.assetB)}</span>
                  )}
                </span>
                {f.change != null && (
                  <span className="text-sm font-bold flex-shrink-0" style={{ color: deltaColor(f.change), fontVariantNumeric: "tabular-nums" }}>
                    <span aria-hidden="true">{formatSignedPercent(f.change)}</span>
                    <span className="sr-only">{describeDelta(f.change)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        داده از صندوق‌های سرمایه‌گذاری (منبع رسمی)؛ صرفاً اطلاع‌رسانی و بدون توصیهٔ خرید/فروش.
      </p>
    </div>
  );
}

function Kpi({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>{label}</p>
      <p
        className={`font-display font-bold mt-1.5 ${small ? "text-sm" : "text-xl md:text-2xl"}`}
        style={{ color: color ?? "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
    </div>
  );
}
