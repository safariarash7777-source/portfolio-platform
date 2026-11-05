"use client";
import React, { useRef, useState } from "react";
import Field from "./Field";

export interface ActionFeedbackEdit { status: "partial" | "not_done"; text: string; baseVersion: number }
export default function ActionFeedback({ baseVersion, locked, onSave, onBegin, onCancel, writeEnabled = false }: {
  baseVersion: number; locked: boolean; onSave: (edit: ActionFeedbackEdit) => Promise<boolean>; onBegin: () => void; onCancel: () => void;
  writeEnabled?: boolean;
}) {
  const [edit, setEdit] = useState<ActionFeedbackEdit | null>(null), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const stale = Boolean(edit && edit.baseVersion !== baseVersion);
  const begin = (status: ActionFeedbackEdit["status"]) => { if (!writeEnabled || locked || busy.current || edit) return; setEdit({ status, text: "", baseVersion }); setError(""); onBegin(); };
  const save = async () => {
    if (!edit || !writeEnabled || locked || stale || busy.current) return;
    if (!edit.text.trim()) { setError("جزئیات این وضعیت را بنویسید؛ چیزی ثبت نشده است."); return; }
    busy.current = true; setSaving(true); setError("");
    try { if (await onSave({ ...edit, text: edit.text.trim() })) { setEdit(null); onCancel(); } }
    catch { setError("ثبت پیگیری تأیید نشد؛ متن شما حفظ شده است."); }
    finally { busy.current = false; setSaving(false); }
  };
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={!writeEnabled || locked || Boolean(edit) || saving} onClick={() => begin("partial")}>بخشی انجام دادم</button><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={!writeEnabled || locked || Boolean(edit) || saving} onClick={() => begin("not_done")}>انجام ندادم</button></div>
    {edit && <form aria-label="جزئیات پیگیری اقدام" className="min-w-0 space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="text-sm">وضعیت انتخاب‌شده: {edit.status === "partial" ? "بخشی انجام دادم" : "انجام ندادم"}. این ثبت، موجودی مالی شما را تغییر نمی‌دهد.</p>
      {stale && <p role="alert">پیگیری تازه‌تری برای این اقدام خوانده شد؛ متن شما حفظ شده است. برای استفاده از نسخه تازه، این پیش‌نویس را لغو و دوباره باز کنید.</p>}
      {!writeEnabled && <p role="alert">ثبت این وضعیت اکنون فعال نیست؛ متن شما حفظ شده است.</p>}
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={locked || saving || stale} className="min-w-0 space-y-3"><legend className="sr-only">شرح نتیجه اقدام</legend><Field label="چه بخشی انجام شد یا چرا انجام نشد؟" value={edit.text} onChange={text => setEdit({ ...edit, text })} multiline maxLength={2000} /><button type="submit" disabled={!writeEnabled} className="btn btn-gold !whitespace-normal max-w-full min-w-0 break-words">{saving ? "در حال ثبت همان پیگیری…" : "ثبت همین وضعیت اقدام"}</button></fieldset>
      <button type="button" disabled={locked || saving} className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" onClick={() => { if (!busy.current) { setEdit(null); setError(""); onCancel(); } }}>لغو این پیش‌نویس پیگیری</button>
    </form>}
  </div>;
}
