import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  grantEntitlement,
  entitlementSource,
  authorityFromSource,
  type EntitlementKind,
} from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * آشتی‌دهیِ پرداخت ↔ دسترسی — `G2-005`.
 *
 * پرداختِ موفق ممکن است دسترسی نگرفته باشد (اعطا شکست خورده، یا پرداخت پیش از
 * وجودِ این پل انجام شده). این روت همان موارد را پیدا می‌کند و **دوباره** اعطا
 * می‌کند.
 *
 * چرا تکرارِ آن بی‌خطر است: `grantEntitlement` نسبت به `source` idempotent است،
 * و `source` از `authority`ِ یکتای پرداخت ساخته می‌شود. پس اجرای دوباره روی
 * همان پرداخت ردیفِ تازه نمی‌سازد.
 *
 * `GET`  → فقط گزارش می‌دهد، هیچ چیزی نمی‌نویسد (dry-run).
 * `POST` → اعطا را انجام می‌دهد.
 *
 * هرگز دادهٔ شخصی برنمی‌گرداند: فقط شناسهٔ پرداخت و نتیجه.
 */

type PaymentRow = { id: string; user_id: string; authority: string | null };

/**
 * نوعِ دسترسی از روی وجودِ ثبت‌نامِ وبینار تعیین می‌شود.
 *
 * حدس نمی‌زنیم: اگر پرداخت به یک `webinar_registrations` وصل باشد `webinar`
 * است، وگرنه `consulting`. همان قاعده‌ای که خودِ callbackها دارند.
 */
async function resolveKinds(
  admin: ReturnType<typeof createAdminClient>,
  paymentIds: string[]
): Promise<Map<string, EntitlementKind>> {
  const kinds = new Map<string, EntitlementKind>();
  if (paymentIds.length === 0) return kinds;
  const { data } = await admin
    .from("webinar_registrations")
    .select("payment_id")
    .in("payment_id", paymentIds);
  const webinarPaymentIds = new Set((data ?? []).map((r) => String(r.payment_id)));
  for (const id of paymentIds) {
    kinds.set(id, webinarPaymentIds.has(id) ? "webinar" : "consulting");
  }
  return kinds;
}

async function findUncovered(admin: ReturnType<typeof createAdminClient>) {
  const { data: paid, error: pErr } = await admin
    .from("payments")
    .select("id,user_id,authority")
    .eq("status", "paid");
  if (pErr) throw new Error(pErr.message);

  const rows = (paid ?? []) as PaymentRow[];
  if (rows.length === 0) return { rows: [] as PaymentRow[], total: 0 };

  const { data: ents, error: eErr } = await admin
    .from("entitlements")
    .select("source")
    .not("source", "is", null);
  if (eErr) throw new Error(eErr.message);

  // تطبیق بر اساسِ authority — نه `payments.id`. `source` قالبِ
  // `{prefix}:{authority}` دارد (`lib/entitlements.ts`).
  const covered = new Set(
    (ents ?? []).map((r) => authorityFromSource(String(r.source))).filter(Boolean) as string[]
  );
  const uncovered = rows.filter((p) => (p.authority ? !covered.has(p.authority) : true));
  return { rows: uncovered, total: rows.length };
}

async function requireAdmin() {
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
  return { userId: user.id };
}

/** گزارشِ فقط‌خواندنی — هیچ نوشتنی. */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  try {
    const admin = createAdminClient();
    const { rows, total } = await findUncovered(admin);
    return NextResponse.json({
      mode: "dry-run",
      paidTotal: total,
      paidWithoutEntitlement: rows.length,
      // بدونِ `user_id` — شناسهٔ پرداخت برای پیداکردنِ مورد کافی است.
      paymentIds: rows.map((r) => r.id),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطای ناشناخته" },
      { status: 500 }
    );
  }
}

/** اعطای دوبارهٔ دسترسی برای پرداخت‌های بدونِ دسترسی. */
export async function POST() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  try {
    const admin = createAdminClient();
    const { rows, total } = await findUncovered(admin);
    const kinds = await resolveKinds(admin, rows.map((r) => r.id));

    const results: { paymentId: string; result: string }[] = [];
    for (const p of rows) {
      if (!p.authority) {
        // بدونِ authority نمی‌توان `source`ِ idempotent ساخت — اعطای کور
        // ممکن است دسترسیِ تکراری بدهد، پس عمداً انجام نمی‌شود.
        results.push({ paymentId: p.id, result: "skipped_no_authority" });
        continue;
      }
      const kind = kinds.get(p.id) ?? "consulting";
      const grant = await grantEntitlement(admin, {
        userId: p.user_id,
        kind,
        source: entitlementSource(kind, p.authority),
        note: "reconcile",
      });
      results.push({
        paymentId: p.id,
        result: grant.ok ? (grant.created ? "granted" : "already_granted") : `failed:${grant.reason}`,
      });
    }

    const granted = results.filter((r) => r.result === "granted").length;
    await admin.from("audit_log").insert({
      actor_id: gate.userId,
      action: "entitlement.reconcile",
      entity: "entitlement",
      after: { candidates: rows.length, granted, paidTotal: total },
    });

    return NextResponse.json({ mode: "apply", paidTotal: total, candidates: rows.length, granted, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطای ناشناخته" },
      { status: 500 }
    );
  }
}
