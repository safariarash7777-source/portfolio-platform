import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { record } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await createClient();
  // Proposal RPC projects metadata only; the old whole-row public RLS policy must be removed too.
  const { data, error } = await session.rpc("list_public_webinars");
  if (error || !Array.isArray(data)) return NextResponse.json({ error: "فهرست وبینارها هنوز آماده نیست." }, { status: 503 });
  const fields = ["id", "title", "description", "starts_at", "ends_at", "registration_open", "max_capacity",
    "price_toman", "platform", "status", "created_at", "registered_count", "access_enabled", "access_starts_at", "access_ends_at"];
  const webinars = data.filter(record).map(row => Object.fromEntries(fields.map(key => [key, row[key]])));
  return NextResponse.json({ webinars, countsAvailable: true });
}
