"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, UserPlus, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

interface FormFields {
  full_name: string;
  national_id: string;
  phone: string;
  email: string;
  password: string;
  confirm_password: string;
}

const EMPTY: FormFields = {
  full_name: "",
  national_id: "",
  phone: "",
  email: "",
  password: "",
  confirm_password: "",
};

function validate(f: FormFields): Partial<Record<keyof FormFields, string>> {
  const e: Partial<Record<keyof FormFields, string>> = {};
  if (!f.full_name.trim()) e.full_name = "نام و نام خانوادگی الزامی است";
  if (!/^\d{10}$/.test(f.national_id)) e.national_id = "کد ملی باید ۱۰ رقم باشد";
  if (!/^09\d{9}$/.test(f.phone)) e.phone = "شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "آدرس ایمیل معتبر نیست";
  if (f.password.length < 8) e.password = "رمز عبور باید حداقل ۸ کاراکتر باشد";
  if (f.password !== f.confirm_password) e.confirm_password = "رمز عبور و تکرار آن یکسان نیستند";
  return e;
}

function supabaseError(msg: string): string {
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "این ایمیل قبلاً ثبت‌نام شده است";
  if (msg.includes("weak password")) return "رمز عبور بسیار ضعیف است";
  return "خطایی رخ داد. لطفاً دوباره تلاش کنید";
}

export default function RegisterPage() {
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
      const supabase = createClient();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: fields.email,
        password: fields.password,
        options: { data: { role: "user", full_name: fields.full_name } },
      });

      if (signUpError) { setServerError(supabaseError(signUpError.message)); return; }

      const userId = data.user?.id;
      if (userId) {
        const { error: profileError } = await supabase.from("profiles").insert({
          id: userId,
          full_name: fields.full_name,
          national_id: fields.national_id,
          phone: fields.phone,
          email: fields.email,
          role: "user",
        });
        if (profileError) console.error("Profile insert error:", profileError.message);
      }

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
            ثبت‌نام موفق
          </h2>
          <p className="text-sm leading-7 mb-6" style={{ color: "var(--text-2)" }}>
            ایمیل تأیید ارسال شد. لطفاً صندوق ورودی خود را بررسی کرده و ایمیل خود را تأیید کنید.
          </p>
          <Link href="/login" className="btn btn-gold w-full">
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
                onChange={set("full_name")}
                disabled={loading}
              />
            </Field>

            {/* national_id */}
            <Field label="کد ملی" required error={errors.national_id}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                className="input"
                placeholder="۱۲۳۴۵۶۷۸۹۰"
                value={fields.national_id}
                onChange={set("national_id")}
                disabled={loading}
                dir="ltr"
              />
            </Field>

            {/* phone */}
            <Field label="شماره موبایل" required error={errors.phone}>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={11}
                className="input"
                placeholder="09121234567"
                value={fields.phone}
                onChange={set("phone")}
                disabled={loading}
                dir="ltr"
              />
            </Field>

            {/* email */}
            <Field label="آدرس ایمیل" required error={errors.email}>
              <input
                type="email"
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
                  className="input"
                  placeholder="حداقل ۸ کاراکتر"
                  value={fields.password}
                  onChange={set("password")}
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
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-3)" }}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

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
              href="/login"
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
      <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
        {label}
        {required && (
          <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
