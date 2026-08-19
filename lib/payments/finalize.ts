// نهایی‌سازیِ پرداخت — **تنها** ماشینِ حالتِ پرداخت در کلِ پروژه.
//
// ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
//
// پیش از این دو مسیرِ پرداخت وجود داشت و هر کدام منطقِ نهایی‌سازیِ خودش را
// داشت. دو پیاده‌سازی یعنی دو جا برای فراموش‌کردنِ یک گارد — و دقیقاً همان
// اتفاق افتاده بود.
//
// ── بازنگریِ Command Center: نوعِ محصول ──────────────────────────────────────
//
// نسخهٔ اولِ همین فایل یک نقصِ جدی داشت: `product` را **فراخواننده** تعیین
// می‌کرد. پس یک authorityِ پرداخت‌شده می‌توانست از هر دو callback رد شود و دو
// دسترسیِ متفاوت بسازد.
//
// حالا `product` فقط برای **تشخیصِ callbackِ اشتباه** استفاده می‌شود: مرجعِ
// واقعی ستونِ `payments.purpose` است که در لحظهٔ ساختِ پرداخت ثبت شده. هم اینجا
// و هم داخلِ `finalize_paid_access` بررسی می‌شود — دو لایه، چون این همان جایی
// است که یک بار اشتباه کردیم.

import type { PaidProduct } from "@/lib/entitlements";

// ── قراردادِ داده ────────────────────────────────────────────────────────────

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  ref_id: string | null;
  /** نوعِ محصول، تغییرناپذیر، از لحظهٔ ساختِ پرداخت. */
  purpose: PaidProduct | null;
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
  /** همان `payments.purpose`؛ SQL دوباره تطبیقش می‌دهد. */
  kind: PaidProduct;
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
  purpose: PaidProduct;
}

/** پورت‌ها — هر تماسِ بیرونی از اینجا می‌گذرد و در تست جایگزین می‌شود. */
export interface FinalizePorts {
  loadPaymentByAuthority(
    authority: string
  ): Promise<{ payment: PaymentRow | null; error: unknown }>;

  loadRegistrationByPaymentId(
    paymentId: string
  ): Promise<{ registration: RegistrationRow | null; error: unknown }>;

  verifyWithGateway(
    authority: string,
    amountToman: number
  ): Promise<{ ok: boolean; refId?: string | null }>;

  /** برخلافِ نسخهٔ قبل، نتیجه‌اش **بررسی می‌شود**. */
  failPayment(authority: string): Promise<{ error: unknown }>;

  finalizePaidAccess(
    input: FinalizeRpcInput
  ): Promise<{ result: FinalizeRpcResult | null; error: unknown }>;

  /**
   * ثبتِ ماندگارِ شکست. **باید** بگوید خودش موفق شده یا نه؛ اگر ثبتِ شکست هم
   * شکست بخورد، هیچ ردی باقی نمی‌ماند و ما باید بدانیم.
   */
  recordFailure(entry: {
    userId: string | null;
    authority: string;
    stage: FailureStage;
    message: string;
  }): Promise<{ persisted: boolean; error: unknown }>;

  createInviteLink?: () => Promise<string | null>;

  now?: () => Date;
}

export type FailureStage =
  | "payment_lookup"
  | "payment_not_found"
  | "product_mismatch"
  | "registration_lookup"
  | "registration_missing"
  | "gateway_verify"
  | "fail_payment"
  | "finalize_rpc";

export type FailureReason =
  | "missing_authority"
  | "payment_lookup_failed"
  | "payment_not_found"
  | "product_mismatch"
  | "registration_lookup_failed"
  | "registration_missing"
  | "cancelled"
  | "gateway_verify_failed"
  | "already_failed";

export type FinalizeOutcome =
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
   * **هرگز نباید به‌عنوانِ خریدِ کامل نشان داده شود.**
   *
   * `failureRecorded` می‌گوید آیا ردِ ماندگاری ثبت شد یا نه — اگر نه، رابط
   * نباید وعدهٔ «به‌زودی خودکار درست می‌شود» بدهد، چون هیچ‌کس خبر ندارد.
   */
  | {
      status: "access_pending";
      refId: string;
      webinarId: string | null;
      userId: string | null;
      message: string;
      failureRecorded: boolean;
    }
  | {
      status: "failed";
      reason: FailureReason;
      webinarId: string | null;
    };

