import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyQueryError } from "@/lib/health/status";
import type { SourceInput } from "@/lib/desk/contracts";
import { buildDesk, type DeskGateway, type DeskReader } from "@/lib/desk/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/desk — میزِ آرش (فقط ادمین). `G3-002`.
 *
 * این فایل عمداً **نازک** است: مجوز، تجمیع و طبقه‌بندی در
 * `lib/desk/service.ts` و `lib/desk/contracts.ts` هستند تا رفتارشان بدونِ
 * HTTP قابلِ اجرا و قابلِ تست باشد («یک موتور، چند نما»). اینجا فقط Supabase
 * به قراردادِ `DeskGateway` وصل می‌شود.
 *
 * قواعدِ سختِ این مسیر:
 *  ۱. **لایهٔ تجمیع است، نه موتور.** هیچ محاسبهٔ مالی؛ فقط شمارش و آخرین زمان.
 *  ۲. **هیچ عددِ ساختگی.** منبعِ ناموجود → `unavailable`، نه صفر.
 *  ۳. شکستِ یک پرس‌وجو نباید کلِ میز را خالی کند — درسِ `B-024`.
 *  ۴. هیچ Agent، هیچ LLM، هیچ وابستگیِ OpenAI.
 *  ۵. هیچ سکرت، هیچ دادهٔ شخصیِ کاربر — فقط شمارشِ تجمیعی.
 *
 * دسترسی دو لایه گیت می‌شود: `app/(protected)/admin/layout.tsx` نما را، و
 * همین مسیر مستقلاً داده را. یکی از این دو کافی نیست.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * خوانندهٔ واقعی: شمارش + آخرین زمان، با تفکیکِ سه شکستِ متفاوت.
 *
 * ── چرا دیگر service-role نیست ─────────────────────────────────────────
 * نسخهٔ اول اینجا کلاینتِ service-role می‌ساخت. نتیجه‌اش این بود که میز به
 * وجودِ `SUPABASE_SERVICE_ROLE_KEY` گره خورد و روی Production — که این کلید
 * را نداشت — کلِ مسیر ۵۰۰ می‌داد. حال آنکه هیچ‌کدام از این جدول‌ها به
 * دورزدنِ RLS نیاز ندارند: همه برای `authenticated` سیاستِ خواندن دارند
 * (بازارِ عمومی `qual: true`، و `waitlist`/`audit_log` با `is_admin()`).
 *
 * با کلاینتِ نشست، RLS **گیتِ دومِ واقعی** می‌شود: اگر گیتِ نقش در
 * `buildDesk` روزی خراب شود، دیتابیس همچنان جلوی غیرادمین را می‌گیرد. با
 * service-role چنین شبکهٔ ایمنی‌ای وجود نداشت. این همان چیزی است که
 * `CLAUDE.md` می‌گوید: `admin.ts` فقط برای verify پرداخت و وبهوکِ تلگرام.
 *
 * ⚠️ نکتهٔ شمارش: با RLS، `count` یعنی «ردیف‌های قابلِ دیدن». برای این
 * فراخوان که نقشش admin است این دو یکی‌اند، چون هر سیاستِ بالا برای admin
 * کلِ جدول را باز می‌کند.
 */
function supabaseReader(supabase: SessionClient): DeskReader {
  return {
    async probe(table: string, timeColumn: string | null): Promise<SourceInput> {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        const kind = classifyQueryError(error.code, error.message);
        return {
          available: false,
          count: 0,
          unavailableReason:
            kind === "missing_table"
              ? `جدولِ \`${table}\` هنوز اجرا نشده — migration مربوطه NOT_APPLIED است`
              : `پرس‌وجوی \`${table}\` مردود شد`,
        };
      }

      const rows = count ?? 0;
      if (rows === 0 || !timeColumn) return { available: true, count: rows };

      const { data, error: timeError } = await supabase
        .from(table)
        .select(timeColumn)
        .order(timeColumn, { ascending: false })
        .limit(1)
        .maybeSingle();

      if (timeError) {
        // جدول هست و ستون نیست → **باگِ خودِ ماست**، نه واقعیتِ محیط. نسخهٔ
        // اول اینجا بی‌صدا «بدونِ زمان» برمی‌گرداند و شاخص تا ابد «به‌روز»
        // دیده می‌شد. حالا صریحاً علامت می‌خورد تا سر و صدا کند.
        const kind = classifyQueryError(timeError.code, timeError.message);
        if (kind === "missing_column") {
          return { available: true, count: rows, timestampBroken: true };
        }
        return { available: true, count: rows, timestampBroken: true };
      }

      const value = (data as Record<string, unknown> | null)?.[timeColumn];
      return { available: true, count: rows, lastAt: typeof value === "string" ? value : null };
    },
  };
}

export async function GET() {
  const supabase = await createClient();

  const gateway: DeskGateway = {
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
    createReader: () => supabaseReader(supabase),
  };

  const result = await buildDesk(gateway, new Date());
  return NextResponse.json(result.body, { status: result.status });
}
