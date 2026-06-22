"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPass, setShowPass] = useState(false);
  // null = checking, true/false = has recovery session or not
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (password.length < 8) errs.password = "رمز عبور باید حداقل ۸ کاراکتر باشد";
    if (password !== confirm) errs.confirm = "رمز عبور و تکرار آن یکسان نیستند";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setErrors({});
    setServerError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setServerError(
          error.message.toLowerCase().includes("session")
            ? "لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید."
            : "خطا در تغییر رمز عبور. لطفاً دوباره تلاش کنید"
        );
        return;
      }
      setDone(true);
      setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 1800);
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
          <span className="eyebrow">تنظیم رمز جدید</span>
          <h1 className="font-display text-2xl font-bold mt-2" style={{ color: "var(--navy-deep)" }}>
            رمز عبور تازه‌ای انتخاب کنید
          </h1>
        </div>

        <div className="card-elevated p-8">
          {done ? (
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
                style={{ width: 64, height: 64, background: "rgba(21,128,61,0.1)", color: "var(--success)" }}
              >
                <CheckCircle size={32} />
              </div>
              <h2 className="font-display text-lg font-bold mb-2" style={{ color: "var(--navy-deep)" }}>
                رمز عبور با موفقیت تغییر کرد
              </h2>
              <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                در حال انتقال به داشبورد...
              </p>
            </div>
          ) : hasSession === false ? (
            <div className="text-center">
              <p className="text-sm leading-7 mb-6" style={{ color: "var(--text-2)" }}>
                این صفحه فقط از طریق لینکِ بازیابیِ ایمیل قابل دسترسی است و لینک شما نامعتبر یا منقضی
                شده. لطفاً دوباره درخواست بازیابی دهید.
              </p>
              <Link href="/forgot-password" className="btn btn-gold w-full">
                درخواست لینک جدید
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
                  رمز عبور جدید
                  <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPass ? "text" : "password"}
                    className="input"
                    placeholder="حداقل ۸ کاراکتر"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }}
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
                {errors.password && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.password}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
                  تکرار رمز عبور
                  <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  id="confirm-password"
                  type={showPass ? "text" : "password"}
                  className="input"
                  placeholder="رمز عبور را تکرار کنید"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }}
                  disabled={loading}
                  dir="ltr"
                />
                {errors.confirm && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.confirm}</p>}
              </div>

              {serverError && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)", color: "var(--danger)" }}
                >
                  {serverError}
                </div>
              )}

              <button type="submit" className="btn btn-gold w-full" disabled={loading || hasSession === null}>
                {loading ? "در حال ذخیره..." : (<><KeyRound size={16} />ذخیره رمز جدید</>)}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