export interface FinalizeArgs {
  authority: string;
  gatewayStatus: string;
  /** محصولی که **این** callback مسئولش است. برای ردِ callbackِ اشتباه. */
  product: PaidProduct;
  ports: FinalizePorts;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export async function finalizePaidAccess(
  args: FinalizeArgs
): Promise<FinalizeOutcome> {
  const { authority, gatewayStatus, product, ports } = args;

  if (!authority) {
    return { status: "failed", reason: "missing_authority", webinarId: null };
  }

  // ── ۱. رکوردِ خودمان ─────────────────────────────────────────────────────
  const { payment, error: paymentErr } = await ports.loadPaymentByAuthority(authority);
  if (paymentErr) {
    await ports.recordFailure({
      userId: null, authority, stage: "payment_lookup", message: message(paymentErr),
    });
    return { status: "failed", reason: "payment_lookup_failed", webinarId: null };
  }
  if (!payment) {
    return { status: "failed", reason: "payment_not_found", webinarId: null };
  }

  // ── ۲. نوعِ محصول: مرجع، ردیفِ پرداخت است ────────────────────────────────
  // callbackِ مشاوره نباید بتواند پرداختِ وبینار را نهایی کند و برعکس.
  if (payment.purpose !== product) {
    await ports.recordFailure({
      userId: payment.user_id,
      authority,
      stage: "product_mismatch",
      message: `callbackِ «${product}» برای پرداختی با نوعِ «${payment.purpose ?? "نامشخص"}» صدا زده شد`,
    });
    return { status: "failed", reason: "product_mismatch", webinarId: null };
  }

  // ── ۳. ثبت‌نامِ وبینار — الزامی، نه اختیاری ───────────────────────────────
  let registration: RegistrationRow | null = null;
  if (product === "webinar") {
    const { registration: reg, error: regErr } =
      await ports.loadRegistrationByPaymentId(payment.id);
    if (regErr) {
      await ports.recordFailure({
        userId: payment.user_id, authority,
        stage: "registration_lookup", message: message(regErr),
      });
      return { status: "failed", reason: "registration_lookup_failed", webinarId: null };
    }
    if (!reg) {
      // پیش از این اینجا «موفق» برمی‌گشت و دسترسی می‌داد. پرداختِ وبیناری که
      // به هیچ ثبت‌نامی وصل نیست یعنی زنجیره جایی پاره شده؛ نهایی‌سازی باید
      // متوقف شود تا کسی دستی رسیدگی کند.
      await ports.recordFailure({
        userId: payment.user_id, authority,
        stage: "registration_missing",
        message: "پرداختِ وبینار هیچ ثبت‌نامِ متصلی ندارد",
      });
      return { status: "failed", reason: "registration_missing", webinarId: null };
    }
    if (reg.user_id !== payment.user_id) {
      await ports.recordFailure({
        userId: payment.user_id, authority,
        stage: "registration_missing",
        message: "ثبت‌نامِ متصل به این پرداخت متعلقِ کاربرِ دیگری است",
      });
      return { status: "failed", reason: "registration_missing", webinarId: null };
    }
    registration = reg;
  }
  const webinarId = registration?.webinar_id ?? null;

  if (payment.status === "failed") {
    return { status: "failed", reason: "already_failed", webinarId };
  }

  const rpcInput = (refId: string, inviteLink: string | null): FinalizeRpcInput => ({
    authority,
    refId,
    amount: payment.amount,
    kind: product,
    inviteLink,
    registrationId: registration?.id ?? null,
  });

  const pending = async (
    refId: string,
    err: unknown
  ): Promise<FinalizeOutcome> => {
    const msg = message(err);
    const rec = await ports.recordFailure({
      userId: payment.user_id, authority, stage: "finalize_rpc", message: msg,
    });
    return {
      status: "access_pending",
      refId, webinarId, userId: payment.user_id,
      message: msg,
      failureRecorded: rec.persisted,
    };
  };

  // ── ۴. replay: قبلاً نهایی شده ───────────────────────────────────────────
  if (payment.status === "paid") {
    const { result, error } = await ports.finalizePaidAccess(
      rpcInput(payment.ref_id ?? "", null)
    );
    if (error || !result) return pending(payment.ref_id ?? "", error ?? "نتیجهٔ تهی");
    return {
      status: "success",
      alreadyFinalized: true,
      refId: payment.ref_id ?? "",
      expiresAt: result.expires_at,
      webinarId,
      userId: result.user_id,
    };
  }

  // ── ۵. لغو یا شکستِ درگاه ────────────────────────────────────────────────
  if (gatewayStatus !== "OK") {
    const { error } = await ports.failPayment(authority);
    if (error) {
      // پرداخت روی `pending` مانده و هیچ‌کس خبر ندارد — این باید دیده شود.
      await ports.recordFailure({
        userId: payment.user_id, authority,
        stage: "fail_payment", message: message(error),
      });
    }
    return { status: "failed", reason: "cancelled", webinarId };
  }

  const verify = await ports.verifyWithGateway(authority, payment.amount);
  if (!verify.ok) {
    const { error } = await ports.failPayment(authority);
    if (error) {
      await ports.recordFailure({
        userId: payment.user_id, authority,
        stage: "fail_payment", message: message(error),
      });
    }
    return { status: "failed", reason: "gateway_verify_failed", webinarId };
  }
  const refId = verify.refId ?? "";

  const inviteLink =
    product === "consulting" && ports.createInviteLink
      ? await ports.createInviteLink()
      : null;

  // ── ۶. یک تراکنش: پرداخت + ثبت‌نام + دسترسی ──────────────────────────────
  const { result, error: rpcErr } = await ports.finalizePaidAccess(
    rpcInput(refId, inviteLink)
  );
  if (rpcErr || !result) return pending(refId, rpcErr ?? "نتیجهٔ تهی");

  return {
    status: "success",
    alreadyFinalized: result.already_finalized,
    refId,
    expiresAt: result.expires_at,
    webinarId,
    userId: result.user_id,
  };
}
