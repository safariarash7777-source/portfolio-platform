"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, ArrowRight, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("یک آدرس ایمیل معتبر وارد کنید");
      return;
    }
    setEmailError("");
    setServerError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Always show success even if the email isn't registered — avoids leaking
      // which emails have accounts (account-enumeration protection).
      if (error && !error.message.includes("rate")) {
        console.error("resetPasswordForEmail:", error.message);
      }
      if (error && error.message.toLowerCase().includes("rate")) {
        setServerError("تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.");
        return;
      }
      setSent(true);
    } catch {
      setServerError("خطا در اتصال. لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo href="/" />
          </div>
          <span className="eyebrow">بازیابی رمز عبور</span>
          <h1 className="font-display text-2xl font-bold mt-2" style={{ color: "var(--navy-deep)" }}>
            رمز عبور خود را فراموش کرده‌اید؟
          </h1>
        </div>

        <div className="card-elevated p-8">
          {sent ? (
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
                style={{ width: 64, height: 64, background: "rgba(21,128,61,0.1)", color: "var(--success)" }}
              >
                <CheckCircle size={32} />
              </div>
              <h2 className="font-display text-lg font-bold mb-2" style={{ color: "var(--navy-deep)" }}>
                ایمیل بازیابی ارسال شد
              </h2>
              <p className="text-sm leading-7 mb-6" style={{ color: "var(--text-2)" }}>
                اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی رمز عبور برایتان ارسال شد. صندوق
                ورودی (و پوشه‌ی اسپم) خود را بررسی کنید.
              </p>
              <Link href="/login" className="btn btn-outline w-full">
                <ArrowRight size={16} />
                بازگشت به ورود
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                ایمیل حساب خود را وارد کنید تا لینک بازنشانی رمز عبور برایتان ارسال شود.
              </p>

              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
                  آدرس ایمیل
                  <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  className="input"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  disabled={loading}
                  dir="ltr"
                />
                {emailError && <p className="text-xs" style={{ color: "var(--danger)" }}>{emailError}</p>}
              </div>

              {serverError && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)", color: "var(--danger)" }}
                >
                  {serverError}
                </div>
              )}

              <button type="submit" className="btn btn-gold w-full" disabled={loading}>
                {loading ? "در حال ارسال..." : (<><Mail size={16} />ارسال لینک بازیابی</>)}
              </button>

              <div className="text-center text-sm" style={{ color: "var(--text-3)" }}>
                رمز خود را به یاد آوردید؟{" "}
                <Link href="/login" className="font-bold" style={{ color: "var(--navy)" }}>
                  ورود
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
