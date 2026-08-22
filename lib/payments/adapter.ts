// اتصالِ پورت‌های `finalize.ts` به Supabase و زرین‌پال.
//
// این تنها لایه‌ای است که واقعاً I/O می‌کند؛ منطقِ تصمیم در `finalize.ts` است و
// آنجا با پورت‌های جعلی تست می‌شود. اگر روزی درگاه عوض شود، فقط همین فایل
// تغییر می‌کند.

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPayment } from "@/lib/zarinpal";
import type {
  FinalizePorts,
  FinalizeRpcResult,
  PaymentRow,
  RegistrationRow,
} from "./finalize";

/**
 * ساختِ پورت‌ها از کلاینتِ **service-role**.
 *
 * ⚠️ حتماً `createAdminClient()`؛ `finalize_paid_access` فقط به `service_role`
 * داده شده و با کلاینتِ کاربر خطای دسترسی می‌دهد — که درست هم هست: کاربر نباید
 * بتواند برای خودش دسترسی بسازد.
 */
export function createSupabaseFinalizePorts(
  admin: SupabaseClient,
  options: { createInviteLink?: () => Promise<string | null> } = {}
): FinalizePorts {
  return {
    async loadPaymentByAuthority(authority) {
      const { data, error } = await admin
        .from("payments")
        .select("id, user_id, amount, status, ref_id, purpose")
        .eq("authority", authority)
        .maybeSingle();
      return { payment: (data as PaymentRow | null) ?? null, error };
    },

    async loadRegistrationByPaymentId(paymentId) {
      const { data, error } = await admin
        .from("webinar_registrations")
        .select("id, webinar_id, user_id")
        .eq("payment_id", paymentId)
        .maybeSingle();
      return { registration: (data as RegistrationRow | null) ?? null, error };
    },

    async verifyWithGateway(authority, amountToman) {
      const result = await verifyPayment(authority, amountToman);
      return { ok: result.ok, refId: result.refId ?? null };
    },

    async failPayment(authority) {
      const { error } = await admin.rpc("fail_payment", { p_authority: authority });
      if (error) console.error("fail_payment error:", error.message);
      return { error };
    },

    async finalizePaidAccess(input) {
      // نه `p_source` و نه `p_expires_at` فرستاده نمی‌شوند: هر دو را SQL
      // می‌سازد. مدت از `entitlement_durations` می‌آید تا کلاینت نتواند
      // دسترسیِ طولانی‌تر بخرد.
      const { data, error } = await admin.rpc("finalize_paid_access", {
        p_authority: input.authority,
        p_ref_id: input.refId,
        p_amount: input.amount,
        p_kind: input.kind,
        p_invite_link: input.inviteLink,
        p_registration_id: input.registrationId,
      });
      return { result: (data as FinalizeRpcResult | null) ?? null, error };
    },

    async recordFailure(entry) {
      // چرا در `audit_log` و نه فقط `console.error`: لاگِ Vercel چند روز بعد
      // پاک می‌شود. اگر مشتری پول داده و دسترسی نگرفته، باید ماه‌ها بعد هم
      // بتوان همان authority را پیدا کرد.
      //
      // ⚠️ نتیجه **برگردانده** می‌شود. پیش از این خطای درج داخلِ catch بلعیده
      // می‌شد، یعنی «شکست ثبت شد» و «ثبتِ شکست هم شکست خورد» یکسان به‌نظر
      // می‌رسیدند — دقیقاً همان چیزی که این ثبت برای جلوگیری از آن هست.
      console.error(
        `payment finalize failed [${entry.stage}] authority=${entry.authority}: ${entry.message}`
      );
      try {
        const { error } = await admin.from("audit_log").insert({
          actor_id: entry.userId,
          action: "payment.finalize_failed",
          entity: "payment",
          target_user_id: entry.userId,
          after: {
            authority: entry.authority,
            stage: entry.stage,
            // پیامِ خطای Supabase مقدارِ سکرت ندارد و برای تشخیص لازم است.
            message: entry.message.slice(0, 500),
          },
        });
        if (error) {
          console.error("audit_log insert failed while recording payment failure:", error.message);
          return { persisted: false, error };
        }
        return { persisted: true, error: null };
      } catch (e) {
        // آخرین حلقهٔ زنجیره؛ نباید مسیرِ کاربر را بشکنیم، ولی باید صادق
        // بمانیم که هیچ ردی ثبت نشد.
        console.error("audit_log unreachable while recording payment failure:", e);
        return { persisted: false, error: e };
      }
    },

    createInviteLink: options.createInviteLink,
  };
}
