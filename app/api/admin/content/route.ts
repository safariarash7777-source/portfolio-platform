import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatform, isKind, detectPlatform } from "@/lib/content-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST  /api/admin/content — افزودنِ محتوا به هابِ محتوا (فقط ادمین).
// PATCH /api/admin/content — پنهان‌سازیِ (حذفِ نرمِ) یک محتوا (فقط ادمین).
// هر دو تابعِ SECURITY DEFINER خودشان admin را دوباره چک می‌کنند و audit می‌زنند.

async function requireAdmin(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 }) };
  }
  return { supabase };
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin(req);
  if (error) return error;

  let body: { platform?: unknown; kind?: unknown; content_url?: unknown; title?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  const url = typeof body.content_url === "string" ? body.content_url.trim() : "";
  if (!url) return NextResponse.json({ error: "لینکِ محتوا الزامی است." }, { status: 400 });

  // پلتفرم: اگر معتبر نبود، از روی لینک تشخیص بده.
  const platform = isPlatform(body.platform) ? body.platform : detectPlatform(url);
  if (!platform) {
    return NextResponse.json(
      { error: "شبکه مشخص نیست. لینکِ تلگرام، اینستاگرام یا توییتر بدهید یا شبکه را انتخاب کنید." },
      { status: 400 }
    );
  }
  const kind = isKind(body.kind) ? body.kind : "post";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  const { data: id, error: rpcError } = await supabase!.rpc("add_content_item", {
    p_platform: platform,
    p_kind: kind,
    p_content_url: url,
    p_title: title || null,
    p_description: description || null,
  });
  if (rpcError || !id) {
    console.error("add_content_item error:", rpcError?.message);
    return NextResponse.json({ error: rpcError?.message ?? "خطا در افزودن." }, { status: 500 });
  }

  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const { supabase, error } = await requireAdmin(req);
  if (error) return error;

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "شناسهٔ محتوا الزامی است." }, { status: 400 });

  const { error: rpcError } = await supabase!.rpc("hide_content_item", { p_id: id });
  if (rpcError) {
    console.error("hide_content_item error:", rpcError?.message);
    return NextResponse.json({ error: rpcError?.message ?? "خطا در پنهان‌سازی." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
