"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createConsultationAttempt, readConsultation, sendConsultationAttempt } from "@/lib/consultation/request";
import ConsultationPanel from "./ConsultationPanel";
import { receiptVisible } from "./readback";
import type { ConsultationReceipt } from "@/lib/consultation/contracts";

type Read = Extract<Awaited<ReturnType<typeof readConsultation>>, { status: "ready" }>["data"];
type Attempt = ReturnType<typeof createConsultationAttempt>;
type Command = Parameters<typeof createConsultationAttempt>[0]["command"];

export default function ConsultationWorkspace({ expectedActorId, initialRelationshipId }: { expectedActorId: string; initialRelationshipId?: string }) {
  const [identity, setIdentity] = useState<"checking" | "ready" | "changed" | "error">("checking");
  const [data, setData] = useState<Read | null>(null), [reading, setReading] = useState(false), [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [readbackVerified, setReadbackVerified] = useState(false);
  const [message, setMessage] = useState(""), [dirty, setDirty] = useState(false), [revision, setRevision] = useState(0);
  const live = useRef(false), revoked = useRef(false), initialized = useRef(false), sequence = useRef(0), abort = useRef<AbortController | null>(null);
  const receiptRef = useRef<ConsultationReceipt | null>(null);
  const period = useRef<{ startOn?: string; endOn?: string }>({});
  const pending = useRef<Attempt | null>(null), lock = useRef(false), unresolved = useRef(false), selected = useRef(initialRelationshipId);
  const abortReads = useCallback(() => { sequence.current++; abort.current?.abort(); }, []);
  const clearIdentity = useCallback(() => {
    live.current = false; revoked.current = true; abortReads(); pending.current = null; receiptRef.current = null;
    setData(null); setMessage(""); setError(""); setDirty(false); setSaving(false); setReading(false); setUncertain(false); setConfirmed(false); setReadbackVerified(false); setIdentity("changed");
  }, [abortReads]);
  const load = useCallback(async (relationshipId?: string) => {
    if (!live.current || revoked.current) return false;
    const generation = ++sequence.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    selected.current = relationshipId; if (receiptRef.current) setReadbackVerified(false); setReading(true); setError("");
    try {
      const result = await readConsultation({ relationshipId, actorId: expectedActorId, ...period.current, signal: controller.signal });
      if (!live.current || revoked.current || generation !== sequence.current) return false;
      if (result.status === "error") {
        if (result.error.code === "AUTH_REQUIRED" || result.error.code === "ACTOR_CHANGED") { clearIdentity(); return false; }
        if (result.httpStatus === 403 || result.httpStatus === 404) { setData(null); setDirty(false); }
        setError("خواندن پرونده انجام نشد؛ نبود اطلاعات یا دسترسی تأیید نشده است. نتیجهٔ قبلی، خواندن تازه نیست."); return false;
      }
      if (result.data.actor.id !== expectedActorId) { clearIdentity(); return false; }
      if (receiptRef.current && !receiptVisible(result.data, receiptRef.current)) { setData(result.data); setError("رسید ثبت حفظ شده است، اما اثر همان درخواست در بازخوانی هنوز دیده نشد. ثبت را تکرار نکنید؛ بازخوانی را بررسی کنید."); return false; }
      if (receiptRef.current) setReadbackVerified(true);
      setData(result.data); selected.current = result.data.selected?.id ?? relationshipId; if (result.data.dossier) period.current = result.data.dossier.basis.cashFlowPeriod; setDirty(false); setRevision(value => value + 1); return true;
    } catch { if (live.current && generation === sequence.current) setError("خواندن پرونده انجام نشد؛ دادهٔ قبلی حفظ شده و دریافت تازه تأیید نشده است."); return false; }
    finally { if (live.current && generation === sequence.current) setReading(false); }
  }, [clearIdentity, expectedActorId]);
  useEffect(() => {
    let disposed = false;
    try {
      const { data: auth } = createClient().auth.onAuthStateChange((event, session) => {
        if (disposed) return;
        if (event === "SIGNED_OUT" || session?.user && session.user.id !== expectedActorId) { clearIdentity(); return; }
        if (revoked.current) return;
        if (!session?.user) { if (receiptRef.current) setReadbackVerified(false); if (pending.current) { unresolved.current = true; setUncertain(true); setMessage("نشست هنگام ثبت قطع شد؛ نتیجهٔ همان تلاش باید تعیین تکلیف شود."); } live.current = false; sequence.current++; abort.current?.abort(); setReading(false); if (!pending.current && !receiptRef.current) initialized.current = false; setIdentity("error"); return; }
        live.current = true; setIdentity("ready"); if (!initialized.current) { initialized.current = true; void load(initialRelationshipId); }
      });
      return () => { disposed = true; live.current = false; abortReads(); auth.subscription.unsubscribe(); };
    } catch { setIdentity("error"); return () => { disposed = true; live.current = false; }; }
  }, [expectedActorId, initialRelationshipId, clearIdentity, load, abortReads]);
  useEffect(() => {
    if (!dirty && !saving && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving, uncertain]);
  const send = async (command?: Command) => {
    if (!live.current || revoked.current || lock.current || confirmed || reading || error) return false;
    if (!pending.current) {
      if (!command) return false;
      try { pending.current = createConsultationAttempt({ contractVersion: "consultation-request.v1", expectedActorId, clientToken: crypto.randomUUID(), command }); }
      catch { setMessage("ورودی با قرارداد پرونده سازگار نیست؛ متن، تاریخ و نسخه‌های مبنا را بررسی کنید. درخواستی ارسال نشد."); return false; }
    } else if (command) return false;
    lock.current = true; setSaving(true); setMessage(""); const generation = sequence.current;
    try {
      const result = await sendConsultationAttempt(pending.current, { currentActorId: expectedActorId, unresolvedPrior: unresolved.current });
      if (!live.current || revoked.current || generation !== sequence.current) return false;
      if (result.status === "uncertain") { unresolved.current = true; setUncertain(true); setMessage("نتیجهٔ ثبت نامعلوم است؛ متن و شناسهٔ همان درخواست حفظ شده‌اند. فقط همان تلاش را بررسی کنید."); return false; }
      if (result.status === "rejected") {
        if (result.error.code === "AUTH_REQUIRED" || result.error.code === "ACTOR_CHANGED") { clearIdentity(); return false; }
        // A rejected new request is safe to edit. An unresolved prior request is never discarded here.
        if (unresolved.current) { setUncertain(true); setMessage("نتیجهٔ تلاش قبلی هنوز تعیین تکلیف نشده است؛ درخواست تازه ایجاد نمی‌شود."); return false; }
        pending.current = null; setMessage(result.error.error); return false;
      }
      receiptRef.current = result.receipt; pending.current = null; unresolved.current = false; setUncertain(false); setConfirmed(true); setReadbackVerified(false); setDirty(false);
      const reloaded = await load(result.receipt.command.kind === "grant" ? result.receipt.id : selected.current);
      setMessage(reloaded ? "سرور ثبت را تأیید کرد و پرونده مستقل بازخوانی شد." : "سرور ثبت را تأیید کرد؛ بازخوانی مستقل هنوز تأیید نشده است. ثبت را تکرار نکنید.");
      return reloaded;
    } catch { if (live.current && generation === sequence.current) { unresolved.current = true; setUncertain(true); setMessage("نتیجهٔ ثبت نامعلوم است؛ درخواست تازه‌ای ساخته نمی‌شود."); } return false; }
    finally { lock.current = false; setSaving(false); }
  };
  if (identity !== "ready") return <section className="card space-y-3 p-5"><p role={identity === "checking" ? "status" : "alert"}>{identity === "checking" ? "در حال تأیید نشست؛ اطلاعات خصوصی نمایش داده نمی‌شود." : identity === "changed" ? "حساب یا نشست تغییر کرد؛ پرونده و تلاش قبلی از صفحه پاک شدند. دوباره وارد حساب مربوط شوید." : "نشست مرورگر تأیید نشد؛ اطلاعات پرونده نمایش داده نمی‌شود."}</p>{identity !== "checking" && <button className="btn btn-outline" onClick={() => window.location.reload()}>بازکردن دوبارهٔ صفحه</button>}</section>;
  const locked = saving || reading || uncertain || confirmed || Boolean(error);
  return <div className="min-w-0 space-y-5">
    {reading && <p role="status">در حال خواندن پرونده و مجوز جاری…</p>}
    {error && <section className="card space-y-3 p-4"><p role="alert">{error}</p><button className="btn btn-outline" disabled={reading || saving || uncertain || dirty} onClick={() => void load(selected.current)}>دوباره خواندن پرونده</button></section>}
    {message && <p className="card p-4 text-sm leading-7" role="status">{message}</p>}
    {saving && <p role="status">در حال ثبت همان درخواست؛ هنوز موفقیت اعلام نشده است.</p>}
    {uncertain && <section className="card space-y-3 p-5"><p>تا تعیین تکلیف، ویرایش و تغییر پرونده بسته است؛ توکن و محتوای همان تلاش حفظ شده‌اند.</p><button className="btn btn-outline" disabled={saving || reading} onClick={() => void send()}>بررسی دوبارهٔ همین ثبت</button></section>}
    {confirmed && !readbackVerified && !error && !reading && <section className="card space-y-3 p-4"><p role="status">رسید ثبت محفوظ است؛ بازخوانی مستقل همان اثر هنوز تأیید نشده است. ثبت دوباره انجام نمی‌شود.</p><button className="btn btn-outline" disabled={saving} onClick={() => void load(selected.current)}>دوباره خواندن پرونده</button></section>}
    {confirmed && readbackVerified && !error && !reading && <button className="btn btn-outline" disabled={saving} onClick={() => { if (!live.current || revoked.current || !readbackVerified) return; receiptRef.current = null; setConfirmed(false); setReadbackVerified(false); setMessage(""); }}>ادامه با پروندهٔ بازخوانی‌شده</button>}
    {data && <ConsultationPanel key={revision} data={data} locked={locked} onDirty={() => { if (!locked) setDirty(true); }} onCommand={command => send(command)} onSelect={relationshipId => { if (!locked && !dirty) { setData(null); setMessage(""); void load(relationshipId); } }} selectionLocked={locked || dirty} onPeriod={next => { if (!locked && !dirty) { period.current = next; setData(null); void load(selected.current); } }} onDiscard={() => { if (!locked) { setDirty(false); setRevision(value => value + 1); } }} />}
  </div>;
}
