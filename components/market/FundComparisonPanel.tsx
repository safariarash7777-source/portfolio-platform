"use client";

import Link from "next/link";
import { useState } from "react";
import { compareFunds, evidencedClass, fundSelectionIssue, MAX_FUND_COMPARISON, UNIT_CLASS_LABELS, type FundComparisonRow } from "@/lib/core/fundComparison";
import type { ReturnWindowKey } from "@/lib/core/fundReturns";
import { formatJalali, formatSignedPercent, formatToman, toPersianDigits } from "@/lib/format";

const windows: { key: ReturnWindowKey; label: string }[] = [
  { key: "w1", label: "بازده قیمت یک هفته" },
  { key: "m1", label: "بازده قیمت یک ماه" },
  { key: "m3", label: "بازده قیمت سه ماه" },
];
const clock = (date: string | null | undefined, time: string | null | undefined) =>
  `${date ? toPersianDigits(date) : "تاریخ نامشخص"} · ${time ? toPersianDigits(time) : "ساعت نامشخص"}`;
const money = (value: number | null | undefined, unit: FundComparisonRow["unit"]) =>
  typeof value !== "number" || !Number.isFinite(value) || value <= 0 ? "—"
    : unit === "toman" ? formatToman(value) : `${toPersianDigits(value.toLocaleString("en-US"))} دلار`;
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? formatJalali(value, false) : "تاریخ نامعتبر";
const emptySelection = () => Array<string>(MAX_FUND_COMPARISON).fill("");

/** Manual selection only. Changes in board filters never replace chosen funds. */
export default function FundComparisonPanel({ funds, from }: { funds: FundComparisonRow[]; from: string }) {
  const [ids, setIds] = useState<string[]>(emptySelection);
  const selected = ids.map(id => funds.find(fund => fund.id === id)).filter((row): row is FundComparisonRow => !!row);
  const choose = (slot: number, id: string) => setIds(previous => previous.map((value, i) => i === slot ? id : value));
  return (
    <section aria-labelledby="fund-comparison-title" className="card min-w-0 p-4 md:p-5">
      <h2 id="fund-comparison-title" className="text-base font-bold" style={{ color: "var(--heading)" }}>مقایسه صندوق‌های منتخب</h2>
      <p className="mt-2 text-xs leading-6" style={{ color: "var(--text-2)" }}>
        دو تا پنج صندوق با نوع منبع و واحد پول یکسان انتخاب کنید. مقدار مشاهده‌شده و امکان مقایسه هر معیار جدا نمایش داده می‌شود.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {ids.map((id, slot) => {
          const others = ids.filter((_, i) => i !== slot);
          const anchor = selected.find(row => row.id !== id);
          return (
            <label key={slot} className="min-w-0 text-xs" style={{ color: "var(--text-2)" }}>
              صندوق {toPersianDigits(slot + 1)}
              <select className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
                style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text)" }}
                value={id} onChange={event => choose(slot, event.target.value)}>
                <option value="">انتخاب صندوق</option>
                {funds.map(fund => {
                  const reason = others.includes(fund.id) ? "قبلاً انتخاب شده" : fundSelectionIssue(anchor, fund);
                  return <option key={fund.id} value={fund.id} disabled={!!reason && id !== fund.id}>
                    {fund.id}{reason ? ` · ${reason}` : ` · ${fund.type ?? "نوع نامشخص"}`}
                  </option>;
                })}
              </select>
            </label>
          );
        })}
      </div>
      {ids.some(Boolean) ? <button type="button" className="mt-2 min-h-11 px-2 text-xs underline" style={{ color: "var(--navy-ink)" }} onClick={() => setIds(emptySelection())}>پاک کردن انتخاب‌ها</button> : null}
      {ids.some(id => id && !funds.some(row => row.id === id)) ? <p role="status" className="text-xs" style={{ color: "var(--warning-ink)" }}>یکی از صندوق‌های منتخب در اسنپ‌شات موجود نیست؛ انتخاب تازه لازم است.</p> : null}
      {selected.length ? <FundComparisonDetails rows={selected} from={from} /> : <p role="status" className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>{funds.length ? "هنوز صندوقی انتخاب نشده است." : "داده صندوق در دسترس نیست؛ انتخاب پس از دریافت داده ممکن می‌شود."}</p>}
    </section>
  );
}

