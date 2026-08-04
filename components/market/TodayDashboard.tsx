// داشبورد «امروز بازار» — بازطراحی صفحهٔ رصد بازار (ابرتسک UI).
// فلسفه: در ۱۰ ثانیه بگوید «امروز در بازار چه خبر است» — هر بخش یک سؤال، جواب با نمودار.
// همهٔ داده از اسنپ‌شات و تاریخچهٔ موجود رله — صفر درخواست جدید به BrsApi.
// قانون سخت: دادهٔ غایب → حالت خالی صادق؛ هیچ واژهٔ تجویزی؛ ارقام فقط lib/format.
import Link from "next/link";
import type { IrMarket, IrStockRow } from "@/lib/market-ir";
import {
  computeMarketPulse,
  computeQueues,
  computeMoneyFlow,
  computeTopLists,
  toSparkPoints,
} from "@/lib/core/marketToday";
import { getFlowTrend } from "@/lib/core/breadthTrend";
import { getGoldUsdTrend } from "@/lib/core/trend";
import { getIndexTrend } from "@/lib/core/indexTrend";
import {
  toPersianDigits,
  formatTomanShort,
  formatPercent,
  formatJalali,
} from "@/lib/format";
import Sparkline from "./Sparkline";
import PulseHistogram from "./PulseHistogram";
import FlowTrendChart from "./FlowTrendChart";

/* ── قالب‌بندی محلی ─────────────────────────────────────────────────────── */

/** ارزش معاملات (ریال) → «X٫X همت» (همت = هزار میلیارد تومان = ۱۰ تریلیون ریال). */
function fmtHemt(rial: number): string {
  const hemt = rial / 10 / 1e12;
  const body = hemt >= 100 ? Math.round(hemt).toString() : hemt.toFixed(1);
  return `${toPersianDigits(body).replace(".", "٫")} همت`;
}

