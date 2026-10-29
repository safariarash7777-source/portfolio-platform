"use client";
import React, { useState } from "react";
import { validateConsultationRequest, type ConsultationAction, type ConsultationCommand, type ConsultationDossier, type ConsultationSession } from "@/lib/consultation/contracts";
import { toPersianDigits } from "@/lib/format";
import Dossier from "./Dossier";
import SessionCard from "./SessionCard";

const member = "00000000-0000-4000-8000-000000000001", owner = "00000000-0000-4000-8000-000000000003";
const relation = "10000000-0000-4000-8000-000000000001", sessionId = "20000000-0000-4000-8000-000000000001", actionKey = "30000000-0000-4000-8000-000000000001";
const period = { startOn: "2026-10-01", endOn: "2026-10-31" }, asOf = "2026-10-23T12:00:00Z";
function dossier(version: number): ConsultationDossier {
  const id = `40000000-0000-4000-8000-00000000000${version}`;
  return { basis: { holdingsVersionId: null, cashFlowVersionId: id, goalsVersionId: null, cashFlowPeriod: period }, holdings: null, goals: null,
    cashFlow: { id, version, payload: { contractVersion: 1, period, accountDefinitions: [{ accountKey: "synthetic-bank", label: "حساب ساختگی" }], scopeAccountKeys: ["synthetic-bank"], opening: { amountToman: null, atStartOn: period.startOn, source: null },
      coverage: { actual: { status: "partial", memberAffirmed: false, source: null }, planned: { status: "unknown", memberAffirmed: false, source: null } },
      entries: [{ entryKey: "synthetic-income", kind: "income", basis: "actual", amountToman: version * 1000000, occurredOn: period.startOn, accountKey: "synthetic-bank", source: { label: "ورودی ساختگی برای نمونه", observedOn: period.startOn }, category: null, note: null }] } } };
}
function recommendation(version: number): ConsultationSession {
  return { id: version === 1 ? sessionId : "20000000-0000-4000-8000-000000000002", relationshipId: relation, sessionKey: sessionId, version, createdAt: asOf, actorId: owner, contentHash: (version === 1 ? "a" : "b").repeat(64), state: version === 1 ? "published" : "draft", approval: version === 1 ? { actorId: owner, createdAt: asOf } : null,
    body: { topic: `نمونه ساختگی — جمع‌بندی نسخه ${version}`, goal: "تکمیل تصویر جریان نقد — داده ساختگی", clientSummary: "پیش از اقدام، اطلاعات ناقص جریان نقد را تکمیل کنید. این متن، مشاوره واقعی نیست.", rationale: "سناریوی کنترل رفتار رابط با داده ساختگی", limitations: "همه داده‌ها نمونه‌اند؛ این صفحه از پرونده واقعی و سرویس مالی استفاده نمی‌کند.", reviewOn: "2099-12-31", basis: dossier(version).basis, researchVersionIds: [], evidence: [{ label: "منبع ساختگی", url: null, asOf: period.startOn }], actions: [{ actionKey, title: "تکمیل اطلاعات همین ماه — اقدام ساختگی", dueOn: "2099-12-31", responsible: "member" }] } };
}

