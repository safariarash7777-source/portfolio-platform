import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DISMISSED, PENDING, type DraftRow } from "@/lib/drafts/contracts";
import { dismissDraft, listDrafts, type DraftGateway, type DraftReader } from "@/lib/drafts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/api/admin/drafts` — بازبینیِ نامزدهای موتور. فقط ادمین.
 *
 * این فایل عمداً **نازک** است؛ مجوز و منطق در `lib/drafts/service.ts` است تا
 * بدونِ HTTP قابلِ اجرا و قابلِ تست باشد.
 *
 * ⚠️ **کلاینتِ نشستِ کاربر، نه service-role.** پس سیاست‌های RLSِ
 * `terminal_t0` گیتِ دومِ مستقل‌اند. `createAdminClient` عمداً در این فایل
 * import نشده — نه از روی فراموشی.
 *
 * ⚠️ **هیچ مسیرِ انتشار.** این route هرگز در `signals` نمی‌نویسد. انتشار
 * جای دیگری است و گیتِ انسانیِ خودش را دارد (`/api/admin/analyses`).
 */
function sessionReader(supabase: Awaited<ReturnType<typeof createClient>>): DraftReader {
  return {
    async readPending() {
      const { data, error } = await supabase
        .from("signal_drafts")
        .select("id, symbol, direction, status, source, reasons, created_at")
        .eq("status", PENDING)
        .order("created_at", { ascending: false })
        .limit(200);
      // خطا `null` برمی‌گرداند و نه `[]` — لایهٔ بالاتر باید بتواند «نتوانستم
      // بخوانم» را از «چیزی نبود» جدا کند.
      if (error) return null;
      return (data ?? []) as DraftRow[];
    },

    async dismiss(id: string, note: string, reviewerId: string) {
      const { data, error } = await supabase
        .from("signal_drafts")
        .update({
          status: DISMISSED,
          review_note: note,
          reviewed_by: reviewerId,
          updated_at: new Date().toISOString(),
        })
        // شرطِ `status = pending` عمدی است: یک نامزدِ بسته‌شده دوباره بسته
        // نمی‌شود، و اگر کسی شناسهٔ دلخواه بفرستد ردیفی برنمی‌گردد.
        .eq("id", id)
        .eq("status", PENDING)
        .select("id");
      if (error) return false;
      return (data ?? []).length === 1;
    },
  };
}

async function gateway(): Promise<DraftGateway> {
  const supabase = await createClient();
  return {
    async getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
    async getRole(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      return (data as { role?: string } | null)?.role ?? null;
    },
    createReader: () => sessionReader(supabase),
  };
}

export async function GET() {
  const result = await listDrafts(await gateway());
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  // یک فعل، و فقط یکی. هر چیزِ دیگری — از جمله «publish» — رد می‌شود.
  if (String(body.action ?? "") !== "dismiss") {
    return NextResponse.json(
      { error: "تنها اقدامِ مجاز روی این مسیر «کنارگذاشتن» است." },
      { status: 400 }
    );
  }

  const result = await dismissDraft(await gateway(), {
    id: String(body.id ?? ""),
    note: String(body.note ?? ""),
  });
  return NextResponse.json(result.body, { status: result.status });
}
