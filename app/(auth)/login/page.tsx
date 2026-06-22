"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

function supabaseError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "ایمیل یا رمز عبور اشتباه است";
  if (msg.includes("Email not confirmed")) return "لطفاً ابتدا ایمیل خود را تأیید کنید";
  if (msg.includes("Too many requests")) return "تعداد تلاش‌ها زیاد است. لطفاً چند دقیقه صبر کنید";
  return "خطا در ورود. لطفاً دوباره تلاش کنید";
}

export default function LoginPage() {
  const router = useRouter();
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
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setServerError(supabaseError(error.message)); return; }
      router.push("/dashboard");
      router.refresh();
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
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-3)" }}
                  tabIndex={-1}
                  aria-label={showPass ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>{passwordError}</p>
              )}
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
              href="/register"
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
