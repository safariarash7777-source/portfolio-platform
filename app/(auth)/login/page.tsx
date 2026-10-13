"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";
import { accountEntryHref, normalizeReturnPath } from "@/components/account/returnPath";

// The SDK may persist a session before resolving. Keep this document's lease
// until it settles, including across unmounts; a UI deadline is not cancellation.
let signInPending = false;
// A successful full navigation remains terminal until this document unloads.
let signInRedirecting = false;
const pendingMessage = "پاسخ ورود هنوز مشخص نشده است. پایان انتظار این صفحه درخواست را لغو نمی‌کند؛ ممکن است ورود بعداً انجام شود. برای بررسی وضعیت و ادامه، صفحهٔ ورود را دوباره بارگذاری کنید.";

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
  const [redirecting, setRedirecting] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const recovery = useRef(false);
  const mounted = useRef(false);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    if (signInRedirecting) {
      setLoading(true);
      setRedirecting(true);
    } else if (signInPending) {
      recovery.current = true;
      setRecoveryRequired(true);
      setServerError(pendingMessage);
    }
    return () => {
      mounted.current = false;
      if (waitTimer.current !== null) clearTimeout(waitTimer.current);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mounted.current || signInPending || signInRedirecting || recovery.current) return;
    let hasError = false;

    if (!email.trim()) { setEmailError("آدرس ایمیل الزامی است"); hasError = true; }
    else setEmailError("");

    if (!password) { setPasswordError("رمز عبور الزامی است"); hasError = true; }
    else setPasswordError("");

    if (hasError) return;

    signInPending = true;
    setLoading(true);
    setServerError("");
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      recovery.current = true;
      setRecoveryRequired(true);
      setLoading(false);
      setServerError(pendingMessage);
    }, 8000);
    waitTimer.current = timer;
    try {
      const supabase = createClient();
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if (!mounted.current || recovery.current) return;
      if(error){setServerError(supabaseError(error.message));return;}
      // Full navigation has a visible network result and avoids a silently stalled
      // App Router transition while the protected middleware is unavailable.
      window.location.assign(returnTo);
      signInRedirecting = true;
      setRedirecting(true);
    } catch {
      if (mounted.current && !recovery.current) setServerError("خطا در اتصال. لطفاً دوباره تلاش کنید");
    } finally {
      signInPending = false;
      clearTimeout(timer);
      waitTimer.current = null;
      if (mounted.current && !recovery.current && !signInRedirecting) setLoading(false);
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
          {searchParams.get('error')==='auth_callback_failed' && <p role="alert" className="text-sm leading-7 mb-5" style={{color:'var(--danger)'}}>تأیید ورود کامل نشد. دوباره از صفحهٔ ورود اقدام کنید؛ اگر مشکل ادامه داشت، با پشتیبانی تماس بگیرید.</p>}
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
              <Link href="/forgot-password" className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                رمز عبور را فراموش کرده‌اید؟
              </Link>
            </div>

            {serverError && (
              <div
                role="alert"
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
              disabled={loading || recoveryRequired}
            >
              {redirecting ? (
                "در حال انتقال..."
              ) : loading ? (
                "در حال ورود..."
              ) : (
                <>
                  <LogIn size={16} />
                  ورود
                </>
              )}
            </button>
            {recoveryRequired && (
              <button
                type="button"
                className="btn w-full"
                onClick={() => {
                  mounted.current = false;
                  if (waitTimer.current !== null) clearTimeout(waitTimer.current);
                  window.location.assign(accountEntryHref("/login", returnTo));
                }}
              >
                بارگذاری دوبارهٔ صفحهٔ ورود
              </button>
            )}
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
                  </div>
      </div>
    </div>
  );
}
