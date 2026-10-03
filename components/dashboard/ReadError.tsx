"use client";
import { useRouter } from "next/navigation";
export default function ReadError({ label, code }: { label: string; code?: string }) {
  const router = useRouter();
  return <div className="card p-4 my-4" role="alert">
    <p className="text-sm">دریافت {label} انجام نشد. پس از بازیابی سرویس دوباره تلاش کنید.</p>
    {code && <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>کد پیگیری: {code}</p>}
    <button type="button" className="btn btn-outline mt-3 min-h-11" onClick={() => router.refresh()}>تلاش مجدد</button>
  </div>;
}
