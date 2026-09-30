export type WaitlistResult = { ok: true } | { ok: false; message: string };
// An HTTP 200 is not sufficient: only the endpoint's explicit receipt confirms submission.
export async function readWaitlistResponse(
  response: Pick<Response, "ok" | "status" | "json">,
): Promise<WaitlistResult> {
  const data: unknown = await response.json().catch(() => null);
  if (
    response.ok &&
    data &&
    typeof data === "object" &&
    "success" in data &&
    data.success === true
  )
    return { ok: true };
  if (response.status === 409)
    return {
      ok: false,
      message:
        "این ایمیل قبلاً ثبت شده است. برای پیگیری، ایمیل‌های دریافتی خود را بررسی کنید؛ این پیام زمان جلسه را تأیید نمی‌کند.",
    };
  if (response.status === 429)
    return {
      ok: false,
      message:
        "تعداد تلاش‌ها زیاد است. کمی بعد دوباره ارسال کنید؛ ایمیل شما در فرم باقی می‌ماند.",
    };
  return {
    ok: false,
    message:
      "درخواست ثبت نشد. دوباره تلاش کنید؛ ایمیل شما در فرم باقی می‌ماند.",
  };
}