/** Preview-only synthetic interaction. Real components, no Auth, API, database or model calls. */
export default function StartAPreview() {
  const [role, setRole] = useState("member-a"), [financialVersion, setFinancialVersion] = useState(1), [consent, setConsent] = useState(true), [failSave, setFailSave] = useState(false);
  const [feedback, setFeedback] = useState<ConsultationAction[]>([]), [activeEditor, setActiveEditor] = useState<string | null>(null), [notice, setNotice] = useState("");
  const advisor = role === "advisor", denied = role === "member-b" || advisor && !consent;
  const save = async (command: ConsultationCommand) => {
    if (command.kind !== "feedback" || denied || !consent || advisor) return false;
    const parsed = validateConsultationRequest({ contractVersion: "consultation-request.v1", expectedActorId: member, clientToken: crypto.randomUUID(), command }).command;
    if (parsed.kind !== "feedback") return false;
    if (failSave) { setNotice("شکست ساختگی ذخیره؛ متن فرم باید باقی بماند. هیچ درخواستی به سرویس مالی ارسال نشده است."); return false; }
    const latest = Math.max(0, ...feedback.filter(item => item.actionKey === parsed.actionKey).map(item => item.version));
    if (latest !== parsed.baseVersion) { setNotice("تعارض ساختگی نسخه؛ پیگیری بازنویسی نشد."); return false; }
    setFeedback(items => [...items, { id: crypto.randomUUID(), sessionId, actionKey: parsed.actionKey, version: parsed.baseVersion + 1, status: parsed.status, text: parsed.text, actorId: member, createdAt: new Date().toISOString() }]);
    setNotice("فقط در حافظه همین نمونه ثبت شد؛ موجودی و دو نسخه مالی ثابت ماندند."); return true;
  };
  return <main dir="rtl" className="mx-auto w-full max-w-5xl min-w-0 space-y-5 px-4 py-6">
    <header className="card space-y-3 p-4"><h1 className="text-2xl font-bold">نمونه نمایشی — مالی تا پیگیری مشاوره</h1><p>همه داده‌ها و نقش‌ها ساختگی‌اند. این صفحه برای بازبینی رابط است؛ به حساب، پایگاه مالی یا پیام عضو واقعی متصل نیست. با بارگذاری مجدد، تعامل نمونه بازنشانی می‌شود.</p><p className="text-sm">دو نسخه مالی و دو نسخه جمع‌بندی از پیش نمونه‌سازی شده‌اند؛ حفظ واقعی نسخه‌ها، مجوز و rollback جدا در PostgreSQL ایزوله آزموده شده‌اند.</p></header>
    <section className="card min-w-0 space-y-4 p-4" aria-label="کنترل سناریوی ساختگی">
      <label className="block space-y-2">نقش آزمایشی<select className="input min-h-11 w-full" value={role} onChange={event => { setRole(event.target.value); setActiveEditor(null); setNotice(""); }}><option value="member-a">عضو A — ساختگی</option><option value="advisor">مشاور — ساختگی</option><option value="member-b">عضو B — بدون مجوز پرونده A</option></select></label>
      <div className="flex flex-wrap gap-3">{[1,2].map(version => <button key={version} type="button" className="btn btn-outline" disabled={Boolean(activeEditor)} aria-pressed={financialVersion === version} onClick={() => setFinancialVersion(version)}>نسخه مالی {toPersianDigits(version)}</button>)}</div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setActiveEditor(null); }} />رضایت ساختگی برای مشاهده پرونده</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={failSave} onChange={event => setFailSave(event.target.checked)} />شبیه‌سازی شکست ذخیره پیگیری</label>
      <button type="button" className="btn btn-outline !whitespace-normal" disabled={denied || !consent} onClick={() => setFeedback(items => [...items, { id: crypto.randomUUID(), sessionId, actionKey, version: Math.max(0,...items.filter(item=>item.actionKey===actionKey).map(item=>item.version))+1, status: "doing", text: null, actorId: member, createdAt: new Date().toISOString() }])}>شبیه‌سازی رسیدن پیگیری هم‌زمان</button>
    </section>
    {notice && <p role="status" className="card p-4">{notice}</p>}
    {denied ? <p role="alert" className="card p-4">در این سناریوی ساختگی، مجوز پرونده A وجود ندارد؛ اطلاعات پرونده نمایش داده نمی‌شود.</p> : <>
      <Dossier data={dossier(financialVersion)} ownerId={member} />
      <SessionCard key={`${role}:${consent}`} session={recommendation(1)} latest={!advisor} advisor={advisor} owner={advisor} revoked={!consent} basis={dossier(financialVersion).basis} feedback={feedback} privateNote={advisor ? "یادداشت خصوصی کاملاً ساختگی" : null} locked={Boolean(activeEditor) || advisor} feedbackLocked={false} activeFeedbackKey={activeEditor} onFeedbackBegin={setActiveEditor} onFeedbackCancel={()=>setActiveEditor(null)} onCommand={save} onEdit={()=>{}} onDirty={()=>{}} />
      {advisor && <SessionCard session={recommendation(2)} latest advisor owner revoked={!consent} basis={dossier(financialVersion).basis} feedback={[]} locked onCommand={async()=>false} onEdit={()=>{}} onDirty={()=>{}} />}
    </>}
  </main>;
}
