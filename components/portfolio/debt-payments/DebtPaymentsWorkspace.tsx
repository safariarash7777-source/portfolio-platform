"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/deadline";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import type { CashFlowPeriod } from "@/lib/portfolio/cashFlow";
import { validateCashFlowPeriod } from "@/lib/portfolio/cashFlowApiContract";
import { declaredInstallmentTotal, type DebtPaymentReceipt, type DebtPaymentRecord, type DebtPaymentsRead } from "@/lib/portfolio/debtPayments";
import { createDebtPaymentAttempt, readDebtPayments, recoverDebtPayment, sendDebtPayment, type DebtPaymentAttempt, type DebtPaymentOutcome } from "@/lib/portfolio/debtPaymentsRequest";

export function DebtPaymentHistory({ items, onCorrect, locked }: { items: DebtPaymentRecord[]; onCorrect: (item: DebtPaymentRecord) => void; locked: boolean }) {
  return <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded-xl border p-3 space-y-2 break-words" style={{ borderColor: "var(--line)" }}>
    <p className="font-bold">{item.payload.debtKey} · موعد {formatJalali(item.payload.dueOn)} · نسخهٔ اعلام {toPersianDigits(item.version)}</p>
    <p>هزینهٔ مبنا: {formatToman(item.amountToman)} در {formatJalali(item.occurredOn)}</p>
    <p className="text-sm">سهم اصل، بهره و جریمه: نامعلوم؛ ماندهٔ بدهی تغییر نکرده است.</p>
    <p className="text-sm">{item.sourceState === "current" ? "نسخهٔ هزینه جاری است" : item.sourceState === "stale" ? "نسخهٔ جریان نقد عوض شده؛ این پیوند هنوز دوباره تأیید نشده" : "هزینه در نسخهٔ جاری وجود ندارد"} · {item.basisCurrent ? "مبنای مالی جاری" : "مبنای مالی قبلی؛ فقط خواندنی"} · {item.latestForPayment ? "آخرین اعلام این پرداخت" : "سابقه؛ جایگزین شده"}</p>
    <p className="text-sm">ارجاع عضو: {item.payload.reference ?? "ثبت نشده"}</p>
    <time className="text-xs" dateTime={item.createdAt}>زمان ثبت: {formatJalali(item.createdAt)}</time>
    <p><a className="underline text-sm" href={`/dashboard/cashflow?${new URLSearchParams({ ...item.period, version: item.payload.cashFlowVersionId })}`}>مشاهدهٔ نسخهٔ محفوظ هزینه</a></p>
    {item.latestForPayment && <button type="button" className="btn btn-outline" disabled={locked} onClick={() => onCorrect(item)}>اصلاح یا تأیید دوبارهٔ همین اعلام</button>}
  </li>)}</ul>;
}

