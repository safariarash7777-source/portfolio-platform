import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleLeadWebhook,
  INVALID_JSON,
  type LeadRecord,
  type LeadStore,
} from "@/lib/leads/webhook";

/**
 * POST /api/leads/webhook
 * لیدِ ارسالیِ Mini App را می‌گیرد و در `public.leads` می‌نویسد.
 *
 * این فایل عمداً نازک است: احراز هویت، اعتبارسنجی و منطقِ تکراری در
 * `lib/leads/webhook.ts` است تا تست‌پذیر بماند.
 *
 * فراخوانندهٔ فعلی (Mini App) این را fire-and-forget صدا می‌زند و پاسخ را
 * نمی‌خواند؛ بنابراین وضعیتِ HTTP تنها ردِ قابلِ مشاهدهٔ شکست است — هیچ مسیری
 * نباید بی‌صدا موفق اعلام شود.
 */
export async function POST(req: NextRequest) {
  let body: unknown = INVALID_JSON;
  try {
    body = await req.json();
  } catch {
    body = INVALID_JSON;
  }

  // کلاینتِ service-role فقط وقتی ساخته می‌شود که واقعاً به آن می‌رسیم؛ ساختِ
  // زودهنگام روی محیطِ بدونِ کلید، درخواستِ ۴۰۱ را به ۵۰۰ تبدیل می‌کرد.
  let store: LeadStore | null = null;
  const getStore = (): LeadStore => {
    if (store) return store;
    const supabase = createAdminClient();
    store = {
      async findRecentDuplicate({ phone, topic, sinceIso }) {
        let query = supabase
          .from("leads")
          .select("id")
          .eq("phone", phone)
          .gte("created_at", sinceIso)
          .limit(1);
        query = topic === null ? query.is("topic", null) : query.eq("topic", topic);
        const { data, error } = await query;
        if (error) return { found: false, error };
        return { found: (data?.length ?? 0) > 0 };
      },
      async insertLead(lead: LeadRecord) {
        const { error } = await supabase.from("leads").insert(lead);
        return { error };
      },
    };
    return store;
  };

  const result = await handleLeadWebhook({
    providedSecret: req.headers.get("x-webhook-secret"),
    body,
    env: process.env,
    // با getter تزریق می‌شود تا ساختِ کلاینت تنبل بماند.
    store: {
      findRecentDuplicate: (q) => getStore().findRecentDuplicate(q),
      insertLead: (l) => getStore().insertLead(l),
    },
    log: (message, meta) => (meta === undefined ? console.error(message) : console.error(message, meta)),
  });

  return NextResponse.json(result.body, { status: result.status });
}
