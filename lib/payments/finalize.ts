// نهایی‌سازیِ پرداخت — **تنها** ماشینِ حالتِ پرداخت در کلِ پروژه.
//
// ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
//
// پیش از این دو مسیرِ پرداخت وجود داشت و هر کدام منطقِ نهایی‌سازیِ خودش را
// داشت. مسیرِ وبینار مستقیماً روی `payments` مقدار می‌نوشت (`status:'verified'`
// که اصلاً در CHECK جدول نیست) و مسیرِ دوره از RPCها می‌رفت. دو پیاده‌سازی
// یعنی دو جا برای فراموش‌کردنِ یک گارد — و دقیقاً همان اتفاق افتاده بود:
// مسیرِ وبینار نه ممیزی می‌نوشت، نه دسترسی می‌داد، نه مبلغ را از رکوردِ خودش
// می‌خواند.
//
// حالا هر دو callback همین یک تابع را صدا می‌زنند. تفاوتِ محصول فقط در
// `kind` و در وجود/نبودِ ثبت‌نامِ وبینار است، نه در منطقِ گذارِ وضعیت.
//
// ── مرزِ مسئولیت ────────────────────────────────────────────────────────────
//
// این ماژول **تصمیم** می‌گیرد؛ نوشتن را به `public.finalize_paid_access`
// می‌سپارد که هر سه اثر (پرداخت · ثبت‌نام · دسترسی) را در یک تراکنش انجام
// می‌دهد. پس «پول گرفته شد ولی دسترسی داده نشد» نمی‌تواند بی‌صدا کامیت شود.
//
// همهٔ وابستگی‌ها از راهِ پورت تزریق می‌شوند (همان الگوی `lib/leads/webhook.ts`)
// تا هر شاخهٔ شکست بدونِ دیتابیس و بدونِ شبکه تست‌پذیر باشد.

import {
  entitlementExpiry,
  entitlementSource,
  type EntitlementKind,
} from "@/lib/entitlements";

// ── قراردادِ داده ────────────────────────────────────────────────────────────

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  ref_id: string | null;
}

export interface RegistrationRow {
  id: string;
  webinar_id: string | null;
  user_id: string;
}

export interface FinalizeRpcInput {
  authority: string;
  refId: string;
  amount: number;
  kind: EntitlementKind;
  source: string;
  expiresAt: string;
  inviteLink: string | null;
  registrationId: string | null;
}

export interface FinalizeRpcResult {
  user_id: string;
  payment_id: string;
  entitlement_id: string;
  expires_at: string;
  already_finalized: boolean;
  registration_id: string | null;
}

/** پورت‌ها — هر تماسِ بیرونی از اینجا می‌گذرد و در تست جایگزین می‌شود. */
export interface FinalizePorts {
  loadPaymentByAuthority(
    authority: string
  ): Promise<{ payment: PaymentRow | null; error: unknown }>;

  loadRegistrationByPaymentId(
    paymentId: string
  ): Promise<{ registration: RegistrationRow | null; error: unknown }>;

  /** verify واقعیِ درگاه. هرگز در تست فراخوانی نمی‌شود — جعل می‌شود. */
  verifyWithGateway(
    authority: string,
    amountToman: number
  ): Promise<{ ok: boolean; refId?: string | null }>;

  failPayment(authority: string): Promise<{ error: unknown }>;

  finalizePaidAccess(
    input: FinalizeRpcInput
  ): Promise<{ result: FinalizeRpcResult | null; error: unknown }>;

  /** ثبتِ ماندگارِ شکست — لاگِ موقت برای «پول گرفته شد» کافی نیست. */
  recordFailure(entry: {
    userId: string | null;
    authority: string;
    stage: FailureStage;
    message: string;
  }): Promise<void>;

  /** فقط مسیرِ دوره/مشاوره: لینکِ دعوتِ تک‌نفرهٔ کانال. */
  createInviteLink?: () => Promise<string | null>;

  now?: () => Date;
}

export type FailureStage =
  | "payment_lookup"
  | "payment_not_found"
  | "registration_lookup"
  | "gateway_verify"
  | "finalize_rpc";

export type FailureReason =
  | "missing_authority"
  | "payment_lookup_failed"
  | "payment_not_found"
  | "registration_lookup_failed"
  | "cancelled"
  | "gateway_verify_failed"
  | "already_failed";

