// مدیریت دسترسی کامل (مشاوره/وبینار) — فقط ادمین.
// POST { email, kind: 'consulting'|'webinar'|'manual', months?, note? } → اعطا
// GET  ?email=… → فهرست دسترسی‌های کاربر
// PATCH { id } → ابطال (revoked_at=now)
//
// نیازمند جدول entitlements (sql/phase11_access_tiers.sql). اگر جدول نباشد 503 می‌دهد.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role === "admin" ? user : null;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    kind?: string;
    /** `null` صریح یعنی دسترسیِ بدونِ انقضا. نبودنش یعنی پیش‌فرضِ ۳ ماه. */
    months?: number | null;
    note?: string;
  } | null;
  if (!body?.email || !["consulting", "webinar", "manual"].includes(body.kind ?? "")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const svc = createAdminClient();
  const { data: target } = await svc
    .from("profiles")
    .select("id,email")
    .eq("email", body.email.trim().toLowerCase())
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // ── مدت: عدد، یا «همیشگی» ────────────────────────────────────────────────
  //
  // تصمیمِ آرش: مدت باید هر عددی بتواند باشد، «و تا هر زمان که بخواهم». پس
  // `months: null` صریح یعنی بدونِ انقضا. `undefined` (یعنی اصلاً نفرستادن)
  // همان پیش‌فرضِ ۳ ماه می‌ماند تا فراخوانی‌های قبلی تغییر رفتار ندهند —
  // فرقِ «نگفتم» و «گفتم همیشگی» نباید گم شود.
  const unlimited = body.months === null;
  const months = unlimited ? null : Math.min(Math.max(body.months ?? 3, 1), 1200);

  let expiresAt: string | null = null;
  if (months !== null) {
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);
    expiresAt = expires.toISOString();
  }

  const { data, error } = await svc
    .from("entitlements")
    .insert({
      user_id: target.id,
      kind: body.kind,
      source: "admin_grant",
      expires_at: expiresAt,
      granted_by: admin.id,
      note: body.note ?? null,
    })
    .select()
    .single();

  if (error) {
    const missing = error.message.includes("entitlements");
    return NextResponse.json(
      { error: missing ? "table_missing_run_phase11_sql" : error.message },
      { status: missing ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, entitlement: data });
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const svc = createAdminClient();
  const { data: target } = await svc
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { data, error } = await svc
    .from("entitlements")
    .select("id,kind,source,starts_at,expires_at,revoked_at,note,created_at")
    .eq("user_id", target.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const missing = error.message.includes("entitlements");
    return NextResponse.json(
      { error: missing ? "table_missing_run_phase11_sql" : error.message },
      { status: missing ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, entitlements: data });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const svc = createAdminClient();
  const { error } = await svc
    .from("entitlements")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
