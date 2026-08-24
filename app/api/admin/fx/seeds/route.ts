// به‌روزرسانی seed های داشبورد ارز از داخل داشبورد — فقط ادمین.
//
// GET  → وضعیت منابع (override فعال یا seed ریپو) + تاریخچهٔ نسخه‌ها
// POST → آپلود: FormData { kind, file? (xlsx), json? (base_rates متنی) }
//         پارس در سرور (lib/fx/excelParse) → اعتبارسنجی → upsert در Supabase
// DELETE → ?kind=… حذف override (بازگشت به seed ریپو)
//
// امنیت: role=admin از profiles؛ نوشتن با service_role (seedStore).

import { NextResponse } from "next/server";
import { serviceRoleGap, SERVICE_ROLE_GAP_STATUS } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import {
  SEED_KINDS,
  type SeedKind,
  readAllSeedOverrides,
  writeSeedOverride,
  deleteSeedOverride,
  listSeedHistory,
} from "@/lib/fx/seedStore";
import { parseMacroXlsx, parseCpiXlsx, parseYtmXlsx, parseBaseRatesJson } from "@/lib/fx/excelParse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAdmin(): Promise<{ email: string } | null> {
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
  return profile?.role === "admin" ? { email: user.email ?? user.id } : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [overrides, history] = await Promise.all([readAllSeedOverrides(), listSeedHistory()]);
  const status = SEED_KINDS.map((kind) => ({
    kind,
    source: overrides[kind] ? "supabase" : "repo",
    meta: overrides[kind]?.meta ?? null,
  }));
  return NextResponse.json({ status, history });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "FormData نامعتبر." }, { status: 400 });
  }
  const kind = String(form.get("kind") ?? "") as SeedKind;
  if (!SEED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "bad_kind", message: `kind باید یکی از ${SEED_KINDS.join("، ")} باشد.` }, { status: 400 });
  }

  try {
    let rows: unknown;
    let range: string;
    let sourceFile: string;
    let count: number;

    if (kind === "base_rates") {
      const jsonText = String(form.get("json") ?? "");
      if (!jsonText.trim()) {
        return NextResponse.json({ error: "no_json", message: "متن JSON نرخ‌های پایه خالی است." }, { status: 400 });
      }
      const parsed = parseBaseRatesJson(jsonText);
      rows = parsed.rows;
      range = parsed.range;
      sourceFile = "ویرایش دستی JSON";
      count = Object.keys(parsed.rows as Record<string, number>).length;
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "no_file", message: "فایل اکسل ارسال نشده." }, { status: 400 });
      }
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "too_big", message: "حداکثر ۱۵ مگابایت." }, { status: 400 });
      }
      const buf = await file.arrayBuffer();
      const parsed =
        kind === "macro_annual" ? parseMacroXlsx(buf)
        : kind === "cpi_monthly" ? parseCpiXlsx(buf)
        : parseYtmXlsx(buf);
      rows = parsed.rows;
      range = parsed.range;
      sourceFile = file.name;
      count = (parsed.rows as unknown[]).length;
    }

    const meta = {
      sourceFile,
      rows: count,
      range,
      uploadedAt: new Date().toISOString(),
      uploadedBy: admin.email,
    };
    await writeSeedOverride(kind, { rows, meta });
    return NextResponse.json({ ok: true, kind, meta });
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطای ناشناخته در پارس/ذخیره.";
    // «فایل بد بود» و «سکرتِ سرور نیست» دو تشخیص‌اند: یکی را کاربر با فایلِ
    // دیگر حل می‌کند، دیگری را ادمینِ Vercel. `parse_failed` دومی را شبیهِ
    // اولی نشان می‌داد و کاربر بی‌جهت دنبالِ فایلش می‌گشت.
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(serviceRoleGap("آپلودِ بذرِ ارز"), { status: SERVICE_ROLE_GAP_STATUS });
    }
    return NextResponse.json({ error: "parse_failed", message }, { status: 422 });
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") as SeedKind | null;
  if (!kind || !SEED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }
  try {
    await deleteSeedOverride(kind);
    return NextResponse.json({ ok: true, kind });
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطا در حذف.";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(serviceRoleGap("حذفِ بذرِ ارز"), { status: SERVICE_ROLE_GAP_STATUS });
    }
    return NextResponse.json({ error: "delete_failed", message }, { status: 500 });
  }
}
