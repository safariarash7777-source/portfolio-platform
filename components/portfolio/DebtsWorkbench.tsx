"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import { DEBT_LABELS, normaliseDebt, type Currency, type DebtKind } from "@/lib/portfolio/financialInput";
import type { DebtPosition } from "@/lib/portfolio/balanceSheet";
interface Row { debt_key: string; title: string; kind: DebtKind; balance: string; currency: Currency; balance_as_of: string; next_installment: string; next_due_on: string; note: string }
const blank = (): Row => ({ debt_key: crypto.randomUUID(), title: "", kind: "loan", balance: "", currency: "IRT", balance_as_of: new Date().toISOString().slice(0, 10), next_installment: "", next_due_on: "", note: "" });
export function DebtList({ debts }: { debts: readonly DebtPosition[] }) {
  return <section className="card p-5 space-y-4" aria-label="بدهی‌های ثبت‌شده"><h2 className="font-bold text-lg">بدهی‌های ثبت‌شده</h2>{debts.length === 0 ? <p>بدهی‌ای در این نسخه ثبت نشده است.</p> : <ul className="space-y-4">{debts.map(d => <li className="border-t pt-3 space-y-2" style={{ borderColor: "var(--line)" }} key={d.debt_key}><p className="font-bold">{d.title} · {DEBT_LABELS[d.kind]}</p><p>مانده: {formatToman(d.balance_toman)} · معتبر برای تاریخ {formatJalali(d.balance_as_of)}</p>{d.next_installment_toman !== null && <p>قسط بعدی: {formatToman(d.next_installment_toman)} · موعد {formatJalali(d.next_due_on!)} (در ماندهٔ بدهی منظور شده است)</p>}{d.note && <p className="text-sm">{d.note}</p>}</li>)}</ul>}</section>;
}
export default function DebtsWorkbench({ debts, ready, activeVersion, latestVersion }: { debts: readonly DebtPosition[]; ready: boolean; activeVersion: number | null; latestVersion: number }) {
  const router = useRouter(), lock = useRef(false);
  const [rows, setRows] = useState<Row[]>(() => debts.map(d => ({ ...d, balance: String(d.balance_toman), currency: "IRT", next_installment: d.next_installment_toman === null ? "" : String(d.next_installment_toman), next_due_on: d.next_due_on ?? "", note: d.note ?? "" })));
  const [token, setToken] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const historical = activeVersion !== null && activeVersion !== latestVersion;
  const patch = (index: number, values: Partial<Row>) => setRows(old => old.map((r, i) => i === index ? { ...r, ...values } : r));
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || historical || !ready) return;
    try { rows.forEach(normaliseDebt); } catch (error) { setMessage(error instanceof Error ? error.message : "اطلاعات معتبر نیست."); return; }
    lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/portfolio/debts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debts: rows, base_version: activeVersion ?? 0, client_token: token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ذخیره انجام نشد.");
      setMessage(`تصویر مالی نسخهٔ ${toPersianDigits(result.version)} ذخیره شد؛ دارایی‌ها و سابقه حفظ شدند.`);
      setToken(crypto.randomUUID()); router.push(`/dashboard/holdings?v=${result.version_id}`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "ارتباط برقرار نشد؛ متن فرم حفظ شده است."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!ready) return <p className="card p-5" role="alert">دریافت بدهی‌ها انجام نشد؛ وضعیت آن‌ها صفر فرض نمی‌شود. صفحه را تازه کنید.</p>;
  const field = (i: number, key: keyof Row, label: string, type = "text") => <label className="space-y-1"><span className="text-xs">{label}</span><input className="input w-full" type={type} value={rows[i][key]} disabled={busy} onChange={e => patch(i, { [key]: e.target.value })} /></label>;
  return <div className="space-y-5"><DebtList debts={debts} /><form className="card p-5 space-y-4" onSubmit={save}>
    <h2 className="font-bold text-lg">ثبت و اصلاح بدهی</h2><p className="text-sm leading-7">ماندهٔ بدهی، مبلغ باقی‌مانده برای پرداخت است؛ مبلغ اولیهٔ وام را وارد نکنید. وام، قرض شخصی و بدهی اقساطی قابل ثبت‌اند. ضمانت و تعهد احتمالی به بدهی قطعی اضافه نمی‌شوند. مبالغ فرم هنگام بازکردن نسخه به تومان‌اند.</p>
    {historical && <p role="alert">این نسخه سابقه است؛ برای اصلاح <a className="underline" href="/dashboard/holdings">آخرین نسخه</a> را باز کنید.</p>}
    {rows.map((r, i) => <fieldset key={r.debt_key} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--line)" }}><legend>بدهی {toPersianDigits(i + 1)}</legend><div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {field(i, "title", "عنوان بدهی")}
      <label className="space-y-1"><span className="text-xs">نوع بدهی</span><select className="input w-full" value={r.kind} disabled={busy} onChange={e => patch(i, { kind: e.target.value as DebtKind })}>{Object.entries(DEBT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {field(i, "balance", "ماندهٔ بدهی")}
      <label className="space-y-1"><span className="text-xs">واحد پول مانده و قسط</span><select className="input w-full" value={r.currency} disabled={busy} onChange={e => patch(i, { currency: e.target.value as Currency })}><option value="IRT">تومان</option><option value="IRR">ریال (۱۰ ریال = ۱ تومان)</option></select></label>
      {field(i, "balance_as_of", "تاریخ اعتبار مانده (میلادی)", "date")}{field(i, "next_installment", "مبلغ قسط بعدی (اختیاری)")}{field(i, "next_due_on", "موعد قسط بعدی (میلادی، اختیاری)", "date")}
      <label className="space-y-1 md:col-span-2"><span className="text-xs">توضیح اختیاری</span><textarea className="input w-full" value={r.note} maxLength={2000} disabled={busy} onChange={e => patch(i, { note: e.target.value })} /></label>
    </div><button className="btn btn-outline" type="button" disabled={busy} onClick={() => setRows(old => old.filter((_, n) => n !== i))}>حذف از نسخهٔ تازه؛ سابقه حفظ می‌شود</button></fieldset>)}
    <button className="btn btn-outline" type="button" disabled={busy} onClick={() => setRows(old => [...old, blank()])}>افزودن بدهی</button>
    {message && <p role="status" className="text-sm leading-7">{message}</p>}
    <button className="btn btn-gold" type="submit" disabled={busy || historical}>{busy ? "در حال ذخیره…" : "ذخیرهٔ بدهی‌ها در نسخهٔ تازه"}</button>
    <p className="text-xs leading-7">اصلاح این فهرست، دارایی‌های همان نسخه را حفظ می‌کند. پس از اصلاح دارایی‌ها نیز ماندهٔ بدهی‌ها حفظ می‌شود.</p>
  </form></div>;
}
