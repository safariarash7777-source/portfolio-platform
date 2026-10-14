import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { record, uuid, safeSessionUrl, timestamp } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  const webinarId = req.nextUrl.searchParams.get("webinar_id");
  if (!uuid(webinarId)) return NextResponse.json({ error: "وبینار نامعتبر است." }, { status: 400 });
  const { data, error } = await session.rpc("webinar_access", { p_webinar_id: webinarId });
  if (error || !record(data) || typeof data.allowed !== "boolean") {
    return NextResponse.json({ error: "بررسی دسترسی فعلاً ممکن نیست." }, { status: 503 });
  }
  if (!data.allowed) return NextResponse.json({ access: { allowed: false, reason: "not_available" } });
  const starts = timestamp(data.access_starts_at), ends = timestamp(data.access_ends_at), now = Date.now();
  if (data.webinar_id !== webinarId || data.user_id !== user.id || !safeSessionUrl(data.platform_url) ||
      !starts || !ends || Date.parse(starts) > now || Date.parse(ends) <= now) {
    return NextResponse.json({ error: "پاسخ بررسی دسترسی معتبر نیست." }, { status: 503 });
  }
  return NextResponse.json({ access: { allowed: true, webinar_id: webinarId, platform_url: data.platform_url,
    access_starts_at: starts, access_ends_at: ends } }, { headers: { "Cache-Control": "private, no-store" } });
}
