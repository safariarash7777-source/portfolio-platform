"use client";
import { useState } from "react";
import type { HoldingVersion } from "@/lib/portfolio/contracts";
import { selectInvestmentScope, type InvestmentScopeReview } from "@/lib/portfolio/investmentScope";
import { buildHoldingsView, type BuildViewInput } from "@/lib/portfolio/view";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
const assetLabels: Record<string, string> = { gold: "طلا", cash: "نقد", fixed_income: "درآمد ثابت", equity_ir: "سهام ایران", fx: "ارز" };
export default function InvestmentScopeWorkbench({ holdings, storedTarget, priceRows, pricesFailed }: { holdings: HoldingVersion; storedTarget: BuildViewInput["storedTarget"]; priceRows: BuildViewInput["priceRows"]; pricesFailed: boolean }) {
  const [uses, setUses] = useState<Record<string, "allocatable" | "excluded" | "unknown">>({});
  const [review, setReview] = useState<InvestmentScopeReview | null>(null);
  const scope = selectInvestmentScope(holdings, review, new Date());
  const unknownClass = scope.status === "ready" && scope.holdings.positions.some(p => !Object.hasOwn(assetLabels, p.assetClass));
  const view = scope.status === "ready" && !pricesFailed && !unknownClass ? buildHoldingsView({ holdings: scope.holdings, storedTarget, priceRows, maxPriceAgeDays: 3, maxPriceFutureDays: 1, now: new Date() }) : null;
  return <section className="card p-5 space-y-4" aria-label="محدوده سرمایه‌گذاری">
    <h2 className="font-display text-lg font-bold">کدام دارایی‌ها در سبد سرمایه‌گذاری شما قرار دارند؟</h2>
    <p className="text-sm leading-7">ترازنامه همهٔ اقلام و بدهی‌ها را نشان می‌دهد. مقایسه با الگو فقط از اقلامی انجام می‌شود که برای تخصیص سرمایه انتخاب می‌کنید؛ خانه مصرفی یا بدهی خودکار وارد مخرج نمی‌شود. وجه نقد مربوط به همین سبد را هم انتخاب کنید.</p>
    {holdings.positions.map(p => <label className="block text-sm" key={p.positionKey}>{p.title || p.symbol || p.manualLabel || p.positionKey}<select className="input w-full mt-1" value={uses[p.positionKey] ?? "unknown"} onChange={e => { setUses({ ...uses, [p.positionKey]: e.target.value as "allocatable" | "excluded" | "unknown" }); setReview(null); }}><option value="unknown">هنوز مشخص نکرده‌ام</option><option value="allocatable">در سبد قابل تخصیص</option><option value="excluded">خارج از این سبد</option></select></label>)}
    <button type="button" className="btn btn-outline" disabled={!holdings.positions.length || holdings.positions.some(p => !uses[p.positionKey] || uses[p.positionKey] === "unknown")} onClick={() => setReview({ holdingVersionId: holdings.id, holdingVersion: holdings.version, rulesVersion: "member-selected.v0.1", memberConfirmedAt: new Date().toISOString(), assignments: holdings.positions.map(p => ({ positionKey: p.positionKey, use: uses[p.positionKey] ?? "unknown" })) })}>محدودهٔ این نسخه را بررسی و تأیید کردم</button>
    <p className="text-sm">{review ? `آخرین بررسی در این صفحه: ${formatJalali(review.memberConfirmedAt)}؛ با تغییر نسخه یا انتخاب‌ها تأیید دوباره لازم است.` : "برای این نسخه محدوده‌ای در این صفحه تأیید نشده است."}</p>
    <p className="text-xs">این بررسی هنوز در سابقهٔ حساب ذخیره نمی‌شود؛ مقایسهٔ زیر پیش‌نمایش است و اعلان یا تغییر دارایی ایجاد نمی‌کند.</p>
    {scope.status === "ready" && <>
      {unknownClass && <p role="alert">دستهٔ یکی از اقلام منتخب هنوز برای مقایسه شناخته نشده است؛ مقدار قطعی محاسبه نمی‌شود.</p>}
      {pricesFailed && <p role="alert">قیمت‌ها دریافت نشد؛ مقایسه قطعی انجام نمی‌شود.</p>}
      {view && <><p>{view.notes.join(" ")}</p>{view.definitive && view.totalValue !== null && <p>ارزش سبد منتخب: {formatToman(view.totalValue)}</p>}<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>دسته</th><th>وزن فعلی</th><th>وزن الگو</th><th>فاصله ارزش (تومان)</th></tr></thead><tbody>{view.rows.map(r => <tr key={r.assetClass}><td>{assetLabels[r.assetClass] ?? `دسته ناشناخته (${r.assetClass})`}</td><td>{r.currentWeightPct === null ? "نامعلوم" : `${toPersianDigits(r.currentWeightPct.toFixed(1))}٪`}</td><td>{toPersianDigits(r.targetWeightPct)}٪</td><td>{r.valueDelta === null ? "اطلاعات کافی نیست" : formatToman(r.valueDelta)}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
