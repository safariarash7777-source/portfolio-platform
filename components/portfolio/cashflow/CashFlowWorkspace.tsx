"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CashFlowRead, CashFlowReceipt } from "@/lib/portfolio/cashFlowApiContract";
import { createCashFlowAttempt, readCashFlow, sendCashFlowAttempt, type CashFlowAttempt } from "@/lib/portfolio/cashFlowRequest";
import { createClient } from "@/lib/supabase/client";
import { dateInput } from "@/lib/portfolio/financialInput";
import { formatJalali, toPersianDigits } from "@/lib/format";
import CashFlowSummary from "./CashFlowSummary";
import CashFlowEditor from "./CashFlowEditor";
import { cashFlowDraft, draftPayload, type CashFlowDraft } from "./draft";

type Period = { startOn: string; endOn: string };
function url(period: Period, version?: string) {
  const query = new URLSearchParams(period); if (version) query.set("version", version);
  return `/dashboard/cashflow?${query}`;
}

export default function CashFlowWorkspace({ expectedOwnerId, initialPeriod, initialVersion }: {
  expectedOwnerId: string; initialPeriod: Period; initialVersion?: string;
}) {
  const [identity, setIdentity] = useState<"checking" | "ready" | "error" | "changed">("checking");
  const [selection, setSelection] = useState(initialPeriod);
  const [data, setData] = useState<CashFlowRead | null>(null), current = useRef<CashFlowRead | null>(null);
  const [draft, setDraft] = useState<CashFlowDraft | null>(null), [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState(false), [readError, setReadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState(""), [receipt, setReceipt] = useState<CashFlowReceipt | null>(null);
  const live = useRef(false), revoked = useRef(false), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const pending = useRef<CashFlowAttempt | null>(null), saveLock = useRef(false), priorUnknown = useRef(false);
  const initialized = useRef(false);
  const requested = useRef<{ period: Period; version?: string; mode: "replace" | "readback" }>({ period: initialPeriod, version: initialVersion, mode: "replace" });
  const startOn = initialPeriod.startOn, endOn = initialPeriod.endOn;
  const abortReads = useCallback(() => { generation.current++; controller.current?.abort(); }, []);

  const clearIdentity = useCallback(() => {
    live.current = false; revoked.current = true; abortReads();
    current.current = null; pending.current = null; priorUnknown.current = false;
    setData(null); setDraft(null); setReceipt(null); setMessage(""); setReadError(""); setHistoryError(""); setDirty(false);
    setSaving(false); setReading(false); setUncertain(false); setConflict(false); setIdentity("changed");
  }, [abortReads]);

  const load = useCallback(async (period: Period, version?: string, mode: "replace" | "history" | "readback" = "replace", beforeVersion?: number) => {
    if (!live.current || revoked.current) return false;
    let selected: Period;
    try { selected = { startOn: dateInput(period.startOn), endOn: dateInput(period.endOn) }; if (selected.startOn > selected.endOn) throw new Error(); }
    catch { setReadError("شروع و پایان معتبر دوره را با تقویم میلادی انتخاب کنید."); return false; }
    const sequence = ++generation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    if (mode !== "history") requested.current = { period: selected, version, mode };
    const previous = current.current;
    const samePeriod = previous?.period.startOn === selected.startOn && previous.period.endOn === selected.endOn;
    if (!samePeriod) { current.current = null; setData(null); setDraft(null); setReceipt(null); }
    setReading(true); if (mode === "history") setHistoryError(""); else setReadError("");
    try {
      const result = await readCashFlow({ period: selected, version, beforeVersion, signal: abort.signal });
      if (!live.current || revoked.current || sequence !== generation.current) return false;
      if (result.status === "error") {
        if (result.httpStatus === 401 || result.httpStatus === 403) { clearIdentity(); return false; }
        const text = mode === "history" ? "خواندن صفحهٔ بعد سابقه انجام نشد؛ موارد قبلی حفظ شدند." : result.httpStatus === 404 ? "نسخهٔ انتخابی برای این حساب و دوره در دسترس نیست؛ وجود نسخه برای حساب دیگری تأیید نمی‌شود." : "خواندن این نسخه انجام نشد؛ نتیجهٔ خالی یا صفر تأیید نشده است.";
        if (mode === "history") setHistoryError(text); else setReadError(text);
        return false;
      }
      if (result.data.ownerId !== expectedOwnerId) { clearIdentity(); return false; }
      if (result.data.period.startOn !== selected.startOn || result.data.period.endOn !== selected.endOn || version && result.data.snapshot?.id !== version) {
        setReadError("پاسخ با دوره یا نسخهٔ درخواست‌شده یکسان نیست؛ دادهٔ تازه تأیید نشد."); return false;
      }
      const next = result.data;
      if (mode === "history" && previous && samePeriod) {
        const items = new Map(previous.history.items.map(item => [item.id, item]));
        for (const item of next.history.items) items.set(item.id, item);
        const merged = { ...previous, latest: next.latest, history: next.history.state === "ready" ? { ...next.history, items: [...items.values()].sort((a, b) => b.version - a.version) } : previous.history };
        if (next.history.state === "error") setHistoryError("خواندن صفحهٔ بعد سابقه انجام نشد؛ موارد قبلی حفظ شدند.");
        current.current = merged; setData(merged);
      } else {
        current.current = next; setData(next); setDraft(cashFlowDraft(next.period, next.snapshot?.payload)); setDirty(false);
        setSelection(next.period); setHistoryError(next.history.state === "error" ? "سابقه خوانده نشد؛ نسخهٔ انتخابی حفظ شده است." : "");
        window.history.replaceState(null, "", url(next.period, next.snapshot?.id));
      }
      return true;
    } catch {
      if (sequence === generation.current && live.current) {
        if (mode === "history") setHistoryError("خواندن سابقه انجام نشد؛ موارد قبلی حفظ شدند.");
        else setReadError("خواندن انجام نشد؛ اطلاعاتِ قبلی، تأیید دریافت تازه نیست.");
      }
      return false;
    } finally { if (sequence === generation.current && live.current) setReading(false); }
  }, [expectedOwnerId, clearIdentity]);

  useEffect(() => {
    let disposed = false;
    if (current.current === null && pending.current === null) initialized.current = false;
    try {
      const { data: auth } = createClient().auth.onAuthStateChange((event, session) => {
        if (disposed) return;
        if (event === "SIGNED_OUT" || session?.user && session.user.id !== expectedOwnerId) { clearIdentity(); return; }
        if (revoked.current) return;
        if (!session?.user) { live.current = false; generation.current++; controller.current?.abort(); setReading(false); if (!current.current && !pending.current) initialized.current = false; setIdentity("error"); return; }
        live.current = true; setIdentity("ready");
        if (!initialized.current) {
          initialized.current = true;
          if (startOn && endOn) void load({ startOn, endOn }, initialVersion);
        }
      });
      return () => { disposed = true; live.current = false; abortReads(); auth.subscription.unsubscribe(); };
    } catch { setIdentity("error"); return () => { disposed = true; live.current = false; }; }
  }, [expectedOwnerId, startOn, endOn, initialVersion, load, clearIdentity, abortReads]);

  useEffect(() => {
    if (!(dirty && receipt === null || saving || uncertain)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, receipt, saving, uncertain]);

  const latestReady = data?.latest.state === "ready";
  const currentVersion = data?.snapshot?.version ?? 0;
  const editable = data !== null && latestReady && currentVersion === data.latest.version;
  const locked = saving || uncertain || conflict || receipt !== null || !editable || reading || Boolean(readError);
  const requestLocked = dirty || saving || pending.current !== null || receipt !== null;

  const save = async () => {
    if (!live.current || revoked.current || saveLock.current || receipt || !draft || !data || reading || readError || conflict || !editable) return;
    setMessage("");
    if (!pending.current) {
      let payload;
      try { payload = draftPayload(draft); }
      catch (error) { setMessage(error instanceof Error ? error.message : "فرم معتبر نیست."); return; }
      try { pending.current = createCashFlowAttempt({ contractVersion: "cash-flow-request.v1", expectedOwnerId, clientToken: crypto.randomUUID(), baseVersion: data.latest.version!, payload }); }
      catch { setMessage(`اطلاعات فرم با قرارداد ثبت سازگار نیست؛ دورهٔ حداکثر ${toPersianDigits(366)}روزه، مرجع حساب‌ها، منبع و روز رویدادها و تأیید پوشش کامل را بررسی کنید. درخواستی ارسال نشد.`); return; }
    }
    saveLock.current = true; setSaving(true);
    const attempt = pending.current, sequence = generation.current;
    try {
      const outcome = await sendCashFlowAttempt(attempt, { currentOwnerId: expectedOwnerId, unresolvedPrior: priorUnknown.current });
      if (!live.current || revoked.current || sequence !== generation.current) return;
      if (outcome.status === "unknown") { priorUnknown.current = true; setUncertain(true); setMessage(outcome.message); return; }
      if (outcome.status === "conflict") { setConflict(true); setMessage("تعارض نسخه یا شناسهٔ ثبت؛ پیش‌نویس و همان تلاش حفظ شدند. هیچ ثبت تازه یا بازنویسی خودکار انجام نمی‌شود. آخرین نسخه را جدا باز کنید؛ نتیجهٔ ثبت پیشین ممکن است همچنان نامعلوم باشد."); return; }
      if (outcome.status === "rejected") {
        if (outcome.httpStatus === 401 || outcome.error.code === "OWNER_CHANGED") { clearIdentity(); return; }
        pending.current = null; setMessage(outcome.error.error); return;
      }
      setReceipt(outcome.receipt); priorUnknown.current = false; setUncertain(false);
      await load(data.period, outcome.receipt.versionId, "readback");
    } catch { if (live.current && sequence === generation.current) { priorUnknown.current = true; setUncertain(true); setMessage("نتیجهٔ ثبت نامعلوم است؛ فقط همین تلاش را دوباره بررسی کنید."); } }
    finally { saveLock.current = false; if (live.current) setSaving(false); }
  };

  if (identity !== "ready") return <section className="card space-y-3 p-5">
    <p role={identity === "checking" ? "status" : "alert"}>{identity === "checking" ? "در حال تأیید نشست؛ اطلاعات مالی هنوز نمایش داده نمی‌شود." : identity === "changed" ? "حساب، نشست یا دسترسی جاری تغییر کرده است؛ اطلاعات خصوصی این صفحه پاک شد. تلاش قبلی به حساب دیگری منتقل نمی‌شود. پس از ورود به حساب مربوط، صفحه را دوباره باز کنید." : "نشست مرورگر تأیید نشد؛ اطلاعات مالی، صفر یا خالی اعلام نمی‌شود."}</p>
    {identity !== "checking" && <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>بازکردن دوبارهٔ صفحه و بررسی نشست</button>}
  </section>;
  return <div className="min-w-0 space-y-6">
    <form className="card space-y-4 p-5" aria-label="انتخاب دورهٔ جریان نقد" onSubmit={event => { event.preventDefault(); if (!requestLocked && !reading) void load(selection); }}>
      <h2 className="font-display text-xl font-bold">دورهٔ کدام روزها؟</h2>
      <p className="text-sm leading-7">شروع و پایان با تقویم میلادی؛ هر دو روز در دوره‌اند. حداکثر {toPersianDigits(366)} روز. برای تغییر دوره ابتدا پیش‌نویس را لغو یا ثبت را تعیین تکلیف کنید.</p>
      <fieldset disabled={requestLocked || reading} className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-3"><legend className="sr-only">دورهٔ انتخابی</legend>
        <label className="space-y-1 text-sm">شروع دوره (میلادی)<input type="date" className="input w-full min-w-0" value={selection.startOn} onChange={event => setSelection({ ...selection, startOn: event.target.value })} /></label>
        <label className="space-y-1 text-sm">پایان دوره (میلادی)<input type="date" className="input w-full min-w-0" value={selection.endOn} onChange={event => setSelection({ ...selection, endOn: event.target.value })} /></label>
        <button type="submit" className="btn btn-outline">خواندن این دوره</button>
      </fieldset>
    </form>
    {reading && <p role="status">در حال خواندن نسخه و پوشش همان دوره…</p>}
    {readError && <section className="card space-y-3 p-4"><p role="alert">{readError}{data && " نمایش زیر مربوط به خواندن قبلی است؛ دریافت تازه تأیید نشده است."}</p><button type="button" className="btn btn-outline" disabled={reading || saving || uncertain || conflict || dirty && !receipt} onClick={() => void load(requested.current.period, requested.current.version, requested.current.mode)}>دوباره خواندن نسخهٔ درخواست‌شده</button></section>}
    {!data && !reading && !readError && <p className="card p-5 text-sm leading-7">برای دیدن نسخه‌ها یا آغاز یک پیش‌نویس، دوره را انتخاب و بخوانید. هنوز نبود رکورد یا مبلغی تأیید نشده است.</p>}
    {receipt && <section className="card space-y-3 p-5" aria-label="رسید ثبت جریان نقد"><p role="status">سرور ثبت نسخهٔ {toPersianDigits(receipt.version)} را تأیید کرد{receipt.reused ? "؛ همان تلاش قبلی بازیابی شد" : ""}. {data?.snapshot?.id === receipt.versionId && !readError ? "نسخهٔ تأییدشده مستقل بازخوانی شد." : "بازخوانی مستقل هنوز تأیید نشده است؛ رسید حفظ شده است."}</p>
      <a className="btn btn-outline" href={url(data?.period ?? selection, receipt.versionId)}>بازکردن نسخهٔ رسید</a>
      {data?.snapshot?.id === receipt.versionId && editable && !readError && <button type="button" className="btn btn-outline" disabled={reading || saving} onClick={() => { pending.current = null; setReceipt(null); setMessage(""); setDraft(cashFlowDraft(data.period, data.snapshot!.payload)); setDirty(false); }}>ویرایش نسخهٔ بازخوانی‌شده برای ثبت بعدی</button>}
    </section>}
    {data && <>
      <section className="card space-y-3 p-5" aria-label="نسخه و سابقهٔ جریان نقد">
        <h2 className="font-bold">{data.snapshot ? `نسخهٔ ${toPersianDigits(data.snapshot.version)}` : "در این دوره هنوز نسخه‌ای ثبت نشده است"}</h2>
        {data.snapshot && <p className="text-sm">تاریخ ثبت این نسخه: <time dateTime={data.snapshot.createdAt}>{formatJalali(data.snapshot.createdAt)}</time>؛ این تاریخ جای روز وقوع یا مشاهدهٔ منبع نیست.</p>}
        {data.state === "empty" && <p className="text-sm leading-7">خواندن موفق بود؛ نبود نسخه به معنی نداشتن درآمد، هزینه یا موجودی نیست. پیش‌نویس زیر هنوز ذخیره نشده و پوشش آن نامعلوم است.</p>}
        {data.latest.state === "error" ? <p role="alert">آخرین نسخه خوانده نشد؛ نسخهٔ انتخابی حفظ است ولی ثبت تازه مجاز نیست.</p> : !editable && <p role="status">این نسخه تاریخی و فقط خواندنی است. اصلاح از آخرین نسخه آغاز می‌شود؛ سابقه بازنویسی نمی‌شود.</p>}
        <a className="btn btn-outline" href={url(data.period)} target="_blank" rel="noopener noreferrer">آخرین نسخه در صفحهٔ جدا</a>
        {historyError && <p role="alert">{historyError}</p>}
        <ul className="flex flex-wrap gap-3" aria-label="نسخه‌های ثبت‌شده">{data.history.items.map(item => <li key={item.id}><a className="btn btn-outline" aria-current={item.id === data.snapshot?.id ? "page" : undefined} href={url(data.period, item.id)}>نسخهٔ {toPersianDigits(item.version)} · {formatJalali(item.createdAt)}</a></li>)}</ul>
        {data.history.nextBeforeVersion !== null && <button type="button" className="btn btn-outline" disabled={reading || requestLocked} onClick={() => void load(data.period, data.snapshot?.id, "history", data.history.nextBeforeVersion!)}>نسخه‌های قدیمی‌تر</button>}
        {data.history.state === "error" && <button type="button" className="btn btn-outline" disabled={reading || requestLocked} onClick={() => void load(data.period, data.snapshot?.id, "history")}>دوباره خواندن سابقه</button>}
      </section>
      {data.report && <CashFlowSummary report={data.report} />}
      {message && <p role="alert" className="card p-4 text-sm leading-7">{message}</p>}
      {saving && <p role="status">{receipt ? "رسید ثبت دریافت شد؛ در حال بازخوانی همان نسخه هستیم." : "در حال ارسال همان تلاش ثبت؛ هنوز موفقیت تأیید نشده است."}</p>}
      {(uncertain || conflict) && <section className="card space-y-3 p-5"><p className="text-sm leading-7">ویرایش و تغییر دوره قفل است. شناسه، نسخهٔ پایه و محتوای همان درخواست حفظ شده‌اند؛ درخواست تازه‌ای ساخته نمی‌شود.</p>{!conflict && <button type="button" className="btn btn-gold" disabled={saving || reading} onClick={() => void save()}>بررسی دوبارهٔ همین ثبت</button>}<a className="btn btn-outline" href={url(data.period)} target="_blank" rel="noopener noreferrer">بررسی آخرین نسخه در صفحهٔ جدا</a></section>}
      {draft && <><p className="text-sm leading-7">خلاصهٔ بالا فقط نسخهٔ خوانده‌شده است؛ تغییرات فرم، عدد ذخیره‌شده را عوض نمی‌کند. دورهٔ فرم: <bdi>{toPersianDigits(draft.period.startOn)} — {toPersianDigits(draft.period.endOn)}</bdi>.</p><CashFlowEditor draft={draft} locked={locked} onChange={next => { if (!locked && live.current) { setDraft(next); setDirty(true); setMessage(""); } }} onSave={() => void save()} onCancel={() => { if (!locked && data) { setDraft(cashFlowDraft(data.period, data.snapshot?.payload)); setDirty(false); setMessage(""); } }} /></>}
    </>}
  </div>;
}
