"use client";
import React, { useState } from "react";
import { formatJalali, toPersianDigits } from "@/lib/format";
import type { ConsultationAction } from "@/lib/consultation/contracts";
import type { ReplyCommand, ReplyRead, ReplyReadOnlyReason } from "@/lib/consultation/replies";

/** Presentation model only. The API adapter must validate identity and parent IDs. */
export type ReplyView = { id: string; version: number; text: string; createdAt: string };
export type QuestionView = { id: string; text: string; createdAt: string; replies: ReplyView[] };
export type ReplyEdit = { questionId: string; baseVersion: number; text: string };

export function ReplyQuestion({ question, canReply, locked, onSave, onDirty, onCancel }: {
  question: QuestionView; canReply: boolean; locked: boolean;
  onSave?: (edit: ReplyEdit) => Promise<boolean>; onDirty?: () => void; onCancel?: () => void;
}) {
  const versions = [...question.replies].sort((a, b) => b.version - a.version);
  const latest = versions[0];
  const [draft, setDraft] = useState<ReplyEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const disabled = locked || saving || Boolean(error);
  return <article className="min-w-0 space-y-3 rounded-lg border border-line p-3">
    <p className="text-sm font-bold">پرسش عضو · <time dateTime={question.createdAt}>{formatJalali(question.createdAt)}</time></p>
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{question.text}</p>
    {latest ? <div className="space-y-2 border-s-2 border-line ps-3"><p className="text-sm font-bold">پاسخ مشاور · نسخهٔ {toPersianDigits(latest.version)} · <time dateTime={latest.createdAt}>{formatJalali(latest.createdAt)}</time></p><p className="whitespace-pre-wrap break-words text-sm leading-7">{latest.text}</p></div> : <p className="text-sm">هنوز پاسخی ثبت نشده است.</p>}
    {versions.length > 1 && <details className="text-sm"><summary className="cursor-pointer">نسخه‌های قبلی پاسخ</summary><ul className="mt-3 space-y-3">{versions.slice(1).map(reply => <li key={reply.id}><p>نسخهٔ {toPersianDigits(reply.version)} · <time dateTime={reply.createdAt}>{formatJalali(reply.createdAt)}</time></p><p className="whitespace-pre-wrap break-words leading-7">{reply.text}</p></li>)}</ul></details>}
    {error && <p role="alert" className="text-sm leading-7">{error}</p>}
    {canReply && onSave && !draft && <button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={disabled} onClick={() => { setDraft({ questionId: question.id, baseVersion: latest?.version ?? 0, text: latest?.text ?? "" }); onDirty?.(); }}>{latest ? "اصلاح پاسخ در نسخهٔ تازه" : "نوشتن پاسخ"}</button>}
    {canReply && onSave && draft && <form onSubmit={async event => {
      event.preventDefault();
      if (disabled || !draft.text.trim() || (latest?.version ?? 0) !== draft.baseVersion) return;
      setSaving(true);
      try { if (await onSave({ ...draft, text: draft.text.trim() })) setDraft(null); }
      catch { setError("نتیجهٔ انتشار مشخص نشد. متن حفظ شده است؛ پیش از تلاش تازه، وضعیت ثبت را بررسی کنید."); }
      finally { setSaving(false); }
    }}><fieldset disabled={disabled} className="space-y-3"><legend className="sr-only">پاسخ به همین پرسش</legend>
      <label className="block space-y-2 text-sm"><span>متن پاسخ مشاور</span><textarea className="input min-h-28 w-full min-w-0" value={draft.text} maxLength={2000} onChange={event => { setDraft({ ...draft, text: event.target.value }); onDirty?.(); }} /></label>
      {(latest?.version ?? 0) !== draft.baseVersion && <p role="alert" className="text-sm">از زمان شروع ویرایش، پاسخ تازه‌ای ثبت شده است. متن شما حفظ شده؛ پیش از انتشار، نسخهٔ تازه را بررسی کنید.</p>}
      <p className="text-xs leading-6">با انتشار، این پاسخ در دسترس عضو قرار می‌گیرد. اگر جمع‌بندی تغییر می‌کند، برای آن نسخهٔ تازه بسازید و مسیر تأیید را طی کنید.</p>
      <details className="text-sm"><summary className="cursor-pointer">پیش‌نمایش پاسخ برای عضو</summary><p className="whitespace-pre-wrap break-words leading-7">{draft.text.trim() || "هنوز متنی ننوشته‌اید."}</p></details>
      <div className="flex flex-wrap gap-3"><button type="submit" className="btn btn-gold !whitespace-normal max-w-full min-w-0 break-words" disabled={!draft.text.trim() || (latest?.version ?? 0) !== draft.baseVersion}>انتشار {draft.baseVersion ? "نسخهٔ تازهٔ پاسخ" : "پاسخ"} برای عضو</button><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" onClick={() => { setDraft(null); onCancel?.(); }}>انصراف از ویرایش پاسخ</button></div>
    </fieldset></form>}
  </article>;
}

