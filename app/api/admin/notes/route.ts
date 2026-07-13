import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/notes — انتشارِ یادداشت روزانهٔ بازار.
// یادداشت‌ها عمومی‌اند (فیدِ /notes)؛ انتشار فقط با نقشِ admin. تابعِ
// SECURITY DEFINER خودش admin را دوباره چک می‌کند و audit می‌زند.
const KNOWN_TAGS = ["طلا", "بورس", "ارز", "کریپتو", "صندوق"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  }

  let body: { title?: string; body_md?: string; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const bodyMd = (body.body_md ?? "").trim();
  if (!title || !bodyMd) {
    return NextResponse.json({ error: "عنوان و متنِ یادداشت الزامی است." }, { status: 400 });
  }

  // برچسب‌ها: فقط از واژگانِ شناخته‌شده، یکتا، حداکثر ۴ تا.
  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.filter((t): t is string => typeof t === "string" && KNOWN_TAGS.includes(t)))].slice(0, 4)
    : [];

  const { data: id, error } = await supabase.rpc("publish_market_note", {
    p_title: title,
    p_body_md: bodyMd,
    p_tags: tags,
  });
  if (error || !id) {
    console.error("publish_market_note error:", error?.message);
    return NextResponse.json({ error: error?.message ?? "خطا در انتشار." }, { status: 500 });
  }

  return NextResponse.json({ id });
}
