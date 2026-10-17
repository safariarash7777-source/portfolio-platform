import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMediaLayout, mediaLayoutInput } from "@/lib/media/layout-setting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function adminSession() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401, headers }) };
  const { data: profile, error } = await session.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) return { error: NextResponse.json({ error: "بررسی دسترسی ممکن نشد." }, { status: 503, headers }) };
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers }) };
  return { session };
}

export async function GET() {
  const auth = await adminSession();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.session.rpc("get_media_layout");
  if (error || !isMediaLayout(data)) return NextResponse.json({ error: "خواندن تنظیم ظاهر رسانه ممکن نشد." }, { status: 503, headers });
  return NextResponse.json({ media_layout: data }, { headers });
}

export async function PATCH(req: NextRequest) {
  const auth = await adminSession();
  if ("error" in auth) return auth.error;
  const layout = mediaLayoutInput(await req.json().catch(() => null));
  if (layout === null) return NextResponse.json({ error: "یکی از سه طرح معتبر را انتخاب کنید." }, { status: 400, headers });
  // The session-bound RPC repeats the authoritative profiles.role check inside
  // the same transaction that appends the audit/version row.
  const { data, error } = await auth.session.rpc("set_media_layout", { p_media_layout: layout });
  if (error || data !== layout) return NextResponse.json({ error: "ذخیره تأیید نشد؛ تنظیم قبلی را دوباره بررسی کنید." }, { status: 503, headers });
  return NextResponse.json({ media_layout: data }, { headers });
}
