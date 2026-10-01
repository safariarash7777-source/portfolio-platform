"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { accountEntryHref, normalizeReturnPath } from "@/components/account/returnPath";
import { readMemberProfile, type ProfileRead } from "@/lib/member/profile";
import type { MemberRequest } from "@/lib/member/http";
export default function ProfileStatus({ cohortId, request }: { cohortId?: string; request?: MemberRequest }) {
  const [result, setResult] = useState<ProfileRead | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { let current = true; setResult(null); readMemberProfile(request).then(data => { if (current) setResult(data); }); return () => { current = false; }; }, [request, refresh]);
  const returnTo = cohortId ? `/dashboard?cohort=${cohortId}` : "/dashboard";
  return <section className="card space-y-3 p-5" aria-labelledby="member-profile-title">
    <h2 id="member-profile-title" className="font-display text-xl font-bold">پروفایل خصوصی من</h2>
    {!result ? <p role="status">در حال بررسی وضعیت پروفایل…</p> : result.state === "not_connected" ? <p>مسیر پروفایل مشترک هنوز به این نسخه متصل نیست. می‌توانید از خانه، دوره و سوابق شخصی استفاده کنید.</p> : result.state === "unavailable" ? <p role="alert">وضعیت پروفایل اکنون قابل بررسی نیست؛ این خطا به معنی ناقص‌بودن اطلاعات شما نیست.</p> : result.state === "sign_in_required" ? <Link className="inline-flex min-h-12 items-center underline" href={accountEntryHref("/login", returnTo)}>ورود و بازگشت به خانهٔ من</Link> : <>
      <p>{result.state === "recorded" ? `پروفایل ذخیره شده است؛ نسخهٔ ${result.version?.toLocaleString("fa-IR")}.` : "پروفایل هنوز ثبت نشده است؛ می‌توانید در مسیر مشترک حساب، آن را تکمیل کنید."}</p>
      <p className="text-sm">{result.phoneVerified ? "شمارهٔ همراه تأیید شده است؛ تطبیق رسمی هویت و شماره همچنان در انتظار بررسی است." : "شمارهٔ همراه هنوز تأیید نشده است؛ تطبیق رسمی هویت و شماره در انتظار بررسی است."}</p>
      <Link className="inline-flex min-h-12 items-center underline" href={`/account/mobile?next=${encodeURIComponent(normalizeReturnPath(returnTo))}`}>بازکردن مسیر مشترک پروفایل و شمارهٔ همراه</Link>
    </>}
    {result?.state === "unavailable" || result?.state === "not_connected" ? <button className="btn btn-outline min-h-12" onClick={() => setRefresh(n => n + 1)}>بررسی دوبارهٔ پروفایل</button> : null}
    <p className="text-sm">پروفایل، پاسخ نیازسنجی و مجوز دوره وضعیت‌های جدا دارند؛ این بخش دریافت خدمت را به تکمیل فرم تازه قفل نمی‌کند.</p>
  </section>;
}
