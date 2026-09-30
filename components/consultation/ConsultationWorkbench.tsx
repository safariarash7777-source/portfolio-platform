"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatJalali, toPersianDigits } from "@/lib/format";
import { latestActions, type ConsultationData, type Session, type Action } from "@/lib/consultation/contracts";
const STATUS = { open:"باز", doing:"در حال انجام", done:"انجام‌شده" };
function sessionTime(value:string) {
  return `${formatJalali(value)} · ${new Date(value).toLocaleTimeString("fa-IR", {timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit"})} به وقت تهران`;
}
export default function ConsultationWorkbench({data}:{data:ConsultationData}) {
  const router=useRouter();
  const lock=useRef(false);
  const [busy,setBusy]=useState(false), [message,setMessage]=useState("");
  const [clientLabel,setClientLabel]=useState("");
  const [advisorId,setAdvisorId]=useState(data.advisors[0]?.user_id ?? "");
  const [sessionKey,setSessionKey]=useState(() => crypto.randomUUID());
  const [baseVersion,setBaseVersion]=useState(0);
  const [topic,setTopic]=useState(""), [goal,setGoal]=useState(""), [summary,setSummary]=useState(""), [privateNote,setPrivateNote]=useState("");
  const [occursAt,setOccursAt]=useState(""), [holdingVersionId,setHoldingVersionId]=useState(""), [researchVersionId,setResearchVersionId]=useState("");
  const [actionKey,setActionKey]=useState(() => crypto.randomUUID()), [actionBase,setActionBase]=useState(0);
  const [title,setTitle]=useState(""), [dueOn,setDueOn]=useState(""), [sessionId,setSessionId]=useState("");
  const [responsibleId,setResponsibleId]=useState(data.selected?.client_id ?? "");
  const [status,setStatus]=useState<Action["status"]>("open");
  const relation=data.selected;
  const advisor=!!relation && relation.advisor_id === data.userId && !data.revoked;
  const published=new Set(data.publications.map(p => p.session_id));
  async function send(payload: Record<string,unknown>, success:string) {
    if (lock.current) return false;
    lock.current=true;setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/consultation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json();
      if (!response.ok) {setMessage(typeof body.error === "string" ? body.error : "ذخیره انجام نشد. متن شما حفظ شده است.");return false;}
      setMessage(success);router.refresh();return true;
    } catch {setMessage("ارتباط برقرار نشد. متن شما حفظ شده است؛ دوباره تلاش کنید.");return false;}
    finally {lock.current=false;setBusy(false);}
  }
  function editSession(s:Session) {
    setSessionKey(s.session_key);setBaseVersion(Math.max(...data.sessions.filter(x=>x.session_key===s.session_key).map(x=>x.version)));
    setTopic(s.topic);setGoal(s.goal);setSummary(s.client_summary);setPrivateNote(data.notes.find(n=>n.session_id===s.id)?.note ?? "");
    // Keep the stored instant (with offset) rather than reinterpreting it as device-local time.
    setOccursAt(s.occurs_at);setHoldingVersionId(s.holding_version_id ?? "");setResearchVersionId(s.research_version_id ?? "");
    setMessage("جلسه در فرم باز شد؛ ذخیره، نسخهٔ تازه می‌سازد.");
  }
  function editAction(a:Action) {setActionKey(a.action_key);setActionBase(a.version);setTitle(a.title);setDueOn(a.due_on);setSessionId(a.session_id);setResponsibleId(a.responsible_id);setStatus(a.status);}
  async function saveSession() {
    if (!relation) return;
    if (!Number.isFinite(Date.parse(occursAt))) {setMessage("زمان معتبر جلسه را وارد کنید.");return;}
    if (await send({action:"session",relationshipId:relation.id,sessionKey,baseVersion,topic,goal,summary,privateNote,occursAt,holdingVersionId,researchVersionId},"جلسه ذخیره شد؛ خلاصه هنوز برای مشتری منتشر نشده است.")) setBaseVersion(v=>v+1);
  }
  const field=(label:string,value:string,onChange:(v:string)=>void,area=false) => <label className="block space-y-2"><span className="text-sm font-bold">{label}</span>
    {area ? <textarea className="input w-full" rows={3} value={value} onChange={e=>onChange(e.target.value)} maxLength={10000} /> : <input className="input w-full" value={value} onChange={e=>onChange(e.target.value)} />}</label>;
  return <div className="space-y-5">
    {message && <p className="card p-4 text-sm leading-7" role="status">{message}</p>}
    <div className="card p-5 space-y-4">
      <h2 className="font-bold text-lg">دادن دسترسی به مشاور</h2>
      <p className="text-sm leading-7">با ثبت این رابطه، مشاور انتخابی می‌تواند نسخه‌های دارایی و پروندهٔ جلسهٔ شما را در چارچوب خدمت ببیند و جلسه و اقدام ثبت کند. یادداشت داخلی مشاور برای مشتری نمایش داده نمی‌شود. داشتن اشتراک به‌تنهایی این دسترسی را ایجاد نمی‌کند.</p>
      {data.advisors.length ? <>
        {field("نام شما برای این پرونده",clientLabel,setClientLabel)}
        <label className="block space-y-2"><span>مشاور</span><select className="input w-full" value={advisorId} onChange={e=>setAdvisorId(e.target.value)}>{data.advisors.map(a=><option key={a.user_id} value={a.user_id}>{a.display_name}</option>)}</select></label>
        <button className="btn btn-outline min-h-11" disabled={busy || !clientLabel.trim()} onClick={()=>void send({action:"grant",advisorId,clientLabel},"رابطه با رضایت شما ثبت شد.")}>ثبت رابطه و دادن دسترسی</button>
      </> : <p>مشاور این محیط هنوز معرفی نشده است.</p>}
    </div>
    {data.relationships.length > 0 && <nav className="flex flex-wrap gap-3" aria-label="پرونده‌ها">{data.relationships.map(r=><Link className="btn btn-outline min-h-11" key={r.id} href={`?relation=${r.id}`}>{r.client_label} · {data.advisors.find(a=>a.user_id===r.advisor_id)?.display_name ?? "مشاور"}</Link>)}</nav>}
    {relation && <>
      <section className="card p-5 space-y-3"><h2 className="font-bold text-lg">پروندهٔ {relation.client_label}</h2>
        {data.revoked ? <p>دسترسی مشاور لغو شده است؛ سوابق منتشرشدهٔ خودتان باقی می‌ماند.</p> : <button disabled={busy} className="btn btn-outline min-h-11" onClick={()=>void send({action:"revoke",relationshipId:relation.id},"دسترسی مشاور لغو شد.")}>لغو دسترسی مشاور</button>}
        <Link className="underline text-sm" href="/dashboard/holdings">دارایی‌های من و تاریخچهٔ نسخه‌ها</Link>
      </section>
      {advisor && <section className="card p-5 space-y-4"><h2 className="font-bold text-lg">ثبت یا اصلاح جلسه</h2>
        <p className="text-sm">نسخهٔ پایه: {toPersianDigits(baseVersion)}. ذخیرهٔ یادداشت داخلی، خلاصه را منتشر نمی‌کند.</p>
        {field("زمان جلسه با منطقهٔ زمانی، مثال 2026-09-30T10:00:00+03:30",occursAt,setOccursAt)}
        {field("موضوع",topic,setTopic)}{field("هدف ثبت‌شده",goal,setGoal,true)}{field("خلاصهٔ قابل مشاهدهٔ مشتری پس از انتشار",summary,setSummary,true)}{field("یادداشت خصوصی مشاور",privateNote,setPrivateNote,true)}
        <label className="block space-y-2"><span>نسخهٔ دارایی مربوط به جلسه</span><select className="input w-full" value={holdingVersionId} onChange={e=>setHoldingVersionId(e.target.value)}><option value="">بدون پیوند دارایی</option>{data.holdings.map(h=><option key={h.id} value={h.id}>نسخهٔ {toPersianDigits(h.version)} · {formatJalali(h.created_at)}</option>)}</select></label>
        {field("شناسهٔ نسخهٔ پژوهش تأییدشده، اختیاری",researchVersionId,setResearchVersionId)}
        <button disabled={busy} className="btn btn-gold min-h-11" onClick={()=>void saveSession()}>ذخیرهٔ نسخهٔ جلسه</button>
        <button disabled={busy} className="btn btn-outline min-h-11 mr-2" onClick={()=>{setSessionKey(crypto.randomUUID());setBaseVersion(0);setTopic("");setGoal("");setSummary("");setPrivateNote("");setOccursAt("");setHoldingVersionId("");setResearchVersionId("");}}>شروع جلسهٔ تازه</button>
      </section>}
      <section className="card p-5 space-y-4"><h2 className="font-bold text-lg">جلسه‌ها و خلاصه‌های منتشرشده</h2>
        {data.sessions.length === 0 && <p>هنوز جلسهٔ قابل مشاهده‌ای ثبت نشده است.</p>}
        {data.sessions.map(s=><article key={s.id} className="border-t pt-4 space-y-3" style={{borderColor:"var(--line)"}}>
          <h3 className="font-bold">{s.topic} · نسخهٔ {toPersianDigits(s.version)} · {sessionTime(s.occurs_at)}</h3>
          <p className="text-sm">هدف: {s.goal}</p><p className="text-sm whitespace-pre-wrap leading-7">{s.client_summary}</p>
          <p className="text-xs">{published.has(s.id) ? "خلاصه برای مشتری منتشر شده است." : "پیش‌نویس؛ فقط مشاور مجاز می‌بیند."}</p>
          {s.holding_version_id && <p className="text-sm">نسخهٔ دارایی مربوط: {toPersianDigits(data.holdings.find(h=>h.id===s.holding_version_id)?.version ?? "—")}</p>}
          {s.research_version_id && <p className="text-sm">خلاصه به یک نسخهٔ تأییدشدهٔ پژوهش پیوند دارد؛ پیش‌نویس داخلی در پرونده نمایش داده نمی‌شود.</p>}
          {advisor && <>
            <details><summary className="cursor-pointer py-3">یادداشت خصوصی</summary><p className="whitespace-pre-wrap text-sm leading-7">{data.notes.find(n=>n.session_id===s.id)?.note || "یادداشت ندارد."}</p></details>
            <button className="btn btn-outline min-h-11" disabled={busy} onClick={()=>editSession(s)}>بازکردن برای نسخهٔ بعدی</button>
            {!published.has(s.id) && <button className="btn btn-gold min-h-11 mr-2" disabled={busy || data.sessions.some(n=>n.session_key===s.session_key && n.version>s.version)} onClick={()=>void send({action:"publish",sessionId:s.id},"خلاصهٔ همین نسخه برای مشتری منتشر شد.")}>انتشار همین خلاصه برای مشتری</button>}
          </>}
        </article>)}
      </section>
      <section className="card p-5 space-y-4"><h2 className="font-bold text-lg">اقدام بعدی</h2>
        {latestActions(data.actions).length === 0 && <p>هنوز اقدام توافق‌شده‌ای ثبت نشده است.</p>}
        {latestActions(data.actions).map(a=><article key={a.action_key} className="space-y-2 border-t pt-3" style={{borderColor:"var(--line)"}}><h3 className="font-bold">{a.title}</h3><p className="text-sm">مسئول: {a.responsible_id===relation.client_id ? "مشتری" : "مشاور"} · موعد: {formatJalali(a.due_on)} · {STATUS[a.status]}</p>
          {(advisor || a.responsible_id===data.userId) && <select aria-label={`وضعیت ${a.title}`} className="input" disabled={busy} value={a.status} onChange={e=>void send({action:"task",relationshipId:relation.id,actionKey:a.action_key,baseVersion:a.version,status:e.target.value},"وضعیت با حفظ سابقه ثبت شد.")}>{Object.entries(STATUS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>}
          {advisor && <button className="btn btn-outline min-h-11" disabled={busy} onClick={()=>editAction(a)}>اصلاح مشخصات اقدام</button>}
          <details><summary className="cursor-pointer py-3 text-sm">سابقهٔ تغییر</summary><ul className="space-y-2 text-sm">{data.actions.filter(x=>x.action_key===a.action_key).map(x=><li key={x.id}>نسخهٔ {toPersianDigits(x.version)} · {STATUS[x.status]} · {x.title} · {formatJalali(x.created_at)}</li>)}</ul></details>
        </article>)}
        {advisor && <div className="space-y-4 border-t pt-4" style={{borderColor:"var(--line)"}}><h3 className="font-bold">ثبت اقدام توافق‌شده</h3>{field("شرح اقدام",title,setTitle)}{field("موعد میلادی YYYY-MM-DD",dueOn,setDueOn)}
          <label className="block space-y-2"><span>جلسهٔ منتشرشده</span><select className="input w-full" value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">انتخاب جلسه</option>{data.sessions.filter(s=>published.has(s.id)).map(s=><option key={s.id} value={s.id}>{s.topic} · نسخهٔ {toPersianDigits(s.version)}</option>)}</select></label>
          <label className="block space-y-2"><span>مسئول</span><select className="input w-full" value={responsibleId} onChange={e=>setResponsibleId(e.target.value)}><option value={relation.client_id}>مشتری</option><option value={relation.advisor_id}>مشاور</option></select></label>
          <button className="btn btn-gold min-h-11" disabled={busy} onClick={()=>void send({action:"task",relationshipId:relation.id,actionKey,baseVersion:actionBase,title,dueOn,sessionId,responsibleId,status},"اقدام توافق‌شده ثبت شد.").then(ok=>{if(ok){setActionBase(v=>v+1);}})}>ذخیرهٔ نسخهٔ اقدام</button>
          <button className="btn btn-outline min-h-11 mr-2" disabled={busy} onClick={()=>{setActionKey(crypto.randomUUID());setActionBase(0);setTitle("");setDueOn("");setSessionId("");setStatus("open");}}>اقدام تازه</button>
        </div>}
      </section>
    </>}
  </div>;
}
