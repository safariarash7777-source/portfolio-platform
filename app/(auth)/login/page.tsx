"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";
import { accountEntryHref, normalizeReturnPath } from "@/components/account/returnPath";
import {authMessage} from '@/lib/auth/mobile';
import {withDeadline} from '@/lib/deadline';

function supabaseError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "ایمیل یا رمز عبور اشتباه است";
  if (msg.includes("Email not confirmed")) return "لطفاً ابتدا ایمیل خود را تأیید کنید";
  if (msg.includes("Too many requests")) return "تعداد تلاش‌ها زیاد است. لطفاً چند دقیقه صبر کنید";
  return "خطا در ورود. لطفاً دوباره تلاش کنید";
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback label="در حال آماده‌سازی ورود..." />}>
      <LoginPageContent />
    </Suspense>
  );
}

function AuthPageFallback({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)", color: "var(--text-3)" }}>
      <p className="text-sm" role="status">{label}</p>
    </div>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const returnTo = normalizeReturnPath(searchParams.get("next"), "/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let hasError = false;

    if (!email.trim()) { setEmailError("آدرس ایمیل الزامی است"); hasError = true; }
    else setEmailError("");

    if (!password) { setPasswordError("رمز عبور الزامی است"); hasError = true; }
    else setPasswordError("");

    if (hasError) return;

    setLoading(true);
    setServerError("");
    try {
      const {error}=await withDeadline(signal =>
        createClient(signal).auth.signInWithPassword({email,password}), 8000);
      if(error){setServerError(authMessage(error) || supabaseError(error.message));return;}
      // Full navigation has a visible network result and avoids a silently stalled
      // App Router transition while the protected middleware is unavailable.
      window.location.assign(returnTo);
    } catch {
      setServerError("خطا در اتصال. لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo href="/" />
          </div>
          <span className="eyebrow">ورود به پلتفرم</span>
          <h1
            className="font-display text-2xl font-bold mt-2"
            style={{ color: "var(--navy-deep)" }}
          >
            خوش آمدید
          </h1>
        </div>

        <div className="card-elevated p-8">
          <p className="text-sm leading-7 mb-5">این مسیر با رمز خود سایت کار می‌کند. رمز Google یا Gmail جای رمز سایت نیست.</p>
          {searchParams.get('error')==='auth_unavailable' && <p role="alert" className="text-sm leading-7 mb-5" style={{color:'var(--danger)'}}>بررسی نشست در سرور پاسخ نداد. رمز را تغییر ندهید؛ کمی بعد دوباره ورود را امتحان کنید.</p>}
          {searchParams.get('error')==='auth_callback_failed' && <p role="alert" className="text-sm leading-7 mb-5" style={{color:'var(--danger)'}}>لینک ورود معتبر نیست یا قبلاً استفاده شده است. دوباره ورود را آغاز کنید.</p>}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
                آدرس ایمیل
                <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="login-email"
                type="email"
                className="input"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                disabled={loading}
                dir="ltr"
              />
              {emailError && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>{emailError}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
                رمز عبور
                <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  className="input"
                  placeholder="رمز عبور خود را وارد کنید"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  disabled={loading}
                  dir="ltr"
                  style={{ paddingLeft: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute left-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
                  style={{ color: "var(--text-3)" }}
                  aria-label={showPass ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>{passwordError}</p>
              )}
            </div>

            <div className="text-start -mt-2">
              <Link href={'/forgot-password?next='+encodeURIComponent(returnTo)} className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                رمز عبور را فراموش کرده‌اید؟
              </Link>
            </div>

            {serverError && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(185,28,28,0.08)",
                  border: "1px solid rgba(185,28,28,0.25)",
                  color: "var(--danger)",
                }}
              >
                {serverError}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-gold w-full"
              disabled={loading}
            >
              {loading ? (
                "در حال ورود..."
              ) : (
                <>
                  <LogIn size={16} />
                  ورود
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
            حساب کاربری ندارید؟{" "}
            <Link
              href={accountEntryHref("/register", returnTo)}
              className="font-bold"
              style={{ color: "var(--navy)" }}
            >
              ثبت‌نام کنید
            </Link>
          </div>
          <Link className="btn btn-outline w-full mt-5" href={accountEntryHref('/login/mobile',returnTo)}>وضعیت ورود موبایلی</Link>
        </div>
      </div>
    </div>
  );
}
