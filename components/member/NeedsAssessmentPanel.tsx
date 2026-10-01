"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { type NeedsAssessment } from "@/lib/seasonal/contracts";
import { isAssessment, type AssessmentVersion, type Result } from "@/lib/member/home";
import { draftKey, restoreDraft } from "@/lib/member/draft";
import { memberData, memberErrorStatus, memberAuthErrorStatus, type MemberRequest } from "@/lib/member/http";
import { accountEntryHref } from "@/components/account/returnPath";

const emptyBody: NeedsAssessment = { experience: "new", interests: [], goal: "", question: "" };
const topics = ["صندوق‌ها", "طلا", "ارز", "سهام", "اصول سرمایه‌گذاری"];
const isReceipt = (v: unknown): v is { version: number } => !!v && typeof v === "object" && Number.isInteger((v as {version?:unknown}).version) && Number((v as {version:number}).version) > 0;
export default function NeedsAssessmentPanel({ cohortId, userId, request, preview = false }: { cohortId: string; userId: string; request?: MemberRequest; preview?: boolean }) {
  const [read, setRead] = useState<Result<AssessmentVersion | null>>({ state: "loading" });
  const [body, setBody] = useState<NeedsAssessment>(emptyBody);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const path = `/api/cohorts/${cohortId}/needs-assessment`;
  const key = draftKey(userId, cohortId);
  useEffect(() => {
    let current = true;
    memberData(path, isAssessment, request).then(data => {
      if (!current) return;
      setRead({ state: "ready", data }); setBase(data?.version ?? 0);
      let draft = null; try { draft = restoreDraft(sessionStorage.getItem(key), Date.now()); } catch { /* Memory-only editing remains available. */ }
      setBody(draft ?? data?.body ?? emptyBody); setDirty(!!draft);
      if (draft) setMessage("متن ذخیره‌نشدهٔ شما در همین مرورگر بازیابی شد؛ برای ثبت نهایی، دوباره ذخیره کنید.");
    }).catch(e => { if (current) setRead({ state: "error", status: memberErrorStatus(e) }); });
    return () => { current = false; };
  }, [path, key, request]);
  useEffect(() => {
    if (!dirty) return;
    try { sessionStorage.setItem(key, JSON.stringify({ body, savedAt: Date.now() })); } catch { /* Do not erase the form on storage errors. */ }
  }, [body, dirty, key]);
  function edit(next: NeedsAssessment) { setBody(next); setDirty(true); setMessage(""); }
  async function retryRead() {
    setBusy(true); setStatus(null);
    try { const data = await memberData(path, isAssessment, request); setRead({ state: "ready", data }); setBase(data?.version ?? 0); if (!dirty) setBody(data?.body ?? emptyBody); setMessage(dirty ? "نسخهٔ تازه دریافت شد؛ متن شما حفظ شد. آن را بررسی کنید و در صورت تمایل نسخهٔ تازه بسازید." : "آخرین پاسخ دریافت شد."); }
    catch (e) { setRead({ state: "error", status: memberErrorStatus(e) }); }
    finally { setBusy(false); }
  }
  async function save(submitted: boolean) {
    if (base === null || busy) return;
    setBusy(true); setStatus(null); setMessage("");
    try {
      if (!preview) {
        const auth = await createClient().auth.getUser();
        if (auth.error) { setStatus(memberAuthErrorStatus(auth.error)); setMessage("بررسی ورود در دسترس نیست؛ متن شما ارسال نشده و حفظ شده است."); return; }
        if (!auth.data.user) { setStatus(401); return; }
        if (auth.data.user.id !== userId) { setMessage("حساب ورود تغییر کرده است. این متن ارسال نشد؛ صفحه را با حساب خودتان دوباره باز کنید."); return; }
      }
      const receipt = await memberData(path, isReceipt, request, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, baseVersion: base, submitted }) });
      setBase(receipt.version); setDirty(false); try { sessionStorage.removeItem(key); } catch { /* The durable server record was saved. */ }
      setMessage(submitted ? "پاسخ شما ثبت شد؛ می‌توانید بعداً آن را اصلاح کنید." : "پیش‌نویس ذخیره شد؛ هر زمان خواستید ادامه دهید.");
      try { const data = await memberData(path, isAssessment, request); setRead({ state: "ready", data }); }
      catch (e) { setRead({ state: "error", status: memberErrorStatus(e) }); setMessage("ذخیره انجام شد، اما بازخوانی پاسخ در دسترس نیست. برای دیدن نسخهٔ ثبت‌شده دوباره دریافت کنید."); }
    } catch (e) { setStatus(memberErrorStatus(e)); setMessage("ذخیره انجام نشد؛ متن شما حفظ شده است."); }
    finally { setBusy(false); }
  }
  const readError = read.state === "error" ? read.status : null;
  const signIn = status === 401 || readError === 401;
  const choices = [...new Set([...topics, ...body.interests])];
  return <section className="card space-y-4 p-5" aria-labelledby="member-needs-title">
    <h2 id="member-needs-title" className="font-display text-xl font-bold">نیازسنجی کوتاه دوره</h2>
    <p className="text-sm">پاسخ به این چهار مورد به آماده‌سازی محتوای آموزشی کمک می‌کند. می‌توانید ذخیره کنید و بعداً ادامه دهید؛ دریافت خدمت به تکمیل این فرم وابسته نیست. ارقام مالی یا اطلاعات هویتی خصوصی را اینجا ننویسید.</p>
    {read.state === "loading" ? <p role="status">در حال دریافت پاسخ قبلی…</p> : null}
    {readError ? <div role="alert"><p>پاسخ قبلی قابل دریافت نیست؛ این به معنی خالی‌بودن آن نیست.</p><button className="btn btn-outline min-h-12" disabled={busy} onClick={() => void retryRead()}>دریافت دوبارهٔ پاسخ</button></div> : null}
    {read.state === "ready" && read.data ? <p className="text-sm">نسخهٔ پاسخ: {read.data.version.toLocaleString("fa-IR")} · {read.data.submitted_at ? "ثبت‌شده برای دوره" : "پیش‌نویس قابل ادامه"}</p> : null}
    <form onSubmit={e => { e.preventDefault(); void save(true); }} className="space-y-4">
      <label className="block space-y-2"><span>تجربهٔ سرمایه‌گذاری</span><select className="input min-h-12 w-full" value={body.experience} disabled={busy} onChange={e => edit({ ...body, experience: e.target.value as NeedsAssessment["experience"] })}><option value="new">تازه شروع کرده‌ام</option><option value="some">کمی تجربه دارم</option><option value="experienced">تجربه دارم</option></select></label>
      <fieldset><legend>موضوع‌های مورد علاقه (حداکثر پنج مورد)</legend><div className="flex flex-wrap gap-3 pt-2">{choices.map(topic => <label key={topic} className="inline-flex min-h-12 items-center gap-2"><input type="checkbox" checked={body.interests.includes(topic)} disabled={busy || body.interests.length >= 5 && !body.interests.includes(topic)} onChange={e => edit({ ...body, interests: e.target.checked ? [...body.interests, topic] : body.interests.filter(t => t !== topic) })} />{topic}</label>)}</div></fieldset>
      <label className="block space-y-2"><span>از این دوره چه می‌خواهید؟ (اختیاری)</span><textarea className="input min-h-24 w-full" maxLength={500} value={body.goal} disabled={busy} onChange={e => edit({ ...body, goal: e.target.value })} /></label>
      <label className="block space-y-2"><span>پرسش آموزشی شما (اختیاری)</span><textarea className="input min-h-24 w-full" maxLength={1000} value={body.question} disabled={busy} onChange={e => edit({ ...body, question: e.target.value })} /></label>
      <div className="flex flex-wrap gap-3"><button type="button" className="btn btn-outline min-h-12" disabled={busy || base === null} onClick={() => void save(false)}>ذخیره و ادامه در زمان دیگر</button><button className="btn btn-primary min-h-12" disabled={busy || base === null}>{busy ? "در حال ذخیره…" : "ثبت پاسخ دوره"}</button></div>
    </form>
    {message ? <p role={status ? "alert" : "status"}>{message}</p> : null}
    {status === 409 ? <div role="alert"><p>پاسخ در جای دیگری تغییر کرده است. ابتدا نسخهٔ تازه را دریافت و متن خودتان را بررسی کنید.</p><button className="btn btn-outline min-h-12" disabled={busy} onClick={() => void retryRead()}>دریافت نسخهٔ تازه؛ حفظ متن من</button></div> : null}
    {status === 403 ? <p role="alert">ثبت پاسخ برای این دوره با حساب فعلی مجاز نیست.</p> : null}
    {signIn ? <Link className="btn btn-outline min-h-12" href={accountEntryHref("/login", `/dashboard?cohort=${cohortId}`)}>ورود و بازگشت به همین دوره</Link> : null}
    {dirty ? <p className="text-sm">متن هنوز روی سرور ذخیره نشده است. نسخهٔ موقت آن تا دو ساعت در همین تب مرورگر نگه داشته می‌شود.</p> : null}
  </section>;
}
