"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createFinancialEditor, type FinancialEditor, type FinancialEditorKind } from "./financialEditor";

const EditorContext = createContext<FinancialEditor | null>(null);

export default function FinancialEditors({ children }: { children: ReactNode }) {
  const [, render] = useState(0);
  const [editor] = useState(() => createFinancialEditor(() => render(value => value + 1)));
  // A new context value makes both workbenches render the synchronous lease.
  return <EditorContext.Provider value={{ ...editor }}>
    {editor.active && <p role="status" className="card p-4 text-sm leading-7">
      {editor.navigating ? "ثبت انجام شد؛ در حال بازکردن نسخهٔ ثبت‌شده هستیم. خلاصه و سابقهٔ این صفحه هنوز مربوط به نسخهٔ قبلی‌اند." : "هر بار یک فرم را ویرایش کنید. برای ویرایش فرم دیگر، ابتدا این فرم را ذخیره کنید یا با «لغو تغییرات» پیش‌نویس آن را کنار بگذارید."}
    </p>}
    {children}
  </EditorContext.Provider>;
}

export function useFinancialEditor(kind: FinancialEditorKind) {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("Financial workbenches require FinancialEditors");
  return {
    locked: editor.navigating || editor.active !== null && editor.active !== kind,
    active: editor.active === kind,
    awaitingReadback: editor.active === kind && editor.navigating,
    acquire: () => editor.acquire(kind),
    release: () => editor.release(kind),
    navigate: (target?: string) => editor.navigate(kind, target),
    settle: (target: string | null) => editor.settle(kind, target),
  };
}
