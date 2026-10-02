"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, UserPlus, CheckCircle } from "lucide-react";
import Logo from "@/components/ui/Logo";
import { accountEntryHref, normalizeReturnPath } from "@/components/account/returnPath";

interface FormFields {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

const EMPTY: FormFields = {
  full_name: "",
  email: "",
  password: "",
  confirm_password: "",
};

function validate(f: FormFields): Partial<Record<keyof FormFields, string>> {
  const e: Partial<Record<keyof FormFields, string>> = {};
  if (!f.full_name.trim()) e.full_name = "نام و نام خانوادگی الزامی است";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "آدرس ایمیل معتبر نیست";
  if (f.password.length < 12 || f.password.length>128) e.password = "رمز باید بین ۱۲ تا ۱۲۸ نویسه باشد";
  if (f.password !== f.confirm_password) e.confirm_password = "رمز عبور و تکرار آن یکسان نیستند";
  return e;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback label="در حال آماده‌سازی ثبت‌نام..." />}>
      <RegisterPageContent />
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

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const returnTo = normalizeReturnPath(searchParams.get("next"), "/dashboard");
  const [fields, setFields] = useState<FormFields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const set = (k: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate(fields);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setServerError("");
    try {
      const response=await fetch('/api/auth/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        action:'signup',email:fields.email.trim(),password:fields.password,fullName:fields.full_name.trim(),next:returnTo,
      })});
      const data=await response.json();
      if(!response.ok || data.status!=='confirmation_requested'){setServerError(data.error??'ثبت‌نام اکنون انجام نشد. اطلاعات فرم حفظ شده است.');return;}

      setSuccess(true);
    } catch {
      setServerError("خطا در اتصال. لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-5"
        style={{ background: "var(--bg)" }}
      >
        <div className="card-elevated p-10 w-full max-w-md text-center">
          <div
            className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
            style={{ width: 64, height: 64, background: "rgba(21,128,61,0.1)", color: "var(--success)" }}
          >
            <CheckCircle size={32} />
          </div>
          <h2 className="font-display text-2xl font-bold mb-3" style={{ color: "var(--navy-deep)" }}>
            درخواست تأیید حساب ثبت شد
          </h2>
          <p className="text-sm leading-7 mb-6" style={{ color: "var(--text-2)" }}>
            اگر ثبت‌نام پذیرفته شده باشد و سرویس ایمیل آماده باشد، لینک تأیید دریافت می‌کنید. صندوق ورودی و پوشهٔ اسپم را بررسی کنید. ایجاد حساب، عضویت در دوره نیست.
          </p>
          <Link href={accountEntryHref("/login", returnTo)} className="btn btn-gold w-full">
            رفتن به صفحه ورود
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-10"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo href="/" />
          </div>
          <span className="eyebrow">ایجاد حساب کاربری</span>
          <h1
            className="font-display text-2xl font-bold mt-2"
            style={{ color: "var(--navy-deep)" }}
          >
            ثبت‌نام در پلتفرم
          </h1>
        </div>

        <div className="card-elevated p-8">
          <p className="text-sm leading-7 mb-5" style={{color:'var(--text-2)'}}>حساب با تأیید ایمیل ساخته می‌شود. اطلاعات هویتی خصوصی و اتصال شماره از مسیر حساب تأییدشده تکمیل می‌شوند.</p>
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* full_name */}
            <Field
              label="نام و نام خانوادگی"
              required
              error={errors.full_name}
            >
              <input
                type="text"
                className="input"
                placeholder="علی رضایی"
                value={fields.full_name}
                autoComplete="name"
                maxLength={120}
                onChange={set("full_name")}
                disabled={loading}
              />
            </Field>

            {/* email */}
            <Field label="آدرس ایمیل" required error={errors.email}>
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                className="input"
                placeholder="email@example.com"
                value={fields.email}
                onChange={set("email")}
                disabled={loading}
                dir="ltr"
              />
            </Field>

            {/* password */}
            <Field label="رمز عبور" required error={errors.password}>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={128}
                  className="input"
                  placeholder="حداقل ۱۲ نویسه"
                  value={fields.password}
                  onChange={set("password")}
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
            </Field>

            {/* confirm_password */}
            <Field label="تکرار رمز عبور" required error={errors.confirm_password}>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={128}
                  className="input"
                  placeholder="رمز عبور را تکرار کنید"
                  value={fields.confirm_password}
                  onChange={set("confirm_password")}
                  disabled={loading}
                  dir="ltr"
                  style={{ paddingLeft: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute left-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
                  style={{ color: "var(--text-3)" }}
                  aria-label={showConfirm ? "پنهان کردن تکرار رمز" : "نمایش تکرار رمز"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

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
              disabled={loading}
            >
              {loading ? (
                "در حال ثبت‌نام..."
              ) : (
                <>
                  <UserPlus size={16} />
                  ایجاد حساب کاربری
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <Link
              href={accountEntryHref("/login", returnTo)}
              className="font-bold"
              style={{ color: "var(--navy)" }}
            >
              وارد شوید
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="block text-sm font-bold mb-1.5" style={{ color: "var(--text-2)" }}>
          {label}
          {required && (
            <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
          )}
        </span>
        {children}
      </label>
      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