/** Kept separate so actual rows, nulls and evidence labels can be rendered offline. */
export function FundComparisonDetails({ rows, from }: { rows: FundComparisonRow[]; from: string }) {
  const comparison = compareFunds(rows);
  const metrics = [{ key: "bubble" as const, label: "حباب قابل مقایسه" }, ...windows];
  return (
    <div className="mt-3 min-w-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row, index) => {
          const unitClass = evidencedClass(row.classEvidence);
          const navClass = evidencedClass(row.navClassEvidence);
          return (
            <article key={row.id} className="min-w-0 rounded-lg border p-3 text-xs leading-6" style={{ borderColor: "var(--line)", overflowWrap: "anywhere" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--heading)" }}><Link className="inline-flex min-h-11 items-center underline" href={`/symbol/${encodeURIComponent(row.id)}?from=${encodeURIComponent(from)}`}>{row.id}</Link></h3>
              <dl>
                <dt style={{ color: "var(--text-3)" }}>نوع اعلام‌شده منبع</dt><dd>{row.type || "نامشخص"}</dd>
                <dt style={{ color: "var(--text-3)" }}>طبقه واحد قیمت</dt><dd>{unitClass ? UNIT_CLASS_LABELS[unitClass] : "نامشخص؛ شاهد طبقه واحد موجود نیست"}</dd>
                <dt style={{ color: "var(--text-3)" }}>قیمت پایانی مشاهده‌شده</dt><dd>{money(row.closingPrice, row.unit)}</dd>
                <dt style={{ color: "var(--text-3)" }}>زمان منبع قیمت</dt><dd>{clock(row.sourceDate, row.sourceTime)}</dd>
                <dt style={{ color: "var(--text-3)" }}>NAV ابطال مشاهده‌شده</dt><dd>{money(row.nav, "toman")}</dd>
                <dt style={{ color: "var(--text-3)" }}>زمان منبع NAV</dt><dd>{clock(row.navDate, row.navTime)}</dd>
                <dt style={{ color: "var(--text-3)" }}>طبقه واحد NAV</dt><dd>{navClass ? UNIT_CLASS_LABELS[navClass] : "نامشخص"}</dd>
                <dt style={{ color: "var(--text-3)" }}>کیفیت تطبیق زمانی NAV</dt><dd>{row.navState === "ready" ? "گارد زمانی موجود معتبر؛ طبقه واحد مستقل بررسی می‌شود" : row.navReason || "اعتبار نامشخص"}</dd>
                <dt style={{ color: "var(--text-3)" }}>حباب قابل مقایسه</dt><dd>{comparison.bubbles[index] == null ? "—" : formatSignedPercent(comparison.bubbles[index]!)}</dd>
                {windows.map(window => {
                  const observation = row.returnObservations?.[window.key];
                  return <div key={window.key} className="mt-2">
                    <dt style={{ color: "var(--text-3)" }}>{window.label} مشاهده‌شده</dt>
                    <dd>{observation && Number.isFinite(observation.value) ? formatSignedPercent(observation.value) : "—"}</dd>
                    {observation ? <dd>{dateLabel(observation.periodStart)} تا {dateLabel(observation.periodEnd)} · {observation.startField === "close" && observation.endField === "close" ? "پایانی" : "دارای قیمت آخرین معامله"}</dd> : <dd>شاهد دوره موجود نیست</dd>}
                  </div>;
                })}
              </dl>
            </article>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg p-3 text-xs leading-6" style={{ background: "var(--surface-2)", color: "var(--text-2)" }} aria-live="polite">
        {metrics.map(metric => {
          const issues = comparison.issues.filter(issue => issue.metric === "group" || issue.metric === metric.key);
          return <div key={metric.key} className="mb-2 last:mb-0"><strong>{metric.label}: </strong>{issues.length ? <ul>{issues.map(issue => <li key={`${issue.metric}-${issue.code}`}>{issue.message} · {issue.ids.join("، ")}</li>)}</ul> : "تعریف و دوره ورودی‌ها همسان است؛ رتبه‌بندی سرمایه‌گذاری انجام نمی‌شود"}</div>;
        })}
      </div>
      <p className="mt-3 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        منبع قیمت و NAV: داده بازار BrsApi، آخرین داده ثبت‌شده؛ زمان دریافت جای زمان منبع نیست. بازده قیمت از تاریخچه ثبت‌شده محاسبه شده، تعدیل‌نشده و بدون سود تقسیمی و هزینه‌ها است؛ بازده کل نیست. فرض سرمایه‌گذاری مجدد در داده مشخص نیست.
        طبقه واحد عادی صدور و ابطال و واحد ممتاز قابل معامله صندوق اهرمی از روی نام یا نوع صندوق تعیین نمی‌شود. ترکیب دارایی و حساسیت اهرمی از این داده محاسبه نمی‌شود. هزینه‌ها و زمان انتشار مستقل در داده موجود نیست.
      </p>
    </div>
  );
}
