"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HoldingVersion } from "@/lib/portfolio/contracts";
import { selectInvestmentScope } from "@/lib/portfolio/investmentScope";
import { scopeReviewFromStored, type ScopeRead, type StoredScopeReview } from "@/lib/portfolio/scopeContract";
import { buildHoldingsView, type BuildViewInput } from "@/lib/portfolio/view";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
const assetLabels: Record<string, string> = { gold: "طلا", cash: "نقد", fixed_income: "درآمد ثابت", equity_ir: "سهام ایران", fx: "ارز" };
export default function InvestmentScopeWorkbench({ holdings, storedTarget, priceRows, pricesFailed, scopeState = { status: "error", review: null }, editable = false }: { holdings: HoldingVersion; storedTarget: BuildViewInput["storedTarget"]; priceRows: BuildViewInput["priceRows"]; pricesFailed: boolean; scopeState?: ScopeRead; editable?: boolean }) {
  const router = useRouter();
  const [uses, setUses] = useState<Record<string, "allocatable" | "excluded" | "unknown">>(() => Object.fromEntries((scopeState.review?.assignments ?? []).map(a => [a.positionKey, a.use])));
  const [savedReview, setSavedReview] = useState<StoredScopeReview | null>(scopeState.review);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const unchanged = savedReview !== null && savedReview.assignments.length === holdings.positions.length && savedReview.assignments.every(a => uses[a.positionKey] === a.use);
  const review = unchanged && scopeState.status === "ready" ? savedReview : null;
  const scope = selectInvestmentScope(holdings, review, new Date());
  const unknownClass = scope.status === "ready" && scope.holdings.positions.some(p => !Object.hasOwn(assetLabels, p.assetClass));
  const view = scope.status === "ready" && !pricesFailed && !unknownClass ? buildHoldingsView({ holdings: scope.holdings, storedTarget, priceRows, maxPriceAgeDays: 3, maxPriceFutureDays: 1, now: new Date() }) : null;
  async function saveScope() {
    if (saving || scopeState.status !== "ready" || !editable) return;
    token.current ??= crypto.randomUUID(); setSaving(true); setError(null);
    try {
      const assignments = holdings.positions.map(p => ({ positionKey: p.positionKey, use: uses[p.positionKey] ?? "unknown" }));
      const response = await fetch("/api/portfolio/holdings/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holding_version_id: holdings.id, rules_version: "member-selected.v0.1", assignments, base_scope_version: savedReview?.scopeVersion ?? 0, client_token: token.current }) });
      const result = await response.json();
      if (!response.ok) { if (response.status >= 500) setUncertain(true); else { setUncertain(false); token.current = null; } setError(result.error || "ثبت محدوده تأیید نشد."); return; }
      const stored = scopeReviewFromStored({ id: result.id, scope_version: result.scopeVersion, holding_version_id: result.holdingVersionId, rules_version: result.rulesVersion, member_confirmed_at: result.memberConfirmedAt, assignments: result.assignments }, holdings);
      if (result.holdingVersion !== holdings.version || stored.assignments.length !== assignments.length || stored.assignments.some(a => uses[a.positionKey] !== a.use)) throw new Error("scope response mismatch");
      setSavedReview(stored); token.current = null; setUncertain(false); router.refresh();
    } catch { setUncertain(true); setError("نتیجهٔ ثبت دریافت نشد؛ انتخاب‌ها و شناسه حفظ شدند. همین ثبت را دوباره بررسی کنید."); }
    finally { setSaving(false); }
  }
  return <section className="card p-5 space-y-4" aria-label="محدوده سرمایه‌گذاری">
    <h2 className="font-display text-lg font-bold">کدام دارایی‌ها در سبد سرمایه‌گذاری شما قرار دارند؟</h2>
    <p className="text-sm leading-7">ترازنامه همهٔ اقلام و بدهی‌ها را نشان می‌دهد. مقایسه با الگو فقط از اقلامی انجام می‌شود که برای تخصیص سرمایه انتخاب می‌کنید؛ خانه مصرفی یا بدهی خودکار وارد مخرج نمی‌شود. وجه نقد مربوط به همین سبد را هم انتخاب کنید.</p>
    {holdings.positions.map(p => <label className="block text-sm" key={p.positionKey}>{p.title || p.symbol || p.manualLabel || p.positionKey}<select className="input w-full mt-1" disabled={!editable || saving || uncertain || scopeState.status === "error"} value={uses[p.positionKey] ?? "unknown"} onChange={e => { setUses({ ...uses, [p.positionKey]: e.target.value as "allocatable" | "excluded" | "unknown" }); token.current = null; setError(null); }}><option value="unknown">هنوز مشخص نکرده‌ام</option><option value="allocatable">در سبد قابل تخصیص</option><option value="excluded">خارج از این سبد</option></select></label>)}
    <button type="button" className="btn btn-outline" disabled={!editable || saving || unchanged || scopeState.status !== "ready" || !holdings.positions.length || holdings.positions.some(p => !uses[p.positionKey] || uses[p.positionKey] === "unknown")} onClick={saveScope}>{saving ? "در حال ثبت تأیید…" : uncertain ? "بررسی دوبارهٔ همین ثبت" : "محدودهٔ این نسخه را بررسی و تأیید کردم"}</button>
    {error && <p role="alert">{error}</p>}
    {scopeState.status === "error" && <p role="alert">سابقهٔ تأیید محدوده خوانده نشد؛ ثبت و مقایسه تا رفع خطا انجام نمی‌شود.</p>}
    {!editable && <p className="text-xs">نسخهٔ قبلی فقط برای مشاهده است؛ محدوده را در آخرین نسخه اصلاح کنید.</p>}
    <p className="text-sm">{review ? `تأیید ثبت‌شدهٔ این نسخه: ${formatJalali(review.memberConfirmedAt)}؛ با تغییر نسخه یا انتخاب‌ها تأیید دوباره لازم است.` : "انتخاب‌های این صفحه برای این نسخه هنوز ثبت و تأیید نشده‌اند."}</p>
    <p className="text-xs">تأیید در سابقهٔ همین نسخه نگهداری می‌شود. این صفحه اعلان یا تغییر دارایی ایجاد نمی‌کند.</p>
    {scope.status === "ready" && <>
      {unknownClass && <p role="alert">دستهٔ یکی از اقلام منتخب هنوز برای مقایسه شناخته نشده است؛ مقدار قطعی محاسبه نمی‌شود.</p>}
      {pricesFailed && <p role="alert">قیمت‌ها دریافت نشد؛ مقایسه قطعی انجام نمی‌شود.</p>}
      {view && <><p>{view.notes.join(" ")}</p>{view.definitive && view.totalValue !== null && <p>ارزش سبد منتخب: {formatToman(view.totalValue)}</p>}<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>دسته</th><th>وزن فعلی</th><th>وزن الگو</th><th>فاصله ارزش (تومان)</th></tr></thead><tbody>{view.rows.map(r => <tr key={r.assetClass}><td>{assetLabels[r.assetClass] ?? `دسته ناشناخته (${r.assetClass})`}</td><td>{r.currentWeightPct === null ? "نامعلوم" : `${toPersianDigits(r.currentWeightPct.toFixed(1))}٪`}</td><td>{toPersianDigits(r.targetWeightPct)}٪</td><td>{r.valueDelta === null ? "اطلاعات کافی نیست" : formatToman(r.valueDelta)}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
