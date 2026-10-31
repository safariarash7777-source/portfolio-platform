"use client";
import { useEffect, useRef, useState } from "react";
import { useFinancialEditor } from "./FinancialEditors";
import { useRouter } from "next/navigation";
import type { HoldingVersion } from "@/lib/portfolio/contracts";
import { selectInvestmentScope } from "@/lib/portfolio/investmentScope";
import { scopeReviewFromStored, type ScopeRead, type StoredScopeReview } from "@/lib/portfolio/scopeContract";
import { buildHoldingsView, type BuildViewInput } from "@/lib/portfolio/view";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
import { withDeadline } from "@/lib/deadline";
const assetLabels: Record<string, string> = { gold: "طلا", cash: "نقد", fixed_income: "درآمد ثابت", equity_ir: "سهام ایران", fx: "ارز" };
export default function InvestmentScopeWorkbench({ holdings, storedTarget, priceRows, pricesFailed, scopeState = { status: "error", review: null }, editable = false }: { holdings: HoldingVersion; storedTarget: BuildViewInput["storedTarget"]; priceRows: BuildViewInput["priceRows"]; pricesFailed: boolean; scopeState?: ScopeRead; editable?: boolean }) {
  const router = useRouter();
  const editor = useFinancialEditor("scope");
  const [uses, setUses] = useState<Record<string, "allocatable" | "excluded" | "unknown">>(() => Object.fromEntries((scopeState.review?.assignments ?? []).map(a => [a.positionKey, a.use])));
  const [savedReview, setSavedReview] = useState<StoredScopeReview | null>(scopeState.review);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const lock = useRef(false), unresolved = useRef(false);
  const pending = useRef<{ body: string; assignments: { positionKey: string; use: string }[]; baseScopeVersion: number } | null>(null);
  const initialUses = useRef(JSON.stringify(uses));
  const completed = useRef(false);
  useEffect(() => {
    if (scopeState.status !== "ready" || !editor.settle(scopeState.review?.id ?? null)) return;
    const storedUses = Object.fromEntries((scopeState.review?.assignments ?? []).map(a => [a.positionKey, a.use]));
    completed.current = false; initialUses.current = JSON.stringify(storedUses);
    setUses(storedUses); setSavedReview(scopeState.review); setError(null);
  }, [scopeState.status, scopeState.review?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(uses) !== initialUses.current;
  useEffect(() => {
    if (completed.current || !dirty && !saving && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving, uncertain]);
  function cancel() {
    if (lock.current || unresolved.current || completed.current) return;
    setUses(JSON.parse(initialUses.current)); setError(null); setConflict(false);
    pending.current = null; token.current = null; editor.release();
  }
  function refreshReadback() {
    try { router.refresh(); }
    catch { setError("ثبت انجام شده است؛ خواندن نسخهٔ ثبت‌شده کامل نشد. بررسی دوباره فقط صفحه را بازخوانی می‌کند."); }
  }
  const unchanged = savedReview !== null && savedReview.assignments.length === holdings.positions.length && savedReview.assignments.every(a => uses[a.positionKey] === a.use);
  const review = unchanged && scopeState.status === "ready" ? savedReview : null;
  const scope = selectInvestmentScope(holdings, review, new Date());
  const unknownClass = scope.status === "ready" && scope.holdings.positions.some(p => !Object.hasOwn(assetLabels, p.assetClass));
  const view = scope.status === "ready" && !pricesFailed && !unknownClass ? buildHoldingsView({ holdings: scope.holdings, storedTarget, priceRows, maxPriceAgeDays: 3, maxPriceFutureDays: 1, now: new Date() }) : null;
  async function saveScope() {
    if (lock.current || completed.current || conflict || scopeState.status !== "ready" || !editable || !editor.acquire()) return;
    token.current ??= crypto.randomUUID(); lock.current = true; setSaving(true); setError(null);
    let refresh = false;
    try {
      const assignments = holdings.positions.map(p => ({ positionKey: p.positionKey, use: uses[p.positionKey] ?? "unknown" }));
      const baseScopeVersion = savedReview?.scopeVersion ?? 0;
      pending.current ??= { assignments, baseScopeVersion, body: JSON.stringify({ holding_version_id: holdings.id, rules_version: "member-selected.v0.1", assignments, base_scope_version: baseScopeVersion, client_token: token.current }) };
      const body = pending.current.body;
      const { response, result } = await withDeadline(async (signal) => {
        const response = await fetch("/api/portfolio/holdings/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
        return { response, result: await response.json() };
      }, 15000);
      if (!response.ok) {
        const valid = result && typeof result === "object" && !Array.isArray(result) && Object.keys(result).length === 1 && typeof result.error === "string" && result.error.trim();
        const canonicalConflict = valid && response.status === 409 && result.error === "نسخهٔ دارایی یا محدوده تغییر کرده است؛ انتخاب‌های شما حفظ شد. آخرین نسخه را دوباره باز کنید.";
        if (canonicalConflict || (!unresolved.current && valid && [400,401,403].includes(response.status))) {
          pending.current = null; unresolved.current = false; token.current = null; setUncertain(false); setConflict(Boolean(canonicalConflict)); setError(result.error); return;
        }
        throw new Error("scope outcome unresolved");
      }
      const stored = scopeReviewFromStored({ id: result.id, scope_version: result.scopeVersion, holding_version_id: result.holdingVersionId, rules_version: result.rulesVersion, member_confirmed_at: result.memberConfirmedAt, assignments: result.assignments }, holdings);
      if (result.holdingVersion !== holdings.version || stored.scopeVersion !== pending.current.baseScopeVersion + 1 || typeof result.reused !== "boolean" || stored.assignments.length !== pending.current.assignments.length || stored.assignments.some(a => !pending.current!.assignments.some(b => b.positionKey === a.positionKey && b.use === a.use))) throw new Error("scope response mismatch");
      setSavedReview(stored); pending.current = null; unresolved.current = false; token.current = null; setUncertain(false);
      completed.current = true; refresh = editor.navigate(stored.id);
    } catch { unresolved.current = true; setUncertain(true); setError("نتیجهٔ ثبت مشخص نیست؛ انتخاب‌ها و همان درخواست حفظ شدند. پس از رفع مشکل ارتباط، نشست یا سرویس، همین ثبت را دوباره بررسی کنید."); }
    finally { lock.current = false; setSaving(false); }
    if (refresh) refreshReadback();
  }
  return <section className="card p-5 space-y-4" aria-label="محدوده سرمایه‌گذاری">
    <h2 className="font-display text-lg font-bold">کدام دارایی‌ها در سبد سرمایه‌گذاری شما قرار دارند؟</h2>
    <p className="text-sm leading-7">ترازنامه همهٔ اقلام و بدهی‌ها را نشان می‌دهد. مقایسه با الگو فقط از اقلامی انجام می‌شود که برای تخصیص سرمایه انتخاب می‌کنید؛ خانه مصرفی یا بدهی خودکار وارد مخرج نمی‌شود. وجه نقد مربوط به همین سبد را هم انتخاب کنید.</p>
    {holdings.positions.map(p => <label className="block text-sm" key={p.positionKey}>{p.title || p.symbol || p.manualLabel || p.positionKey}<select className="input w-full mt-1" disabled={editor.locked || !editable || saving || uncertain || conflict || scopeState.status === "error"} value={uses[p.positionKey] ?? "unknown"} onChange={e => { if (lock.current || completed.current || pending.current || conflict || !editor.acquire()) return; setUses({ ...uses, [p.positionKey]: e.target.value as "allocatable" | "excluded" | "unknown" }); token.current = null; setError(null); }}><option value="unknown">هنوز مشخص نکرده‌ام</option><option value="allocatable">در سبد قابل تخصیص</option><option value="excluded">خارج از این سبد</option></select></label>)}
    <button type="button" className="btn btn-outline" disabled={editor.locked || !editable || saving || conflict || unchanged || scopeState.status !== "ready" || !holdings.positions.length || holdings.positions.some(p => !uses[p.positionKey] || uses[p.positionKey] === "unknown")} onClick={saveScope}>{saving ? "در حال ثبت تأیید…" : uncertain ? "بررسی دوبارهٔ همین ثبت" : "محدودهٔ این نسخه را بررسی و تأیید کردم"}</button>
    {editor.active && !editor.awaitingReadback && !completed.current && <button type="button" className="btn btn-outline" disabled={saving || uncertain} onClick={cancel}>لغو تغییرات محدوده</button>}
    {editor.awaitingReadback && <button type="button" className="btn btn-outline" onClick={refreshReadback}>بررسی دوبارهٔ نسخهٔ ثبت‌شده</button>}
    {conflict && <p role="alert">انتخاب‌های شما حفظ شده‌اند. <a href="/dashboard/holdings" target="_blank" rel="noopener noreferrer" className="underline">آخرین نسخه و محدوده را در صفحهٔ جدا بررسی کنید</a>؛ این انتخاب‌ها خودکار روی تأیید تازه نوشته نمی‌شوند.</p>}
    {error && <p role="alert">{error}</p>}
    {scopeState.status === "error" && <p role="alert">سابقهٔ تأیید محدوده خوانده نشد؛ ثبت و مقایسه تا رفع خطا انجام نمی‌شود.</p>}
    {!editable && <p className="text-xs">نسخهٔ قبلی فقط برای مشاهده است؛ محدوده را در آخرین نسخه اصلاح کنید.</p>}
    <p className="text-sm">{review ? `تأیید ثبت‌شدهٔ این نسخه: ${formatJalali(review.memberConfirmedAt)}؛ با تغییر نسخه یا انتخاب‌ها تأیید دوباره لازم است.` : "انتخاب‌های این صفحه برای این نسخه هنوز ثبت و تأیید نشده‌اند."}</p>
    <p className="text-xs">تأیید در سابقهٔ همین نسخه نگهداری می‌شود. این صفحه اعلان یا تغییر دارایی ایجاد نمی‌کند.</p>
    {scope.status === "ready" && <>
      <p className="text-sm">مبنای وزن: {toPersianDigits(scope.denominator.includedPositionKeys.length)} قلم منتخب از {toPersianDigits(holdings.positions.length)} قلمِ نسخهٔ {toPersianDigits(holdings.version)}؛ {toPersianDigits(scope.denominator.excludedPositionKeys.length)} قلم خارج از محاسبه است.</p>
      {storedTarget && <>
        <p className="text-sm">نسخهٔ هدف: {toPersianDigits(storedTarget.version)}</p>
        <details className="text-xs"><summary>شناسهٔ هدف و مرجع برای پیگیری</summary><p>هدف: <code dir="ltr" className="break-all">{storedTarget.id}</code></p><p>مرجع: {storedTarget.referenceVersionId ? <code dir="ltr" className="break-all">{storedTarget.referenceVersionId}</code> : "به نسخهٔ مرجعی متصل نیست"}</p></details>
      </>}
      {unknownClass && <p role="alert">دستهٔ یکی از اقلام منتخب هنوز برای مقایسه شناخته نشده است؛ مقدار قطعی محاسبه نمی‌شود.</p>}
      {pricesFailed && <p role="alert">قیمت‌ها دریافت نشد؛ مقایسه قطعی انجام نمی‌شود.</p>}
      {view && <><p>{view.notes.join(" ")}</p>{view.definitive && view.totalValue !== null && <p>ارزش سبد منتخب: {formatToman(view.totalValue)}</p>}<p className="text-sm">هزینهٔ معامله نامعلوم است؛ فاصلهٔ ارزش، کارمزد و مالیات را شامل نمی‌شود و دستور معامله نیست.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>دسته</th><th>وزن فعلی</th><th>وزن الگو</th><th>اختلاف وزن (هدف منهای فعلی، واحد درصد)</th><th>فاصله ارزش (تومان)</th></tr></thead><tbody>{view.rows.map(r => <tr key={r.assetClass}><td>{assetLabels[r.assetClass] ?? `دسته ناشناخته (${r.assetClass})`}</td><td>{r.currentWeightPct === null ? "نامعلوم" : `${toPersianDigits(r.currentWeightPct.toFixed(1))}٪`}</td><td>{toPersianDigits(r.targetWeightPct)}٪</td><td>{r.deltaPercentagePoints === null ? "نامعلوم" : <bdi dir="ltr">{r.deltaPercentagePoints > 0 ? "+" : ""}{toPersianDigits(r.deltaPercentagePoints.toFixed(1))}</bdi>}</td><td>{r.valueDelta === null ? "اطلاعات کافی نیست" : formatToman(r.valueDelta)}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
