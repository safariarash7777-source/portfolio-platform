import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/leads/webhook
 * Receives leads from the miniapp (fire-and-forget webhook).
 * Validates X-Webhook-Secret header, then inserts into public.leads.
 */
export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret = process.env.PLATFORM_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { source, name, phone, topic, message, preferred_date, preferred_time, telegram_username, telegram_id } = body as {
    source?: string;
    name?: string;
    phone?: string;
    topic?: string;
    message?: string;
    preferred_date?: string;
    preferred_time?: string;
    telegram_username?: string;
    telegram_id?: string;
  };

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Insert into leads using service role
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("leads").insert({
    source: source || "miniapp",
    name,
    phone: phone || null,
    topic: topic || null,
    message: message || null,
    preferred_date: preferred_date || null,
    preferred_time: preferred_time || null,
    telegram_username: telegram_username || null,
    telegram_id: telegram_id || null,
    status: "new",
  });

  if (error) {
    console.error("[Leads webhook] Insert error:", error);
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
