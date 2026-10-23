export const CONSULTATION_ERRORS = {
  INVALID_INPUT: [400, "درخواست مشاوره معتبر نیست."],
  AUTH_REQUIRED: [401, "برای مشاهده پرونده وارد شوید."],
  FORBIDDEN: [403, "دسترسی به این پرونده یا انجام این اقدام مجاز نیست."],
  ACTOR_CHANGED: [403, "حساب تغییر کرده است؛ درخواست قبلی ارسال نشد."],
  ORIGIN_FORBIDDEN: [403, "مبدأ درخواست مجاز نیست."],
  NOT_FOUND: [404, "پرونده یا نسخه در دسترس نیست."],
  CONFLICT: [409, "نسخه، اطلاعات مبنا یا وضعیت تغییر کرده است؛ متن فعلی را حفظ و پرونده را بازبینی کنید."],
  BODY_TOO_LARGE: [413, "حجم درخواست بیش از حد مجاز است."],
  AUTH_UNAVAILABLE: [503, "بررسی نشست در دسترس نیست."],
  READ_UNAVAILABLE: [503, "پرونده خوانده نشد؛ نبود اطلاعات تأیید نشده است."],
  WRITE_UNAVAILABLE: [503, "نتیجه ثبت مشخص نیست؛ همین تلاش ثبت را بررسی کنید."],
} as const;
export type ConsultationErrorCode = keyof typeof CONSULTATION_ERRORS;
export interface ConsultationError { state: "error"; code: ConsultationErrorCode; error: string }
export function consultationError(code: ConsultationErrorCode): ConsultationError {
  return { state: "error", code, error: CONSULTATION_ERRORS[code][1] };
}
export function parseConsultationError(value: unknown, status: number): ConsultationError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "code,error,state" || v.state !== "error" || typeof v.code !== "string" || !Object.hasOwn(CONSULTATION_ERRORS, v.code)) return null;
  const code = v.code as ConsultationErrorCode;
  return status === CONSULTATION_ERRORS[code][0] && v.error === CONSULTATION_ERRORS[code][1] ? consultationError(code) : null;
}