export default function DebtPaymentsWorkspace({ holdingVersionId, initialPeriod }: { holdingVersionId: string; initialPeriod: CashFlowPeriod }) {
  const [identity, setIdentity] = useState("checking"), actor = useRef<string | null>(null), live = useRef(false), revoked = useRef(false);
  const [period, setPeriod] = useState(initialPeriod), [data, setData] = useState<DebtPaymentsRead | null>(null);
  const current = useRef<DebtPaymentsRead | null>(null), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const [reading, setReading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [message, setMessage] = useState(""), [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [readbackTried, setReadbackTried] = useState(false);
  const [debtKey, setDebtKey] = useState(""), [entryKey, setEntryKey] = useState(""), [reference, setReference] = useState("");
  const [correction, setCorrection] = useState<DebtPaymentRecord | null>(null);
  const pending = useRef<DebtPaymentAttempt | null>(null), busy = useRef(false), priorUnknown = useRef(false);
  const receipt = useRef<DebtPaymentReceipt | null>(null);
  const abortReads = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const clearIdentity = useCallback(() => {
    live.current = false; revoked.current = true; actor.current = null; abortReads(); current.current = null;
    pending.current = null; receipt.current = null; busy.current = false; priorUnknown.current = false;
    setData(null); setReference(""); setCorrection(null); setDebtKey(""); setEntryKey(""); setDirty(false); setUncertain(false); setSaving(false); setReading(false); setMessage(""); setError(""); setIdentity("changed");
  }, [abortReads]);
  const load = useCallback(async (selected: CashFlowPeriod, beforeSequence?: number) => {
    if (!live.current || !actor.current) return null;
    try { selected = validateCashFlowPeriod(selected); } catch { setError("دورهٔ معتبر با تاریخ میلادی و حداکثر ۳۶۶ روز انتخاب کنید."); return null; }
    const seq = ++generation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setReading(true); setError("");
    const result = await readDebtPayments({ holdingVersionId, period: selected, beforeSequence }, { actorId: actor.current, signal: abort.signal });
    if (!live.current || seq !== generation.current) return null;
    setReading(false);
    if (result.status === "error") { setError(result.message); return null; }
    let next = result.data;
    const previous = current.current;
    if (beforeSequence !== undefined && previous?.state === "ready" && next.state === "ready") {
      // Appended pages cannot silently change the financial or cash-flow basis.
      if (previous.basis.latestId !== next.basis.latestId || previous.sourceVersion?.id !== next.sourceVersion?.id) { setError("مبنا هنگام خواندن سابقه تغییر کرد؛ فهرست را از ابتدا بازخوانی کنید."); return null; }
      const rows = new Map(previous.history.items.map(item => [item.id, item])); next.history.items.forEach(item => rows.set(item.id, item));
      next = { ...next, history: { ...next.history, items: [...rows.values()].sort((a, b) => b.sequence - a.sequence) } };
    }
    current.current = next; setData(next); return next;
  }, [holdingVersionId]);
  const startOn = initialPeriod.startOn, endOn = initialPeriod.endOn;
  useEffect(() => {
    let disposed = false;
    try {
    const client = createClient();
    const { data: auth } = client.auth.onAuthStateChange((event, session) => {
      if (!disposed && (event === "SIGNED_OUT" || actor.current && (!session?.user || session.user.id !== actor.current))) clearIdentity();
    });
    void withDeadline(() => client.auth.getUser(), 10_000).then(result => {
      if (disposed || revoked.current) return;
      if (result.error || !result.data.user) { setIdentity("error"); return; }
      actor.current = result.data.user.id; live.current = true; setIdentity("ready"); void load({ startOn, endOn });
    }).catch(() => { if (!disposed) setIdentity("error"); });
    return () => { disposed = true; live.current = false; abortReads(); auth.subscription.unsubscribe(); };
    } catch { setIdentity("error"); return () => { disposed = true; live.current = false; }; }
  }, [clearIdentity, load, startOn, endOn, abortReads]);
  useEffect(() => {
    if (!(dirty || saving || uncertain)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving, uncertain]);
  async function finish(outcome: DebtPaymentOutcome) {
    if (!live.current) return;
    if (outcome.status === "confirmed") {
      receipt.current = outcome.receipt;
      const req = JSON.parse(pending.current!.body), next = await load(req.period);
      if (!live.current) return;
      const row = next?.state === "ready" ? next.history.items.find(item => item.id === outcome.receipt.id) : null;
      if (!row || row.version !== outcome.receipt.version || JSON.stringify(row.payload) !== JSON.stringify(outcome.receipt.payload)) {
        priorUnknown.current = true; setUncertain(true); setMessage("رسید دریافت شد؛ بازخوانی مستقل سابقه هنوز تأیید نشده است. همان درخواست محفوظ است."); return;
      }
      pending.current = null; receipt.current = null; priorUnknown.current = false;
      setUncertain(false); setDirty(false); setCorrection(null); setReference(""); setEntryKey(""); setReadbackTried(false); setMessage("اعلام عضو ثبت و مستقل بازخوانی شد؛ هزینه دوباره ساخته نشد و ماندهٔ بدهی تغییر نکرد.");
    } else if (outcome.status === "unknown") { priorUnknown.current = true; setUncertain(true); setMessage(outcome.message); }
    else { pending.current = null; priorUnknown.current = false; setUncertain(false); setMessage(outcome.error.error + " ورودی حفظ شده؛ پیش از درخواست تازه، مبنا را بازخوانی کنید."); setError("ثبت تازه تا بازخوانی مبنا بسته است."); }
  }
  async function save(mode: "new" | "recover" | "retry") {
    if (busy.current || !live.current || !actor.current) return;
    const latest = current.current;
    if (mode === "new") {
      if (reading || error || latest?.state !== "ready" || !latest.writeAllowed || !latest.sourceVersion) return;
      const due = latest.installments.find(item => item.debtKey === debtKey);
      if (!due || !latest.sources.some(item => item.entryKey === entryKey)) return;
      try { pending.current = createDebtPaymentAttempt({ contractVersion: "debt-payment-request.v1", expectedActorId: actor.current, clientToken: crypto.randomUUID(), baseVersion: correction?.version ?? 0, period: latest.period, payload: { contractVersion: 1, paymentKey: correction?.payload.paymentKey ?? crypto.randomUUID(), holdingVersionId, debtKey, dueOn: due.dueOn, cashFlowVersionId: latest.sourceVersion.id, entryKey, reference: reference.trim() || null } }); }
      catch { setMessage("ارجاع یا انتخاب پرداخت معتبر نیست."); return; }
    }
    if (!pending.current || mode === "retry" && !readbackTried) return;
    busy.current = true; setSaving(true);
    try {
      if (mode === "recover") setReadbackTried(true);
      const result = mode === "recover" ? await recoverDebtPayment(pending.current, { actorId: actor.current }) : await sendDebtPayment(pending.current, { actorId: actor.current, priorUnknown: priorUnknown.current });
      await finish(result);
    } finally { busy.current = false; if (live.current) setSaving(false); }
  }
  const locked = identity !== "ready" || saving || reading || uncertain;
  const ready = data?.state === "ready" ? data : null;
  const writable = !!ready?.writeAllowed && !locked && !error;
  const selected = ready?.installments.find(item => item.debtKey === debtKey);
  const amount = ready?.sources.find(item => item.entryKey === entryKey);
  const total = ready && selected ? declaredInstallmentTotal(ready.history.items, { holdingVersionId, debtKey, dueOn: selected.dueOn }) : null;
  return <section id="debt-payments" className="card p-5 space-y-4" aria-label="اعلام پرداخت قسط از هزینهٔ واقعی">
    <h2 className="font-display text-lg font-bold">اعلام پرداخت قسط از هزینهٔ واقعی</h2>
    <p className="text-sm leading-7">ابتدا هزینهٔ واقعی را در جریان نقد ثبت کنید؛ سپس همان هزینه را به قسط معلوم پیوند دهید. این اعلام عضو است؛ تأیید بانکی یا محاسبهٔ تسویه نیست.</p>
    {identity !== "ready" ? <p role="status">{identity === "checking" ? "در حال بررسی نشست…" : "نشست تأیید نشد یا حساب تغییر کرد؛ برای مشاهدهٔ اطلاعات، صفحه را دوباره باز کنید."}</p> : <>
      <div className="flex flex-wrap gap-3 items-end">
        <label>شروع دورهٔ هزینه (میلادی)<input className="input" type="date" value={period.startOn} disabled={locked || dirty} onChange={event => { setPeriod({ ...period, startOn: event.target.value }); current.current = null; setData(null); }} /></label>
        <label>پایان دوره (میلادی)<input className="input" type="date" value={period.endOn} disabled={locked || dirty} onChange={event => { setPeriod({ ...period, endOn: event.target.value }); current.current = null; setData(null); }} /></label>
        <button type="button" className="btn btn-outline" disabled={locked} onClick={() => void load(period)}>بازخوانی مبنا و سابقه</button>
      </div>
      {reading && <p role="status">در حال خواندن…</p>}{error && <p role="alert">{error}</p>}
      {data?.state === "unavailable" && <p role="status">زیرساخت اعلام پرداخت در این مقصد آماده نیست؛ ثبت بسته است. بخش دارایی، بدهی و جریان نقد مستقل قابل استفاده است.</p>}
      {ready && <>
        {ready.basis.historical && <p role="status">نسخهٔ مالی قبلی فقط خواندنی است. <a className="underline" href="/dashboard/holdings#debt-payments">رفتن به آخرین نسخه</a></p>}
        <p><a className="underline" href={`/dashboard/cashflow?${new URLSearchParams({ ...ready.period })}`}>ثبت یا مشاهدهٔ هزینه در جریان نقد همین دوره</a></p>
        {!ready.sources.length && <p>هزینهٔ واقعی با مبلغ و تاریخ معلوم برای این دوره پیدا نشد؛ ابتدا در جریان نقد ثبت کنید.</p>}
        {!ready.installments.length && <p>قسط با مبلغ و موعد معلوم در این نسخه وجود ندارد.</p>}
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save("new"); }}>
          {correction && <p role="status">اصلاح اعلام نسخهٔ {toPersianDigits(correction.version)}؛ سابقه محفوظ می‌ماند. هزینه و قسط جاری را صریح انتخاب کنید.</p>}
          <label className="block">قسط معلوم<select className="input" value={debtKey} disabled={!writable} onChange={event => { setDebtKey(event.target.value); setDirty(true); }}><option value="">انتخاب قسط</option>{ready.installments.map(item => <option key={item.debtKey} value={item.debtKey}>{item.title} · {formatJalali(item.dueOn)} · {formatToman(item.installmentToman)}</option>)}</select></label>
          <label className="block">هزینهٔ واقعی موجود<select className="input" value={entryKey} disabled={!writable} onChange={event => { setEntryKey(event.target.value); setDirty(true); }}><option value="">انتخاب هزینه</option>{ready.sources.map(item => <option key={item.entryKey} value={item.entryKey}>{item.entryKey} · {formatToman(item.amountToman)} · {formatJalali(item.occurredOn)}</option>)}</select></label>
          {amount && <p>مبلغ و تاریخ از هزینه: {formatToman(amount.amountToman)} · {formatJalali(amount.occurredOn)}؛ در این فرم قابل تغییر نیست.</p>}
          <label className="block">ارجاع عضو (اختیاری)<input className="input" maxLength={160} value={reference} disabled={!writable} onChange={event => { setReference(event.target.value); setDirty(true); }} /></label>
          <p className="text-sm">سهم اصل، بهره و جریمه نامعلوم می‌ماند؛ مانده و مبلغ قسط به‌صورت خودکار کم نمی‌شود.</p>
          <button className="btn btn-primary" type="submit" disabled={!writable || !selected || !amount}>{correction ? "ثبت نسخهٔ اصلاحی اعلام" : "ثبت پیوند هزینه به قسط"}</button>
          {dirty && !uncertain && <button className="btn btn-outline" type="button" disabled={saving || reading} onClick={() => { setCorrection(null); setReference(""); setEntryKey(""); setDebtKey(""); setDirty(false); }}>کنارگذاشتن پیش‌نویس ثبت‌نشده</button>}
        </form>
        {selected && <p>جمع اعلام‌های جاریِ خوانده‌شده برای این قسط: {total === null ? "معلوم نیست" : formatToman(total)}{ready.history.nextBeforeSequence !== null ? "؛ سابقه هنوز کامل خوانده نشده است" : ""}. این عدد ماندهٔ قابل پرداخت نیست.</p>}
        <h3 className="font-bold">سابقهٔ اعلام‌ها (تمام دوره‌ها)</h3>
        {!ready.history.items.length && <p>برای این مبنای قابل مشاهده، اعلامی ثبت نشده است؛ پرداخت‌نشدن از آن نتیجه نمی‌شود.</p>}
        <DebtPaymentHistory items={ready.history.items} locked={!writable} onCorrect={item => { if (!writable) return; setCorrection(item); setDebtKey(ready.installments.some(d => d.debtKey === item.payload.debtKey) ? item.payload.debtKey : ""); setEntryKey(""); setReference(item.payload.reference ?? ""); setDirty(true); setMessage(""); }} />
        {ready.history.nextBeforeSequence !== null && <button type="button" className="btn btn-outline" disabled={locked || dirty} onClick={() => void load(ready.period, ready.history.nextBeforeSequence!)}>خواندن سابقهٔ قدیمی‌تر</button>}
      </>}
      {uncertain && <div className="space-x-2"><button type="button" className="btn btn-outline" disabled={saving || reading} onClick={() => void save("recover")}>بازخوانی رسید همین ثبت</button>{readbackTried && <button type="button" className="btn btn-outline" disabled={saving || reading} onClick={() => void save("retry")}>تکرار دقیق همان درخواست</button>}</div>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