export type FinalizeOutcome =
  /** پرداخت نهایی شد و دسترسی در همان تراکنش ساخته شد. */
  | {
      status: "success";
      alreadyFinalized: boolean;
      refId: string;
      expiresAt: string;
      webinarId: string | null;
      userId: string;
    }
  /**
   * درگاه پرداخت را تأیید کرد ولی نهایی‌سازیِ ما شکست خورد.
   * **هرگز نباید به‌عنوانِ خریدِ کامل نشان داده شود** — پول رفته و دسترسی نیست.
   */
  | {
      status: "access_pending";
      refId: string;
      webinarId: string | null;
      userId: string | null;
      message: string;
    }
  /** پرداخت انجام نشد. */
  | {
      status: "failed";
      reason: FailureReason;
      webinarId: string | null;
    };

export type PaymentProduct = "consulting" | "webinar";

export interface FinalizeArgs {
  /** `Authority` برگشتی از درگاه. */
  authority: string;
  /** `Status` برگشتی از درگاه — هر چیزی جز `OK` یعنی لغو/شکست. */
  gatewayStatus: string;
  product: PaymentProduct;
  ports: FinalizePorts;
}

const KIND_BY_PRODUCT: Record<PaymentProduct, EntitlementKind> = {
  consulting: "consulting",
  webinar: "webinar",
};

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * مسیرِ واحدِ نهایی‌سازی. هر دو callback دقیقاً همین را صدا می‌زنند.
 *
 * ترتیب عمدی است:
 *   ۱. authority → رکوردِ خودمان (مرجعِ کاربر و مبلغ؛ به query اعتماد نمی‌کنیم)
 *   ۲. ثبت‌نام از راهِ `payment_id` پیدا می‌شود، نه از پارامترِ query
 *   ۳. وضعیتِ نهایی‌شده → همان RPC دوباره صدا زده می‌شود (خودترمیم‌شونده)
 *   ۴. لغو/شکستِ درگاه → `fail_payment`
 *   ۵. موفق → یک RPCِ اتمیک: پرداخت + ثبت‌نام + دسترسی
 */
