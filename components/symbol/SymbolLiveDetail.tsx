"use client";

// T5-1 — جزئیات زندهٔ نماد از /api/symbol-detail (رله: Tsetmc/Symbol.php، کش ۳دقیقه‌ای)
// چهار بخش: عمق ۵سطحی، جریان حقیقی/حقوقی امروز، کارت‌های ارزش‌گذاری روز، مجامع.
// همهٔ قیمت‌های خام ریال است → نمایش تومان (÷۱۰). دادهٔ ناموجود → حالت خالی صادق.

import { useEffect, useState } from "react";
import { formatTomanShort, toPersianDigits } from "@/lib/format";

/** عدد فارسی با جداکنندهٔ هزارگان (نمایشی). */
const fmtNum = (v: number): string =>
  toPersianDigits(v.toLocaleString("en-US", { maximumFractionDigits: 2 })).replace(".", "٫");

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toman = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 10;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

type AssemblyItem = { title: string; date: string | null; content: string | null };

function parseAssembly(d: Raw): AssemblyItem[] {
  const arr = d.assembly;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((a): AssemblyItem | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Raw;
      const title = str(o.title);
      if (!title) return null;
      return {
        title,
        date: str(o.date_publish) ?? str(o.date_title) ?? str(o.date_send),
        content: str(o.content),
      };
    })
    .filter((x): x is AssemblyItem => x !== null);
}

