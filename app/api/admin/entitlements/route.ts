// مدیریت دسترسی کامل (مشاوره/وبینار) — فقط ادمین.
// POST { email, kind: 'consulting'|'webinar'|'manual', months?, note? } → اعطا
// GET  ?email=… → فهرست دسترسی‌های کاربر
// PATCH { id } → ابطال (revoked_at=now)
//
// نیازمند جدول entitlements (sql/phase11_access_tiers.sql). اگر جدول نباشد 503 می‌دهد.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * گیتِ نقش — و **همان کلاینتی** که پرس‌وجوها با آن انجام می‌شوند.
 *
 * نسخهٔ اول نقش را با کلاینتِ نشست می‌سنجید و بعد با service-role کار می‌کرد.
 * لازم نبود: هر سه سیاستِ `entitlements` (`INSERT`/`SELECT`/`UPDATE`) و نیز
 * `profiles_self_read` شرطِ ادمین دارند، پس همین نشست دقیقاً همان دسترسی را
 * می‌گیرد — با این تفاوت که حالا RLS گیتِ دوم است و مسیر دیگر به
 * `SUPABASE_SERVICE_ROLE_KEY` گره نخورده تا بدونش ۵۰۰ بدهد.
 */
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
  return profile?.role === "admin" ? { user, supabase } : null;
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    kind?: string;
    months?: number;
    note?: string;
  } | null;
  if (!body?.email || !["consulting", "webinar", "manual"].includes(body.kind ?? "")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const svc = gate.supabase;
  const { data: target } = await svc
    .from("profiles")
    .select("id,email")
    .eq("email", body.email.trim().toLowerCase())
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const months = Math.min(Math.max(body.months ?? 3, 1), 24);
  const expires = new Date();
  expires.setMonth(expires.getMonth() + months);

  const { data, error } = await svc
    .from("entitlements")
    .insert({
      user_id: target.id,
      kind: body.kind,
      source: "admin_grant",
      expires_at: expires.toISOString(),
      granted_by: gate.user.id,
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
  const gate = await requireAdmin();
  if (!gate) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const svc = gate.supabase;
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
  const gate = await requireAdmin();
  if (!gate) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const svc = gate.supabase;
  const { error } = await svc
    .from("entitlements")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