export async function finalizePaidAccess(
  args: FinalizeArgs
): Promise<FinalizeOutcome> {
  const { authority, gatewayStatus, product, ports } = args;
  const kind = KIND_BY_PRODUCT[product];

  if (!authority) {
    return { status: "failed", reason: "missing_authority", webinarId: null };
  }

  // ── ۱. رکوردِ خودمان ─────────────────────────────────────────────────────
  const { payment, error: paymentErr } = await ports.loadPaymentByAuthority(authority);
  if (paymentErr) {
    await ports.recordFailure({
      userId: null,
      authority,
      stage: "payment_lookup",
      message: message(paymentErr),
    });
    return { status: "failed", reason: "payment_lookup_failed", webinarId: null };
  }
  if (!payment) {
    // authorityِ ناشناخته — جعلی، یا مالِ محیطِ دیگری.
    return { status: "failed", reason: "payment_not_found", webinarId: null };
  }

  // ── ۲. ثبت‌نامِ وبینار، فقط از راهِ payment_id ────────────────────────────
  // اگر شناسه از query خوانده می‌شد، یک replay می‌توانست ثبت‌نامِ بی‌ربطِ دیگری
  // را «پرداخت‌شده» کند. باینده همیشه رکوردِ پرداخت است.
  let registration: RegistrationRow | null = null;
  if (product === "webinar") {
    const { registration: reg, error: regErr } =
      await ports.loadRegistrationByPaymentId(payment.id);
    if (regErr) {
      await ports.recordFailure({
        userId: payment.user_id,
        authority,
        stage: "registration_lookup",
        message: message(regErr),
      });
      return {
        status: "failed",
        reason: "registration_lookup_failed",
        webinarId: null,
      };
    }
    registration = reg;
  }
  const webinarId = registration?.webinar_id ?? null;

  // پرداختی که قبلاً ناموفق ثبت شده دیگر قابلِ نهایی‌سازی نیست (گذارِ مجاز
  // فقط pending → paid|failed است).
  if (payment.status === "failed") {
    return { status: "failed", reason: "already_failed", webinarId };
  }

  const now = ports.now ? ports.now() : new Date();
  const expiresAt = entitlementExpiry(kind, now).toISOString();
  const source = entitlementSource(kind, authority);

  // ── ۳. replay: قبلاً نهایی شده ───────────────────────────────────────────
  // درگاه را دوباره صدا نمی‌زنیم، ولی RPC را **می‌زنیم**: idempotent است و اگر
  // ردیفِ دسترسی به هر دلیلی غایب باشد همان‌جا ساخته می‌شود. یعنی باز کردنِ
  // دوبارهٔ لینکِ بازگشت مشکلِ دسترسیِ نیم‌کاره را ترمیم می‌کند، نه تکرار.
  if (payment.status === "paid") {
    const { result, error } = await ports.finalizePaidAccess({
      authority,
      refId: payment.ref_id ?? "",
      amount: payment.amount,
      kind,
      source,
      expiresAt,
      inviteLink: null,
      registrationId: registration?.id ?? null,
    });
    if (error || !result) {
      await ports.recordFailure({
        userId: payment.user_id,
        authority,
        stage: "finalize_rpc",
        message: message(error ?? "نتیجهٔ تهی از نهایی‌سازی"),
      });
      return {
        status: "access_pending",
        refId: payment.ref_id ?? "",
        webinarId,
        userId: payment.user_id,
        message: message(error ?? "نتیجهٔ تهی از نهایی‌سازی"),
      };
    }
    return {
      status: "success",
      alreadyFinalized: true,
      refId: payment.ref_id ?? "",
      expiresAt: result.expires_at,
      webinarId,
      userId: result.user_id,
    };
  }

  // ── ۴. کاربر لغو کرد یا درگاه ناموفق برگشت ───────────────────────────────
  if (gatewayStatus !== "OK") {
    await ports.failPayment(authority);
    return { status: "failed", reason: "cancelled", webinarId };
  }

  // ── ۵. verify با مبلغِ رکوردِ خودمان ─────────────────────────────────────
  // نه با مبلغِ query و نه با قیمتِ فعلیِ محصول (که ممکن است بعد از شروعِ
  // پرداخت تغییر کرده باشد).
  const verify = await ports.verifyWithGateway(authority, payment.amount);
  if (!verify.ok) {
    await ports.failPayment(authority);
    return { status: "failed", reason: "gateway_verify_failed", webinarId };
  }
  const refId = verify.refId ?? "";

  // لینکِ دعوت پیش از نهایی‌سازی ساخته می‌شود تا در همان تراکنش ذخیره شود؛
  // `payments` پس از `paid` دیگر قابلِ ویرایش نیست.
  //
  // فقط مسیرِ دوره/مشاوره لینکِ کانال دارد. شرطِ محصول عمدی است: تکیه بر
  // «فراخواننده پورت را نمی‌دهد» همان وابستگیِ ضمنی است که باعثِ دو مسیر شدنِ
  // این کد شد. اگر روزی کسی پورت را به مسیرِ وبینار هم بدهد، اینجا بی‌اثر است.
  const inviteLink =
    product === "consulting" && ports.createInviteLink
      ? await ports.createInviteLink()
      : null;

  // ── ۶. یک تراکنش: پرداخت + ثبت‌نام + دسترسی ──────────────────────────────
  const { result, error: rpcErr } = await ports.finalizePaidAccess({
    authority,
    refId,
    amount: payment.amount,
    kind,
    source,
    expiresAt,
    inviteLink,
    registrationId: registration?.id ?? null,
  });

  if (rpcErr || !result) {
    // درگاه پول را گرفته ولی سمتِ ما هیچ چیز کامیت نشده. این بدترین حالتِ
    // ممکن است و باید ماندگار ثبت شود تا اپراتور بتواند پیدایش کند.
    const msg = message(rpcErr ?? "نتیجهٔ تهی از نهایی‌سازی");
    await ports.recordFailure({
      userId: payment.user_id,
      authority,
      stage: "finalize_rpc",
      message: msg,
    });
    return {
      status: "access_pending",
      refId,
      webinarId,
      userId: payment.user_id,
      message: msg,
    };
  }

  return {
    status: "success",
    alreadyFinalized: result.already_finalized,
    refId,
    expiresAt: result.expires_at,
    webinarId,
    userId: result.user_id,
  };
}
