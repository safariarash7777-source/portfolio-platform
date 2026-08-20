// شروعِ پرداختِ وبینار — تصمیم‌گیریِ خالص، جدا از Next.js.
//
// ── چرا جدا ─────────────────────────────────────────────────────────────────
//
// `app/api/webinars/payment/route.ts` کلاینت‌های Supabase و زرین‌پال را خودش
// می‌سازد، پس شاخه‌های شکستش بدونِ شبکه و بدونِ دیتابیس قابلِ اجرا نبودند.
// دقیقاً همان شاخه‌ها بودند که Command Center دو بار رویشان ایراد گرفت:
// اتصالِ بازنویسی‌شده، مبلغِ مورد اعتماد، و ممیزیِ بررسی‌نشده.
//
// اینجا همان الگوی `lib/payments/finalize.ts` تکرار می‌شود: هر تماسِ بیرونی
// یک پورت است و در تست جایگزین می‌شود.

import { decideWebinarRetry, type ExistingPayment } from "./webinar-retry";

export interface RegistrationRow {
  id: string;
  webinar_id: string | null;
  payment_status: string | null;
  payment_id: string | null;
  webinarTitle: string | null;
  priceToman: number | null;
}

export type StartFailureStage =
  | "registration_lookup"
  | "payment_lookup"
  | "gateway"
  | "create_link";

export interface StartPorts {
  loadRegistration(
    registrationId: string,
    userId: string
  ): Promise<{ registration: RegistrationRow | null; error: unknown }>;

  loadPayment(
    paymentId: string
  ): Promise<{ payment: ExistingPayment | null; error: unknown }>;

  /** `null` یعنی تنظیم خوانده نشد؛ تصمیم‌گیر مقدارِ محافظه‌کارانه می‌گیرد. */
  loadStaleMinutes(): Promise<number | null>;

  requestGatewayPayment(
    amountToman: number,
    description: string
  ): Promise<{ ok: boolean; authority?: string | null; startPayUrl?: string | null; message?: string }>;

  createWebinarPayment(input: {
    registrationId: string;
    authority: string;
    expectedAmount: number;
    replace: boolean;
  }): Promise<{ paymentId: string | null; error: unknown }>;

  /**
   * ثبتِ ماندگارِ «authorityِ ساخته‌شده که هرگز استفاده نمی‌شود».
   * **باید** بگوید خودش موفق شد یا نه — وگرنه ادعای «شواهد ثبت شد» بی‌پایه است.
   */
  recordLinkFailure(entry: {
    userId: string;
    registrationId: string;
    webinarId: string | null;
    authority: string;
    reason: string;
  }): Promise<{ persisted: boolean; error: unknown }>;

  resumeUrl(authority: string): string;

  now?: () => Date;
}

export type StartOutcome =
  | { status: "created"; paymentUrl: string }
  /** پرداختِ در جریان — همان لینکِ اول، بدونِ ساختِ authorityِ تازه. */
  | { status: "resumed"; paymentUrl: string }
  | {
      status: "rejected";
      reason: string;
      message: string;
      httpStatus: 400 | 404 | 409 | 503;
      retryAfterMinutes?: number;
    }
  | { status: "gateway_failed"; message: string }
  /**
   * درگاه authority داد ولی ثبتش شکست خورد.
   * `evidenceRecorded=false` یعنی حتی ردِ ممیزی هم نوشته نشد — رابط نباید
   * وانمود کند کسی خبر دارد.
   */
  | { status: "link_failed"; evidenceRecorded: boolean; message: string };

/** وقتی تنظیمِ پنجره خوانده نشد. سخت‌گیرانه‌تر، نه شل‌تر. */
export const FALLBACK_STALE_MINUTES = 60;

export interface StartArgs {
  userId: string;
  registrationId: string;
  replaceRequested: boolean;
  callbackPath: string;
  ports: StartPorts;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export async function startWebinarPayment(args: StartArgs): Promise<StartOutcome> {
  const { userId, registrationId, replaceRequested, ports } = args;

  const { registration, error: regErr } = await ports.loadRegistration(registrationId, userId);
  if (regErr || !registration) {
    return {
      status: "rejected",
      reason: "registration_not_found",
      message: "ثبت‌نام یافت نشد.",
      httpStatus: 404,
    };
  }

  if (!registration.priceToman || registration.priceToman <= 0) {
    return {
      status: "rejected",
      reason: "free_webinar",
      message: "این وبینار رایگان است و نیاز به پرداخت ندارد.",
      httpStatus: 400,
    };
  }

  // ── پرداختِ متصلِ فعلی ────────────────────────────────────────────────────
  let existing: ExistingPayment | null = null;
  if (registration.payment_id) {
    const { payment, error } = await ports.loadPayment(registration.payment_id);
    if (error) {
      // نمی‌دانیم لینکِ زنده‌ای هست یا نه. ساختنِ لینکِ تازه در این حالت یعنی
      // احتمالِ یتیم‌کردنِ لینکِ قبلی — پس نمی‌سازیم.
      return {
        status: "rejected",
        reason: "payment_lookup_failed",
        message: "وضعیتِ پرداختِ قبلی خوانده نشد. لطفاً دوباره تلاش کنید.",
        httpStatus: 503,
      };
    }
    existing = payment;
  }

  const staleMinutes = (await ports.loadStaleMinutes()) ?? FALLBACK_STALE_MINUTES;

  const decision = decideWebinarRetry({
    registrationPaymentStatus: registration.payment_status,
    existingPayment: existing,
    replaceRequested,
    staleMinutes,
    now: ports.now?.() ?? new Date(),
  });

  if (decision.action === "reject") {
    return {
      status: "rejected",
      reason: decision.reason,
      message: decision.message,
      httpStatus: decision.reason === "already_paid" ? 400 : 409,
      ...(decision.retryAfterMinutes ? { retryAfterMinutes: decision.retryAfterMinutes } : {}),
    };
  }

  if (decision.action === "resume") {
    return { status: "resumed", paymentUrl: ports.resumeUrl(decision.authority) };
  }

  // ── از اینجا به بعد authorityِ تازه لازم است ─────────────────────────────
  const gateway = await ports.requestGatewayPayment(
    registration.priceToman,
    `ثبت‌نام وبینار: ${registration.webinarTitle ?? ""}`
  );

  if (!gateway.ok || !gateway.authority || !gateway.startPayUrl) {
    return {
      status: "gateway_failed",
      message: gateway.message || "خطا در اتصال به درگاه پرداخت.",
    };
  }

  const { paymentId, error: linkErr } = await ports.createWebinarPayment({
    registrationId: registration.id,
    authority: gateway.authority,
    expectedAmount: registration.priceToman,
    replace: decision.action === "replace",
  });

  if (linkErr || !paymentId) {
    const recorded = await ports.recordLinkFailure({
      userId,
      registrationId: registration.id,
      webinarId: registration.webinar_id,
      authority: gateway.authority,
      reason: message(linkErr ?? "پاسخِ تهی").slice(0, 500),
    });

    // ⚠️ در هر دو حالت هیچ URLی برنمی‌گردد. شکستِ ممیزی این را عوض نمی‌کند —
    // فقط باعث می‌شود صادقانه بگوییم ردی باقی نمانده.
    return {
      status: "link_failed",
      evidenceRecorded: recorded.persisted,
      message: "خطا در ثبت پرداخت. لطفاً دوباره تلاش کنید.",
    };
  }

  return { status: "created", paymentUrl: gateway.startPayUrl };
}
