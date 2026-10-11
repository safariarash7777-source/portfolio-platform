import { normalizeReturnPath } from "./returnPath";

type SignupError = { code?: string; status?: number; message?: string };
type SignupInput = {
  email: string;
  password: string;
  options: { emailRedirectTo: string; data: { full_name: string; national_id: string; phone: string } };
};
type SignupResponse = {
  data: { user: unknown | null; session: unknown | null };
  error: SignupError | null;
};
export type SignupOutcome = { status: "confirmation" | "signed-in" } | { status: "error"; message: string };

export function signupErrorMessage(error: SignupError): string {
  const message = (error.message ?? "").toLowerCase();
  if (error.code === "signup_disabled" || message.includes("signups not allowed"))
    return "ثبت‌نام در حال حاضر غیرفعال است. لطفاً بعداً دوباره بررسی کنید.";
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")
    return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
  if (error.code === "email_address_not_authorized" || message.includes("error sending confirmation email"))
    return "ارسال درخواست تأیید ایمیل انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.";
  if (error.code === "weak_password" || message.includes("weak password"))
    return "رمز عبور بسیار ضعیف است";
  // Do not disclose whether an account exists. Auth may return an obfuscated user.
  return "ثبت‌نام انجام نشد. لطفاً اطلاعات را بررسی کرده و دوباره تلاش کنید.";
}

/** Canonical SDK owns the session. No profile update, role or entitlement grant here. */
export async function signupAndReturn(input: {
  signUp: (values: SignupInput) => Promise<SignupResponse>;
  values: SignupInput;
  returnTo: string;
  navigate: (path: string) => void;
}): Promise<SignupOutcome> {
  try {
    const { data, error } = await input.signUp(input.values);
    if (error) return { status: "error", message: signupErrorMessage(error) };
    if (!data.user) return { status: "error", message: "پاسخ ثبت‌نام کامل نیست. لطفاً دوباره تلاش کنید." };
    if (data.session) {
      input.navigate(normalizeReturnPath(input.returnTo, "/dashboard"));
      return { status: "signed-in" };
    }
    return { status: "confirmation" };
  } catch {
    return { status: "error", message: "خطا در اتصال. لطفاً دوباره تلاش کنید" };
  }
}
