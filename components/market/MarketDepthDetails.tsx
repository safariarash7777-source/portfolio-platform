/**
 * جزئیاتِ عمقِ بازار — صف‌ها، روندِ پولِ حقیقی و برترین‌های امروز.
 *
 * ── چرا از نمای اول جدا شد ───────────────────────────────────────────────
 * این سه بخش در `TodayDashboard` بالای صفحه بودند و با هم بیش از نیمی از
 * ارتفاعِ `/market` را می‌گرفتند، در حالی که هیچ‌کدام «تصویرِ کلِ بازار» نیستند
 * — هر سه **جزئیاتِ تخصصی**اند. حالا داخلِ یک بخشِ بازشونده‌اند: قابلیت حذف
 * نشده، فقط دیگر جلوی چیزی را که کاربر اول لازم دارد نمی‌گیرد.
 *
 * هیچ محاسبه‌ای اینجا نیست؛ همهٔ ورودی‌ها از `lib/core/marketToday.ts` و
 * `lib/core/breadthTrend.ts` می‌آیند.
 */
import Link from "next/link";
import type { TopLists, FlowTrendPoint, QueuesSummary } from "@/lib/core/marketToday";
import { toPersianDigits, formatTomanShort, formatPercent } from "@/lib/format";
import FlowTrendChart from "./FlowTrendChart";

/* ── فهرست صف ───────────────────────────────────────────────────────────── */

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

/* ── بخش ─────────────────────────────────────────────────────────────────── */

export default function MarketDepthDetails({
  queues,
  tops,
  flowTrend,
  hasMarket,
}: {
  queues: QueuesSummary;
  tops: TopLists;
  flowTrend: FlowTrendPoint[];
  hasMarket: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* صف‌های خرید و فروش */}
      <section>
        <h3 className="font-display text-sm font-bold" style={{ color: "var(--heading)" }}>
          صف‌های خرید و فروش
        </h3>
        <p className="mb-3 mt-1 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
          صف خرید: بهترین تقاضا روی سقفِ دامنه و عرضهٔ سطرِ اول صفر · صف فروش: بهترین عرضه روی کفِ
          دامنه و تقاضای سطرِ اول صفر — ارزشِ صف از سطرِ اولِ دفترِ سفارش
        </p>
        {queues.fieldsAvailable ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
          /* «دفترِ سفارش در اسنپ‌شات نیست» با «هیچ نمادی در صف نیست» یکی نیست —
             اولی نبودِ داده است و دومی صفرِ واقعی. متن این دو را جدا می‌کند. */
          <p className="py-4 text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
            دادهٔ دفترِ سفارش در اسنپ‌شاتِ فعلی موجود نیست — خارج از ساعاتِ بازار یا تا به‌روزرسانیِ
            بعدیِ منبع.
          </p>
        )}
      </section>

      {/* روند روزانهٔ پول حقیقی */}
      <section className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <h3 className="font-display text-sm font-bold" style={{ color: "var(--heading)" }}>
          روند روزانهٔ پول حقیقی
        </h3>
        <p className="mb-3 mt-1 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
          خالصِ خریدِ حقیقیِ هر روز — ثبتِ پایانِ هر روزِ معاملاتی (درون‌روزی نیست)
        </p>
        {flowTrend.length > 0 ? (
          <FlowTrendChart points={flowTrend} />
        ) : (
          <p className="py-4 text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
            دادهٔ این نمودار پایانِ هر روزِ معاملاتی جمع می‌شود — هنوز ردیفی ثبت نشده است.
          </p>
        )}
      </section>

      {/* برترین‌های امروز */}
      <section className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <h3 className="mb-3 font-display text-sm font-bold" style={{ color: "var(--heading)" }}>
          برترین‌های امروز
        </h3>
        {hasMarket ? (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
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
                // ورودی ریالِ خامِ اسنپ‌شات است؛ تبدیل به تومان همین‌جا و یک بار.
                text: formatTomanShort(x.value / 10),
                color: "var(--navy)",
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
          <p className="py-4 text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
            خارج از ساعاتِ بازار — با شروعِ معاملات به‌روز می‌شود.
          </p>
        )}
      </section>
    </div>
  );
}
