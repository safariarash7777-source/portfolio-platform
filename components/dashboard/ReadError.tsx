"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export default function ReadError({ label, code }: { label: string; code?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="card p-4 my-4">
    <p className="text-sm" role="alert">دریافت {label} انجام نشد. پس از بازیابی سرویس دوباره تلاش کنید.</p>
    {code && <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>کد پیگیری: {code}</p>}
    <button type="button" className="btn btn-outline mt-3 min-h-11" aria-label={`تلاش مجدد برای دریافت ${label}`} aria-busy={pending} disabled={pending} onClick={() => {
      if (pending) return;
      startTransition(() => router.refresh());
    }}>تلاش مجدد</button>
    <p role="status" aria-atomic="true" className="text-sm mt-2">{pending ? `در حال بازخوانی ${label}…` : null}</p>
  </div>;
}
