import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayment, startPayUrl } from "@/lib/zarinpal";
import {
  startWebinarPayment,
  type RegistrationRow,
  type StartPorts,
} from "@/lib/payments/start-webinar-payment";
import type { ExistingPayment } from "@/lib/payments/webinar-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** callbackِ اختصاصیِ وبینار — جدا از جریانِ دوره/مشاوره. */
const WEBINAR_CALLBACK_PATH = "/api/webinars/payment/callback";

// POST /api/webinars/payment — شروع (یا از سرگیریِ) پرداخت برای ثبت‌نام وبینار.
//
// بدنه: { registration_id: string, replace?: boolean }
//
// تصمیم‌گیری در `lib/payments/start-webinar-payment.ts` است؛ اینجا فقط
// آداپتور است. دلیلش این است که شاخه‌های شکست — اتصالِ موجود، مبلغِ ناهماهنگ،
// شکستِ ثبتِ ممیزی — بدونِ شبکه و دیتابیس قابلِ تست باشند.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const registrationId = body?.registration_id;

  if (!registrationId) {
    return NextResponse.json({ error: "registration_id الزامی است." }, { status: 400 });
  }

  const admin = createAdminClient();

  const ports: StartPorts = {
    async loadRegistration(id, userId) {
      const { data, error } = await admin
        .from("webinar_registrations")
        .select(
          "id, webinar_id, user_id, payment_status, payment_id, webinars(title, price_toman)"
        )
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) return { registration: null, error };

      const row = data as unknown as {
        id: string;
        webinar_id: string | null;
        payment_status: string | null;
        payment_id: string | null;
        webinars: { title: string; price_toman: number } | null;
      };

      const registration: RegistrationRow = {
        id: row.id,
        webinar_id: row.webinar_id,
        payment_status: row.payment_status,
        payment_id: row.payment_id,
        webinarTitle: row.webinars?.title ?? null,
        priceToman: row.webinars?.price_toman ?? null,
      };
      return { registration, error: null };
    },

    async loadPayment(paymentId) {
      const { data, error } = await admin
        .from("payments")
        .select("id, status, authority, created_at")
        .eq("id", paymentId)
        .maybeSingle();
      return { payment: (data as ExistingPayment | null) ?? null, error };
    },

    async loadResumeHintMinutes() {
      const { data } = await admin
        .from("payment_settings")
        .select("value")
        .eq("key", "webinar_resume_hint_minutes")
        .maybeSingle();
      return data?.value ?? null;
    },

    async requestGatewayPayment(amount, description) {
      const r = await requestPayment(amount, description, WEBINAR_CALLBACK_PATH);
      return {
        ok: r.ok,
        authority: r.authority ?? null,
        startPayUrl: r.startPayUrl ?? null,
        message: r.message,
      };
    },

    async createWebinarPayment(input) {
      // کلاینتِ **کاربر**، چون تابع به `auth.uid()` تکیه دارد و مالکیت را
      // خودش بررسی می‌کند. `expectedAmount` مبلغ را تعیین نمی‌کند — تابع
      // قیمت را از ردیفِ قفل‌شدهٔ وبینار می‌خواند و فقط تطبیق می‌دهد.
      const { data, error } = await supabase.rpc("create_webinar_payment", {
        p_registration_id: input.registrationId,
        p_authority: input.authority,
        p_expected_amount: input.expectedAmount,
      });
      return { paymentId: (data as string | null) ?? null, error };
    },

    async recordLinkFailure(entry) {
      const { error } = await admin.from("audit_log").insert({
        actor_id: entry.userId,
        action: "payment.link_failed",
        entity: "payment",
        target_user_id: entry.userId,
        after: {
          registration_id: entry.registrationId,
          webinar_id: entry.webinarId,
          authority: entry.authority,
          reason: entry.reason,
        },
      });
      if (error) {
        // تنها ردی که باقی می‌ماند همین خط است، پس باید صریح باشد.
        console.error(
          "payment.link_failed audit insert FAILED — no durable trace exists:",
          error.message
        );
      }
      return { persisted: !error, error };
    },

    resumeUrl: startPayUrl,
  };

  const outcome = await startWebinarPayment({
    userId: user.id,
    registrationId,
    callbackPath: WEBINAR_CALLBACK_PATH,
    ports,
  });

  switch (outcome.status) {
    case "created":
      return NextResponse.json({ payment_url: outcome.paymentUrl });

    case "resumed":
      // ⚠️ هیچ تراکنشِ تازه‌ای ساخته نشد. همان لینکِ اول، پس نمی‌تواند یتیم شود.
      return NextResponse.json({
        payment_url: outcome.paymentUrl,
        resumed: true,
        offer_help: outcome.offerHelp,
      });

    case "rejected":
      return NextResponse.json(
        {
          error: outcome.message,
          reason: outcome.reason,
        },
        { status: outcome.httpStatus }
      );

    case "gateway_failed":
      return NextResponse.json({ error: outcome.message }, { status: 502 });

    case "link_failed":
      return NextResponse.json(
        { error: outcome.message, evidence_recorded: outcome.evidenceRecorded },
        { status: 500 }
      );
  }
}
