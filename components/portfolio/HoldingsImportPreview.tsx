"use client";
import { useRef, useState } from "react";
import type { HoldingPosition } from "@/lib/portfolio/contracts";
import { IMPORT_FIELDS, parseHoldingsCsv, previewHoldingsImport, type ImportMapping, type ImportTable } from "@/lib/portfolio/importPreview";
import { formatToman, toPersianDigits } from "@/lib/format";

const labels: Record<string, string> = { position_key: "شناسه قلم", symbol: "نماد", manual_label: "عنوان دستی", asset_class: "دسته دارایی", qty: "مقدار", unit: "واحد مقدار", as_of: "تاریخ مقدار", ownership_pct: "مالکیت (درصد)", valuation_mode: "روش ارزش‌گذاری", declared_value: "ارزش کل قلم", currency: "واحد پول (IRR/IRT)", valuation_source: "منبع ارزش", valuation_as_of: "تاریخ ارزش", valuation_status: "وضعیت ارزش", cost_basis: "بهای تمام‌شده", cost_basis_currency: "واحد پول بهای تمام‌شده", title: "عنوان اختیاری" };
export default function HoldingsImportPreview({ current, disabled, onApply }: { current: readonly HoldingPosition[]; disabled: boolean; onApply: (positions: Record<string, unknown>[]) => void }) {
  const [table, setTable] = useState<ImportTable | null>(null), [mapping, setMapping] = useState<ImportMapping>({}), [error, setError] = useState("");
  const [updates, setUpdates] = useState(false), [confirmedDigest, setConfirmedDigest] = useState<string | null>(null);
  const fileSequence = useRef(0);
  const preview = table ? previewHoldingsImport(table, mapping, current, updates) : null;
  const previewSignature = JSON.stringify({ table, mapping, current, updates });
  const confirmed = confirmedDigest === previewSignature;
  return <section className="card p-5 space-y-4" aria-label="ورود فایل دارایی">
    <h2 className="font-display text-lg font-bold">ورود فایل با پیش‌نمایش</h2>
    <p className="text-sm leading-7">فایل CSV با عنوان ستون، حداکثر ۵۰۰ قلم و یک مگابایت انتخاب کنید. فایل در همین مرورگر بررسی می‌شود؛ پیش‌نمایش چیزی ثبت نمی‌کند. اقلام خارج از فایل حفظ می‌شوند.</p>
    <p className="text-xs leading-7">دسته‌های طلا، درآمد ثابت، سهام ایران، ارز و نقد؛ روش‌های «قیمت بازار»، «ارزش اظهارشده» و «بدون قیمت»؛ واحد پول ریال یا تومان پذیرفته می‌شوند. تاریخ به شکل YYYY-MM-DD است. مقدار و ارزش مربوط به کل قلم پیش از سهم مالکیت‌اند.</p>
    <a className="btn btn-outline inline-block" download="holdings-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFFposition_key,manual_label,asset_class,qty,unit,as_of,ownership_pct,valuation_mode,declared_value,currency,valuation_source,valuation_as_of,valuation_status\nexample,نمونه قابل ویرایش,طلا,1,گرم,YYYY-MM-DD,100,بدون قیمت,,,,,\n')}`}>دریافت نمونهٔ فایل قابل ویرایش</a>
    <input type="file" accept=".csv,text/csv" aria-label="فایل CSV دارایی" disabled={disabled} onChange={async e => {
      const file = e.target.files?.[0]; const sequence = ++fileSequence.current; setConfirmedDigest(null); setTable(null); setError("");
      if (!file) return;
      try { if (file.size > 1_000_000) throw new Error("فایل بیش از یک مگابایت است."); const t = parseHoldingsCsv(await file.text()); if (sequence !== fileSequence.current) return; setTable(t); setMapping(Object.fromEntries(IMPORT_FIELDS.filter(k => t.headers.includes(k)).map(k => [k, k]))); }
      catch (err) { if (sequence === fileSequence.current) setError(err instanceof Error ? err.message : "فایل قابل خواندن نیست."); }
    }} />
    {error && <p role="alert">{error}</p>}
    {table && <>
      <details><summary className="cursor-pointer">بررسی و تغییر تطبیق ستون‌های فایل</summary><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{IMPORT_FIELDS.map(k => <label key={k} className="text-sm">{labels[k]}<select className="input w-full" value={mapping[k] ?? ""} disabled={disabled} onChange={e => { setMapping({ ...mapping, [k]: e.target.value }); setConfirmedDigest(null); }}><option value="">ستون انتخاب نشده</option>{table.headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div></details>
      <label className="flex gap-2"><input type="checkbox" checked={updates} disabled={disabled} onChange={e => { setUpdates(e.target.checked); setConfirmedDigest(null); }} />اصلاح اقلام موجود با همان شناسه را می‌خواهم</label>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>ردیف</th><th>قلم</th><th>مقدار و واحد</th><th>مالکیت</th><th>ارزش کل به تومان</th><th>نتیجه</th></tr></thead><tbody>{preview?.entries.map(e => <tr key={e.row}><td>{toPersianDigits(e.row)}</td><td>{String(e.input.symbol || e.input.manual_label || "—")}</td><td>{toPersianDigits(String(e.input.qty || "—"))} {String(e.input.unit || "")}</td><td>{toPersianDigits(String(e.input.ownership_pct || "نامعلوم"))}</td><td>{e.normalized?.declared_value != null ? formatToman(Number(e.normalized.declared_value)) : "بدون ارزش قطعی"}</td><td>{e.errors.join("؛ ") || "آمادهٔ انتقال به فرم"}</td></tr>)}</tbody></table></div>
      {preview?.errors.length ? <p role="alert">{preview.errors.join("؛ ")}</p> : <p>{toPersianDigits(preview?.retainedCount ?? 0)} قلم قبلی خارج از فایل حفظ می‌شود.</p>}
      <label className="flex gap-2"><input type="checkbox" disabled={disabled || !preview?.valid} checked={confirmed} onChange={e => setConfirmedDigest(e.target.checked ? previewSignature : null)} />واحد، مالکیت و اقلام پیش‌نمایش را بررسی کردم</label>
      <button type="button" className="btn btn-outline" disabled={disabled || !preview?.valid || !confirmed} onClick={() => { if (preview?.positions) { onApply(preview.positions); setConfirmedDigest(null); } }}>انتقال پیش‌نمایش به فرم اصلاح</button>
      <p className="text-xs">پس از انتقال به فرم، اقلام را دوباره بررسی و با دکمهٔ ثبت نسخه ذخیره کنید؛ فایل به‌تنهایی معامله یا موجودی تأییدشدهٔ کارگزاری نیست.</p>
    </>}
  </section>;
}
