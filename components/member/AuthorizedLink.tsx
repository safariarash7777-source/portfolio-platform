"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { safeExternalUrl } from "@/lib/member/home";
import { memberData, memberErrorStatus, type MemberRequest } from "@/lib/member/http";
import { accountEntryHref } from "@/components/account/returnPath";
interface LinkReceipt { url?: string; joinPath?: string; expiresInSeconds?: number }
function isReceipt(v: unknown): v is LinkReceipt {
  if (!v || typeof v !== "object") return false;
  const r = v as LinkReceipt;
  return (r.expiresInSeconds === undefined || typeof r.expiresInSeconds === "number" && Number.isFinite(r.expiresInSeconds) && r.expiresInSeconds > 0) && (!!safeExternalUrl(r.url) || typeof r.joinPath === "string" && /^\/api\/cohorts\/[0-9a-f-]+\/webinars\/[0-9a-f-]+\/join$/i.test(r.joinPath));
}
export default function AuthorizedLink({ path, label, cohortId, request }: { path: string; label: string; cohortId: string; request?: MemberRequest }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<number | null>(null), [receipt, setReceipt] = useState<LinkReceipt | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!receipt?.expiresInSeconds) return;
    const timer = setTimeout(() => { setReceipt(null); setExpired(true); }, receipt.expiresInSeconds * 1000);
    return () => clearTimeout(timer);
  }, [receipt]);
  async function getLink() {
    setBusy(true); setStatus(null); setReceipt(null); setExpired(false);
    try {
      let r = await memberData(path, isReceipt, request);
      if (r.joinPath) {
        if (!r.joinPath.startsWith(`/api/cohorts/${cohortId}/webinars/`)) throw new Error("Foreign cohort link");
        r = await memberData(r.joinPath, isReceipt, request);
      }
      if (!safeExternalUrl(r.url)) throw new Error("Missing link");
      setReceipt(r);
    } catch (e) { setStatus(memberErrorStatus(e)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2"><button className="btn btn-outline min-h-12" disabled={busy} onClick={() => void getLink()}>{busy ? "در حال بررسی دسترسی…" : label}</button>
    {receipt?.url ? <div><a href={safeExternalUrl(receipt.url)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center underline">بازکردن در پنجرهٔ تازه — بیرون از این صفحه</a><p className="text-sm">{receipt.expiresInSeconds ? "این لینک فایل کوتاه‌عمر است؛ اگر باز نشد، لینک تازه دریافت کنید." : "وبینار در سرویس برگزارکننده باز می‌شود. مدت اعتبار لینک تابع همان سرویس است."}</p></div> : null}
    {expired ? <p role="status">مهلت اعلام‌شدهٔ لینک تمام شد؛ برای دریافت لینک تازه، دسترسی دوباره بررسی می‌شود.</p> : null}
    {status ? <p role="alert">{status === 401 ? "برای دریافت لینک دوباره وارد شوید." : status === 403 ? "این منبع برای حساب و دورهٔ انتخاب‌شده مجاز نیست." : status === 409 ? "زمان ورود به وبینار باز نیست؛ برنامه را بررسی کنید." : "دریافت لینک انجام نشد؛ دوباره تلاش کنید."}</p> : null}
    {status === 401 ? <Link href={accountEntryHref("/login", `/dashboard?cohort=${cohortId}`)} className="inline-flex min-h-12 items-center underline">ورود و بازگشت به دوره</Link> : null}
  </div>;
}
