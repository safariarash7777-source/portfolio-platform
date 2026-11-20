"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { accountEntryHref, normalizeReturnPath } from "@/components/account/returnPath";
import { existingPhoneChallenge, matchesVerifiedPhone, verifiedPhoneInput } from "@/lib/auth/phone-entry";
import { toLatinDigits } from "@/lib/format";

export default function PhoneLoginPage() {
  return <Suspense fallback={<p role="status">در حال آماده‌سازی ورود…</p>}><PhoneEntry /></Suspense>;
}

function PhoneEntry() {
  const params = useSearchParams(), returnTo = normalizeReturnPath(params.get("next"));
  const enabled = process.env.NEXT_PUBLIC_PHONE_LOGIN_ENABLED === "true";
  const [phone, setPhone] = useState(""), [code, setCode] = useState(""), [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [message, setMessage] = useState("");
  const locked = useRef(false), uncertain = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!enabled || locked.current || uncertain.current) return;
    let normalized: string;
    try { normalized = verifiedPhoneInput(challenge ?? phone); } catch (error) { setMessage((error as Error).message); return; }
    if (challenge && !/^\d{6}$/.test(toLatinDigits(code))) { setMessage("کد شش‌رقمی پیامک را وارد کنید."); return; }
    locked.current = true; setBusy(true); setMessage("");
    const timer = setTimeout(() => { uncertain.current = true; setUnknown(true); setMessage("نتیجهٔ درخواست هنوز معلوم نیست؛ دوباره ارسال نکنید. برای بررسی نشست، صفحه را تازه کنید."); }, 15000);
    try {
      const client = createClient();
      if (!challenge) {
        const result = await client.auth.signInWithOtp(existingPhoneChallenge(normalized));
        if (uncertain.current) return;
        if (result.error) { setMessage("ارسال کد تأیید نشد. حساب تازه ساخته نشد؛ از مسیر حساب قبلی یا پشتیبانی استفاده کنید."); return; }
        setChallenge(normalized); setMessage("اگر این شماره به حساب تأییدشده متصل باشد، کد ورود برای آن ارسال می‌شود.");
      } else {
        const result = await client.auth.verifyOtp({ phone: normalized, token: toLatinDigits(code), type: "sms" });
        if (uncertain.current) return;
        if (result.error) { setMessage("کد تأیید نشد یا منقضی شده است."); return; }
        const verified = await client.auth.getUser();
        if (uncertain.current) return;
        if (verified.error || !matchesVerifiedPhone(verified.data.user, normalized)) {
          uncertain.current = true; setUnknown(true); setMessage("هویت نشست تأیید نشد؛ برای حفظ پرونده ادامه متوقف شد."); return;
        }
        uncertain.current = true;
        window.location.assign(returnTo);
      }
    } catch { if (!uncertain.current) setMessage("سرویس ورود پاسخ نداد؛ از مسیر حساب قبلی استفاده کنید."); }
    finally { clearTimeout(timer); locked.current = false; setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-lg px-5 py-12" dir="rtl">
    <h1 className="font-display text-2xl font-bold">ورود با موبایل تأییدشده</h1>
    <p className="mt-4 leading-8">شمارهٔ تماس پروفایل به‌تنهایی تأیید موبایل نیست. این مسیر فقط همان حسابی را باز می‌کند که شماره‌اش در سرویس ورود تأیید شده؛ حساب یا پروندهٔ دوم خودکار ساخته نمی‌شود.</p>
    {!enabled ? <p role="status" className="card p-5 my-5">ارسال پیامک در این محیط فعال نیست. اتصال ارائه‌دهندهٔ پیامک و مسیر تأیید عضو جدید هنوز آماده نیست؛ پروندهٔ حساب قبلی از مسیر ورود فعلی در دسترس است.</p> :
      <form className="card p-5 my-5 space-y-4" onSubmit={submit}>
        <label className="block">شماره موبایل<input className="input mt-2" type="tel" autoComplete="tel" dir="ltr" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy || unknown || challenge !== null} /></label>
        {challenge && <label className="block">کد پیامک<input className="input mt-2" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={event => setCode(event.target.value)} disabled={busy || unknown} /></label>}
        {message && <p role="status">{message}</p>}
        <button className="btn btn-gold min-h-11" disabled={busy || unknown}>{busy ? "در حال بررسی…" : challenge ? "تأیید و ورود به پرونده" : "دریافت کد ورود"}</button>
      </form>}
    <Link className="btn btn-outline min-h-11" href={accountEntryHref("/login", returnTo)}>ورود با حساب قبلی</Link>
  </main>;
}
