import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseDeskPreferenceReceipt,
  parseDeskPreferenceWrite,
} from "@/lib/desk/preferences";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const failure = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers });
async function gate() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return { error: failure("نشست معتبر لازم است.", 401) };
  const { data: profile, error: roleError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (roleError)
    return { error: failure("خواندن دسترسی مدیریت ممکن نشد.", 503) };
  if (profile?.role !== "admin")
    return { error: failure("دسترسی مدیریت لازم است.", 403) };
  return { client };
}
export async function GET() {
  try {
    const auth = await gate();
    if (auth.error) return auth.error;
    const { data, error } = await auth.client!.rpc(
      "get_admin_desk_preferences",
    );
    if (error)
      return failure(
        "تنظیمات حساب خوانده نشد؛ مقدار پیش‌فرض به‌عنوان ذخیره‌شده نمایش داده نمی‌شود.",
        503,
      );
    return NextResponse.json(parseDeskPreferenceReceipt(data), { headers });
  } catch {
    return failure("خواندن تنظیمات حساب ممکن نیست.", 503);
  }
}
export async function PUT(req: NextRequest) {
  try {
    const auth = await gate();
    if (auth.error) return auth.error;
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== req.nextUrl.origin
    )
      return failure("مبدأ درخواست معتبر نیست.", 403);
    let body;
    try {
      body = parseDeskPreferenceWrite(await req.json());
    } catch {
      return failure("تنظیمات معتبر نیست.", 400);
    }
    const { data, error } = await auth.client!.rpc(
      "save_admin_desk_preferences",
      {
        p_schema_version: body.schemaVersion,
        p_layout: body.layout,
        p_hidden_tools: body.hiddenTools,
        p_expected_revision: body.expectedRevision,
      },
    );
    if (error)
      return failure(
        error.code === "40001"
          ? "تنظیمات در نشست دیگری تغییر کرده؛ ورودی شما حفظ شده است."
          : "ذخیره تأیید نشد؛ ورودی شما حفظ شده است.",
        error.code === "40001" ? 409 : 503,
      );
    return NextResponse.json(parseDeskPreferenceReceipt(data), { headers });
  } catch {
    return failure(
      "نتیجهٔ ذخیره تأیید نشد؛ ورودی را حفظ کنید و تنظیمات حساب را بازخوانی کنید.",
      503,
    );
  }
}