function fmtPrice(n: number): string {
  return toPersianDigits(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
}

/* ── کارت وضعیت ─────────────────────────────────────────────────────────── */

function StatusCard({
  title,
  value,
  sub,
  changePercent,
  spark,
  sparkNote,
}: {
  title: string;
  value: string | null;
  sub?: string;
  changePercent?: number | null;
  spark?: number[];
  sparkNote?: string;
}) {
  const up = typeof changePercent === "number" ? changePercent >= 0 : undefined;
  return (
    <div className="card px-4 py-3.5 flex flex-col justify-between gap-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px]" style={{ color: "var(--text-3)" }}>{title}</p>
        {typeof changePercent === "number" ? (
          <span
            className="text-[11.5px] font-bold whitespace-nowrap"
            style={{ color: changePercent >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}
          >
            {changePercent >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(changePercent))}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {value ? (
            <p className="font-display text-lg font-extrabold truncate" style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </p>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>دادهٔ به‌روز موجود نیست</p>
          )}
          {sub ? <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</p> : null}
        </div>
        {spark && spark.length >= 2 ? (
          <div className="flex-shrink-0" title={sparkNote}>
            <Sparkline values={spark} up={up} width={84} height={28} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── ردیف صف ────────────────────────────────────────────────────────────── */

function QueueList({
  title,
  color,
  items,
  count,
  totalToman,
  emptyMsg,
}: {
  title: string;
  color: string;
  items: Array<{ id: string; faName: string; queueValueToman: number }>;
  count: number;
  totalToman: number;
  emptyMsg: string;
}) {
  const max = Math.max(1, ...items.map((x) => x.queueValueToman));
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[13px] font-bold" style={{ color }}>{title}</p>
        <p className="text-[11px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          {toPersianDigits(count)} نماد · {formatTomanShort(totalToman)}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] py-3" style={{ color: "var(--text-3)" }}>{emptyMsg}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((x) => (
            <li key={x.id} className="flex items-center gap-2">
              <Link
                href={`/symbol/${encodeURIComponent(x.id)}`}
                className="text-[12.5px] font-medium hover:underline flex-shrink-0"
                style={{ color: "var(--navy-deep)", width: 76 }}
                title={x.faName || x.id}
              >
                {/* C1 — UI نمادمحور: فقط نماد */}
                {x.id}
              </Link>
              <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: "var(--surface-2)" }} dir="rtl">
                <div
                  className="h-full rounded"
                  style={{ width: `${Math.max(4, (x.queueValueToman / max) * 100)}%`, background: color, opacity: 0.8 }}
                />
              </div>
              <span className="text-[11px] flex-shrink-0 whitespace-nowrap" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                {formatTomanShort(x.queueValueToman)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── فهرست برترین‌ها ─────────────────────────────────────────────────────── */

function TopList({
  title,
  items,
  render,
}: {
  title: string;
  items: Array<{ id: string; faName: string }>;
  render: (x: never) => { text: string; color: string };
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-bold mb-2" style={{ color: "var(--text-2)" }}>{title}</p>
      {items.length === 0 ? (
        <p className="text-[11.5px]" style={{ color: "var(--text-3)" }}>داده‌ای نیست</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((x) => {
            const r = render(x as never);
            return (
              <li key={x.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <Link
                  href={`/symbol/${encodeURIComponent(x.id)}`}
                  className="font-medium truncate hover:underline"
                  style={{ color: "var(--navy-deep)" }}
                  title={x.faName || x.id}
                >
                  {/* C1 — UI نمادمحور: فقط نماد */}
                  {x.id}
                </Link>
                <span className="whitespace-nowrap font-bold" style={{ color: r.color, fontVariantNumeric: "tabular-nums" }}>
                  {r.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── داشبورد ────────────────────────────────────────────────────────────── */

export default async function TodayDashboard({ ir }: { ir: IrMarket | null }) {
  const stocks: IrStockRow[] = ir?.stocks ?? [];
  const fetchedAt = ir?.fetchedAt ?? null;

  const pulse = computeMarketPulse(stocks);
  const queues = computeQueues(stocks, 8);
  const flow = computeMoneyFlow(stocks);
  const tops = computeTopLists(stocks, 5);

  // سری‌های تاریخی برای اسپارک‌لاین و روند (خطاپذیر — همه best-effort)
  const [flowTrend, goldUsd, indexSeries] = await Promise.all([
    getFlowTrend(90).catch(() => []),
    getGoldUsdTrend(30).catch(() => []),
    getIndexTrend(30).catch(() => []),
  ]);

  const usdSeries = goldUsd.find((s) => s.id === "USD");
  const goldSeries = goldUsd.find((s) => s.id === "IR_GOLD_18K");
  const totalIndex = indexSeries.find((s) => s.id === "total");

  // مقادیر جاری نوار وضعیت از اسنپ‌شات
  const usdNow = ir?.currency?.find((c) => c.id === "USD") ?? null;
  const goldNow = ir?.gold?.find((g) => g.id === "IR_GOLD_18K") ?? null;
  const idx = ir?.indices ?? null;
  // totalChange تغییر شاخص به واحد «امتیاز» است (index_change خام tsetmc) — درصد را از مبنای دیروز حساب می‌کنیم
  const idxChangePct = (() => {
    if (!idx || !isFinite(idx.totalChange) || idx.totalChange === 0 || !(idx.total > 0)) return null;
    const base = idx.total - idx.totalChange;
    if (!(base > 0)) return null;
    const pct = (idx.totalChange / base) * 100;
    // محافظ: تغییر روزانهٔ بیش از ۲۵٪ برای شاخص کل نامعقول است — به‌جای عدد غلط، چیزی نشان نده
    return Math.abs(pct) <= 25 ? Math.round(pct * 100) / 100 : null;
  })();

  // ارزش معاملات امروز (مجموع ارزش نمادهای سهام؛ ریال)
  const totalValueRial = stocks.reduce((s, r) => s + (Number(r.value) > 0 ? Number(r.value) : 0), 0);

  const usdSpark = toSparkPoints((usdSeries?.points ?? []).map((p) => ({ label: p.date, value: p.price }))).map((p) => p.value);
  const goldSpark = toSparkPoints((goldSeries?.points ?? []).map((p) => ({ label: p.date, value: p.price }))).map((p) => p.value);
  const idxSpark = toSparkPoints((totalIndex?.points ?? []).map((p) => ({ label: p.jdate, value: p.value }))).map((p) => p.value);

  const hasMarket = pulse.totalTraded > 0;

  return (
    <section className="space-y-5">
      {/* سربرگ */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">رصد بازار</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
            امروز بازار
          </h1>
        </div>
        {fetchedAt ? (
          <p className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
            اسنپ‌شات: {formatJalali(fetchedAt)}
          </p>
        ) : null}
      </div>

      {/* ۱) نوار وضعیت */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCard
          title="شاخص کل بورس"
          value={idx && idx.total > 0 ? fmtPrice(idx.total) : idxSpark.length > 0 ? fmtPrice(idxSpark[idxSpark.length - 1]) : null}
          sub={idx?.state ? `وضعیت بازار: ${idx.state}` : idxSpark.length > 0 ? "آخرین ثبت روزانه" : "پس از اولین ثبت روزانه نمایش داده می‌شود"}
          changePercent={idxChangePct}
          spark={idxSpark}
          sparkNote="روند روزهای اخیر"
        />
        <StatusCard
          title="ارزش معاملات سهام"
          value={hasMarket && totalValueRial > 0 ? fmtHemt(totalValueRial) : null}
          sub={hasMarket ? `${toPersianDigits(pulse.totalTraded)} نماد معامله‌شده` : "خارج از ساعات بازار"}
        />
        <StatusCard
          title="دلار آزاد"
          value={usdNow && Number(usdNow.price) > 0 ? `${fmtPrice(Number(usdNow.price))} تومان` : null}
          changePercent={typeof usdNow?.changePercent === "number" ? usdNow.changePercent : null}
          spark={usdSpark}
          sparkNote="روند روزهای اخیر"
        />
        <StatusCard
          title="طلای ۱۸ عیار (گرم)"
          value={goldNow && Number(goldNow.price) > 0 ? `${fmtPrice(Number(goldNow.price))} تومان` : null}
          changePercent={typeof goldNow?.changePercent === "number" ? goldNow.changePercent : null}
          spark={goldSpark}
          sparkNote="روند روزهای اخیر"
        />
      </div>

      {/* ۲) نبض بازار + ۴) جریان پول حقیقی امروز */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="card px-5 py-4 lg:col-span-3">
          <h2 className="font-display text-base font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
            نبض بازار سهام
          </h2>
          <p className="text-[11.5px] mb-4" style={{ color: "var(--text-3)" }}>
            هر ستون: شمار نمادها در آن بازهٔ تغییر قیمت پایانی امروز
          </p>
          {hasMarket ? (
            <PulseHistogram pulse={pulse} />
          ) : (
            <p className="text-[12.5px] py-8 text-center" style={{ color: "var(--text-3)" }}>
              خارج از ساعات بازار — پس از شروع معاملات به‌روز می‌شود.
            </p>
          )}
        </div>

        <div className="card px-5 py-4 lg:col-span-2">
          <h2 className="font-display text-base font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
            پول حقیقی امروز
          </h2>
          <p className="text-[11.5px] mb-4" style={{ color: "var(--text-3)" }}>
            برآیند خرید و فروش اشخاص حقیقی در کل بازار
          </p>
          {flow.netRealFlowToman != null ? (
            <div className="space-y-3">
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>خالص خرید حقیقی</p>
                <p
                  className="font-display text-xl font-extrabold mt-0.5"
                  style={{ color: flow.netRealFlowToman >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}
                >
                  {flow.netRealFlowToman >= 0 ? "ورود " : "خروج "}
                  {formatTomanShort(Math.abs(flow.netRealFlowToman))}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <p className="text-[10.5px]" style={{ color: "var(--text-3)" }}>سرانهٔ خرید هر کد</p>
                  <p className="text-[13px] font-bold mt-0.5" style={{ color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                    {flow.perCapitaBuyToman != null ? formatTomanShort(flow.perCapitaBuyToman) : "—"}
                  </p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <p className="text-[10.5px]" style={{ color: "var(--text-3)" }}>سرانهٔ فروش هر کد</p>
                  <p className="text-[13px] font-bold mt-0.5" style={{ color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                    {flow.perCapitaSellToman != null ? formatTomanShort(flow.perCapitaSellToman) : "—"}
                  </p>
                </div>
              </div>
              {flow.powerRatio != null ? (
                <p className="text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  نسبت سرانهٔ خرید به فروش:{" "}
                  <b style={{ color: flow.powerRatio >= 1 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                    {toPersianDigits(flow.powerRatio.toFixed(2)).replace(".", "٫")}
                  </b>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12.5px] py-8 text-center" style={{ color: "var(--text-3)" }}>
              دادهٔ حقیقی/حقوقی هنوز در اسنپ‌شات امروز نیامده است.
            </p>
          )}
        </div>
      </div>

      {/* ۳) صف‌های خرید و فروش */}
      <div className="card px-5 py-4">
        <h2 className="font-display text-base font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
          صف‌های خرید و فروش
        </h2>
        <p className="text-[11.5px] mb-4" style={{ color: "var(--text-3)" }}>
          صف خرید: بهترین تقاضا روی سقف دامنه و عرضهٔ سطر اول صفر · صف فروش: بهترین عرضه روی کف دامنه و تقاضای سطر اول صفر — ارزش صف از سطر اول دفتر سفارش
        </p>
        {queues.fieldsAvailable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QueueList
              title="صف خرید"
              color="var(--success)"
              items={queues.buy}
              count={queues.buyCount}
              totalToman={queues.buyValueToman}
              emptyMsg="در حال حاضر هیچ نمادی در صف خرید نیست."
            />
            <QueueList
              title="صف فروش"
              color="var(--danger)"
              items={queues.sell}
              count={queues.sellCount}
              totalToman={queues.sellValueToman}
              emptyMsg="در حال حاضر هیچ نمادی در صف فروش نیست."
            />
          </div>
        ) : (
          <p className="text-[12.5px] py-6 text-center" style={{ color: "var(--text-3)" }}>
            دادهٔ دفتر سفارش در اسنپ‌شات فعلی موجود نیست — خارج از ساعات بازار یا تا به‌روزرسانی بعدی منبع.
          </p>
        )}
      </div>

      {/* ۴-ب) روند تاریخی پول حقیقی */}
      <div className="card px-5 py-4">
        <h2 className="font-display text-base font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
          روند روزانهٔ پول حقیقی
        </h2>
        <p className="text-[11.5px] mb-3" style={{ color: "var(--text-3)" }}>
          خالص خرید حقیقی هر روز (سبز = ورود، قرمز = خروج) — ثبت پایان هر روز معاملاتی
        </p>
        {flowTrend.length > 0 ? (
          <FlowTrendChart points={flowTrend} />
        ) : (
          <p className="text-[12.5px] py-6 text-center" style={{ color: "var(--text-3)" }}>
            دادهٔ این نمودار از امروز به بعد، پایان هر روز معاملاتی جمع می‌شود — هنوز ردیفی ثبت نشده است.
          </p>
        )}
      </div>

      {/* ۵) برترین‌های امروز */}
      <div className="card px-5 py-4">
        <h2 className="font-display text-base font-bold mb-4" style={{ color: "var(--navy-deep)" }}>
          برترین‌های امروز
        </h2>
        {hasMarket ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <TopList
              title="بیشترین رشد"
              items={tops.gainers}
              render={(x: { changePercent: number | null }) => ({
                text: x.changePercent != null ? formatPercent(x.changePercent) : "—",
                color: "var(--success)",
              })}
            />
            <TopList
              title="بیشترین افت"
              items={tops.losers}
              render={(x: { changePercent: number | null }) => ({
                text: x.changePercent != null ? formatPercent(x.changePercent) : "—",
                color: "var(--danger)",
              })}
            />
            <TopList
              title="بیشترین ارزش معاملات"
              items={tops.byValue}
              render={(x: { value: number }) => ({
                text: formatTomanShort(x.value / 10),
                color: "var(--navy-deep)",
              })}
            />
            <TopList
              title="بیشترین ورود پول حقیقی"
              items={tops.byNetReal}
              render={(x: { netRealToman: number | null }) => ({
                text: x.netRealToman != null ? formatTomanShort(x.netRealToman) : "—",
                color: "var(--success)",
              })}
            />
          </div>
        ) : (
          <p className="text-[12.5px] py-6 text-center" style={{ color: "var(--text-3)" }}>
            خارج از ساعات بازار — با شروع معاملات به‌روز می‌شود.
          </p>
        )}
      </div>

      <p className="text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        همهٔ ارقام از آخرین اسنپ‌شات بازار و تاریخچهٔ ثبت‌شدهٔ سامانه محاسبه می‌شوند. این صفحه صرفاً
        اطلاع‌رسانی است و هیچ‌کدام از بخش‌های آن توصیهٔ خرید یا فروش نیست.
      </p>
    </section>
  );
}