export default function SymbolLiveDetail({
  symbol,
  sections = "all",
}: {
  symbol: string;
  /** "market" = عمق+جریان+کارت‌ها ، "assembly" = فقط مجامع ، "all" = همه */
  sections?: "market" | "assembly" | "all";
}) {
  const [data, setData] = useState<Raw | null>(null);
  const [stale, setStale] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [openAssembly, setOpenAssembly] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/symbol-detail?l18=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { stale?: boolean; data?: Raw }) => {
        if (!alive) return;
        if (j && j.data && typeof j.data === "object") {
          setData(j.data);
          setStale(Boolean(j.stale));
          setState("ok");
        } else setState("unavailable");
      })
      .catch(() => { if (alive) setState("unavailable"); });
    return () => { alive = false; };
  }, [symbol]);

  if (state === "loading") {
    return (
      <div className="card p-6 text-sm text-muted-foreground">در حال دریافت دادهٔ زندهٔ نماد…</div>
    );
  }
  if (state === "unavailable" || !data) {
    return (
      <div className="card p-6 text-sm text-muted-foreground">
        {sections === "assembly"
          ? "اطلاعات مجامع این نماد در دسترس نیست. این بخش به اتصال رلهٔ داده وابسته است و به‌محض برقراری، همین‌جا نمایش داده می‌شود."
          : "دادهٔ زندهٔ نماد در دسترس نیست. این بخش به اتصال رلهٔ داده وابسته است و به‌محض برقراری، همین‌جا نمایش داده می‌شود."}
      </div>
    );
  }

  const showMarket = sections === "market" || sections === "all";
  const showAssembly = sections === "assembly" || sections === "all";

  // ── عمق ۵سطحی ──────────────────────────────────────────────────────────────
  const depth = [1, 2, 3, 4, 5].map((i) => ({
    buyCount: num(data[`zd${i}`]),
    buyVol: num(data[`qd${i}`]),
    buyPrice: toman(data[`pd${i}`]),
    sellPrice: toman(data[`po${i}`]),
    sellVol: num(data[`qo${i}`]),
    sellCount: num(data[`zo${i}`]),
  }));
  const hasDepth = depth.some((r) => r.buyPrice !== null || r.sellPrice !== null);

  // ── جریان حقیقی/حقوقی ─────────────────────────────────────────────────────
  const buyCountI = num(data.Buy_CountI);
  const sellCountI = num(data.Sell_CountI);
  const buyVolI = num(data.Buy_I_Volume);
  const sellVolI = num(data.Sell_I_Volume);
  const buyVolN = num(data.Buy_N_Volume);
  const sellVolN = num(data.Sell_N_Volume);
  const close = toman(data.pc);
  // سرانهٔ خرید/فروش حقیقی (تومان) = (حجم × قیمت پایانی) ÷ تعداد کد
  const perCapBuy =
    buyVolI !== null && close !== null && buyCountI !== null && buyCountI > 0
      ? (buyVolI * close) / buyCountI : null;
  const perCapSell =
    sellVolI !== null && close !== null && sellCountI !== null && sellCountI > 0
      ? (sellVolI * close) / sellCountI : null;
  const powerRatio = perCapBuy !== null && perCapSell !== null && perCapSell > 0
    ? perCapBuy / perCapSell : null;
  const hasFlow = buyVolI !== null || sellVolI !== null;

  // ── کارت‌های ارزش‌گذاری روز ──────────────────────────────────────────────
  const eps = num(data.eps); // ریال — کنار قیمت ریالی معنا دارد؛ نمایش ریال صریح
  const pe = num(data.pe);
  const gpe = num(data.g_pe);
  const ps = num(data.ps);
  const low52 = toman(data.pmin_1y);
  const high52 = toman(data.pmax_1y);
  const last = toman(data.pl);
  const range52Pos =
    last !== null && low52 !== null && high52 !== null && high52 > low52
      ? Math.min(100, Math.max(0, ((last - low52) / (high52 - low52)) * 100)) : null;

  const assembly = parseAssembly(data);
  const updated = str(data.date_update) ?? str(data.date);

  return (
    <div className="space-y-4">
      {(stale || updated) && (
        <p className="text-xs text-muted-foreground">
          {stale ? "آخرین اسنپ‌شات موجود (خارج از ساعات بازار)" : "دادهٔ زنده"}
          {updated ? ` — به‌روزرسانی: ${updated}` : ""}
        </p>
      )}

      {/* کارت‌های ارزش‌گذاری روز */}
      {showMarket && (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">EPS (ریال)</p>
          <p className="mt-1 text-lg font-bold">{eps !== null ? fmtNum(eps) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">P/E نماد / گروه</p>
          <p className="mt-1 text-lg font-bold">
            {pe !== null ? fmtNum(pe) : "—"}
            <span className="mr-1 text-sm font-normal text-muted-foreground">
              / {gpe !== null ? fmtNum(gpe) : "—"}
            </span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">P/S</p>
          <p className="mt-1 text-lg font-bold">{ps !== null ? fmtNum(ps) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground">بازهٔ ۵۲ هفته (تومان)</p>
          <p className="mt-1 text-sm font-bold">
            {low52 !== null && high52 !== null
              ? `${fmtNum(low52)} تا ${fmtNum(high52)}`
              : "—"}
          </p>
          {range52Pos !== null && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted" dir="ltr">
              <div
                className="h-1.5 rounded-full bg-[var(--gold)]"
                style={{ width: `${range52Pos.toFixed(0)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* عمق بازار + جریان حقیقی/حقوقی */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="text-sm font-bold">عمق بازار (۵ سطح)</h3>
          {hasDepth ? (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 text-right font-normal">تعداد</th>
                  <th className="pb-2 text-right font-normal">حجم تقاضا</th>
                  <th className="pb-2 text-right font-normal">قیمت تقاضا</th>
                  <th className="pb-2 text-right font-normal">قیمت عرضه</th>
                  <th className="pb-2 text-right font-normal">حجم عرضه</th>
                  <th className="pb-2 text-right font-normal">تعداد</th>
                </tr>
              </thead>
              <tbody>
                {depth.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5">{r.buyCount !== null ? fmtNum(r.buyCount) : "—"}</td>
                    <td className="py-1.5">{r.buyVol !== null ? fmtNum(r.buyVol) : "—"}</td>
                    <td className="py-1.5 font-medium text-green-600 dark:text-green-400">
                      {r.buyPrice !== null ? fmtNum(r.buyPrice) : "—"}
                    </td>
                    <td className="py-1.5 font-medium text-red-600 dark:text-red-400">
                      {r.sellPrice !== null ? fmtNum(r.sellPrice) : "—"}
                    </td>
                    <td className="py-1.5">{r.sellVol !== null ? fmtNum(r.sellVol) : "—"}</td>
                    <td className="py-1.5">{r.sellCount !== null ? fmtNum(r.sellCount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">دفتر سفارش در دسترس نیست (خارج از ساعات بازار).</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">قیمت‌ها به تومان.</p>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-bold">جریان حقیقی/حقوقی امروز</h3>
          {hasFlow ? (
            <div className="mt-3 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">خرید حقیقی</p>
                  <p className="mt-0.5 font-bold">
                    {buyVolI !== null ? fmtNum(buyVolI) : "—"}
                    <span className="mr-1 font-normal text-muted-foreground">
                      ({buyCountI !== null ? `${fmtNum(buyCountI)} کد` : "—"})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">فروش حقیقی</p>
                  <p className="mt-0.5 font-bold">
                    {sellVolI !== null ? fmtNum(sellVolI) : "—"}
                    <span className="mr-1 font-normal text-muted-foreground">
                      ({sellCountI !== null ? `${fmtNum(sellCountI)} کد` : "—"})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">خرید حقوقی (حجم)</p>
                  <p className="mt-0.5 font-bold">{buyVolN !== null ? fmtNum(buyVolN) : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">فروش حقوقی (حجم)</p>
                  <p className="mt-0.5 font-bold">{sellVolN !== null ? fmtNum(sellVolN) : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">سرانهٔ خرید حقیقی</p>
                  <p className="mt-0.5 font-bold">{perCapBuy !== null ? formatTomanShort(perCapBuy) : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">سرانهٔ فروش حقیقی</p>
                  <p className="mt-0.5 font-bold">{perCapSell !== null ? formatTomanShort(perCapSell) : "—"}</p>
                </div>
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-muted-foreground">
                  نسبت سرانهٔ خرید به فروش حقیقی:{" "}
                  <span className="font-bold text-foreground">
                    {powerRatio !== null ? fmtNum(Math.round(powerRatio * 100) / 100) : "—"}
                  </span>
                </p>
                <p className="mt-1 text-[11px]">
                  تعریف: میانگین ارزش خرید هر کد حقیقی تقسیم بر میانگین ارزش فروش هر کد حقیقی، بر مبنای قیمت پایانی. صرفاً یک شاخص توصیفی است.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">دادهٔ جریان امروز در دسترس نیست.</p>
          )}
        </div>
      </div>

      </>)}

      {/* مجامع */}
      {showAssembly && assembly.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">مجامع</h3>
          <ul className="mt-3 divide-y divide-border">
            {assembly.map((a, i) => (
              <li key={i} className="py-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-right text-xs"
                  onClick={() => setOpenAssembly(openAssembly === i ? null : i)}
                >
                  <span className="font-medium">{a.title}</span>
                  <span className="shrink-0 text-muted-foreground">{a.date ?? ""}</span>
                </button>
                {openAssembly === i && a.content && (
                  <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                    {a.content}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showAssembly && sections === "assembly" && assembly.length === 0 && (
        <div className="card p-6 text-sm text-muted-foreground">
          برای این نماد اطلاعیهٔ مجمعی در فید فعلی ثبت نشده است.
        </div>
      )}
    </div>
  );
}