const readOnlyLabels: Record<ReplyReadOnlyReason, string> = {
  not_owner: "پاسخ‌گویی توسط آرش انجام می‌شود.", revoked: "دسترسی مشاور لغو شده؛ تاریخچه برای عضو محفوظ است.",
  unpublished: "این نسخه هنوز برای عضو منتشر نشده است.", withdrawn: "این نسخه پس گرفته شده؛ پاسخ تازه روی آن منتشر نمی‌شود.",
  superseded: "نسخهٔ تازه‌تری وجود دارد؛ ابتدا آن نسخه را بررسی کنید.", expired: "موعد بازبینی رسیده؛ ابتدا جمع‌بندی را بازبینی کنید.",
  basis_changed: "اطلاعات مالی مبنا تغییر کرده؛ ابتدا جمع‌بندی را بازبینی کنید.", research_changed: "پژوهش مبنا تغییر کرده؛ ابتدا جمع‌بندی را بازبینی کنید.",
};
export function SessionReplies({ data, feedback, sessionVersion, advisor, locked, onCommand, onDirty, onCancel }: {
  data: ReplyRead; feedback: ConsultationAction[]; sessionVersion: number; advisor: boolean; locked: boolean;
  onCommand?: (command: ReplyCommand) => Promise<boolean>; onDirty: () => void; onCancel?: () => void;
}) {
  const questions = feedback.filter(item => item.sessionId === data.sessionId && item.status === "question");
  if (data.replies.some(reply => !questions.some(question => question.id === reply.questionId))) return <p role="alert">پاسخ با پرسش‌های این نسخه تطبیق ندارد؛ پرونده را دوباره بخوانید.</p>;
  return <div className="space-y-3">{advisor && data.readOnlyReason && <p role="status" className="text-sm leading-7">{readOnlyLabels[data.readOnlyReason]}</p>}<RepliesPanel sessionId={data.sessionId} sessionVersion={sessionVersion} questions={questions.map(question => ({ id: question.id, text: question.text ?? "متن پرسش در دسترس نیست", createdAt: question.createdAt, replies: data.replies.filter(reply => reply.questionId === question.id) }))} canReply={advisor && data.canReply} locked={locked} onDirty={onDirty} onCancel={onCancel} onSave={onCommand ? edit => onCommand({ kind: "publish_reply", relationshipId: data.relationshipId, sessionId: data.sessionId, ...edit, purpose: "clarification" }) : undefined} /></div>;
}

export default function RepliesPanel({ sessionId, sessionVersion, questions, canReply, locked, onSave, onDirty, onCancel }: {
  sessionId: string; sessionVersion: number; questions: QuestionView[]; canReply: boolean; locked: boolean;
  onSave?: (edit: ReplyEdit) => Promise<boolean>; onDirty?: () => void; onCancel?: () => void;
}) {
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  return <section className="min-w-0 space-y-3" aria-label={`پرسش و پاسخ نسخهٔ ${toPersianDigits(sessionVersion)}`}>
    <h4 className="font-bold">پرسش و پاسخ همین نسخه</h4>
    {questions.length === 0 ? <p className="text-sm">پرسشی برای این نسخه ثبت نشده است.</p> : questions.map(question => <ReplyQuestion key={`${sessionId}:${question.id}`} question={question} canReply={canReply} locked={locked || (editingQuestion !== null && editingQuestion !== question.id)} onSave={onSave} onDirty={() => { setEditingQuestion(question.id); onDirty?.(); }} onCancel={() => { setEditingQuestion(null); onCancel?.(); }} />)}
  </section>;
}
