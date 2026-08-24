import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyQueryError } from "@/lib/health/status";
import type { SourceInput } from "@/lib/desk/contracts";
import { buildDesk, type DeskGateway, type DeskReader, type SourceQuery } from "@/lib/desk/service";

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

/** خوانندهٔ واقعی: شمارش + آخرین زمان، با تفکیکِ سه شکستِ متفاوت. */
function supabaseReader(): DeskReader {
  const admin = createAdminClient();
  return {
    async probe({ table, timeColumn, filter }: SourceQuery): Promise<SourceInput> {
      // فیلتر روی **هر دو** پرس‌وجو اعمال می‌شود. اگر فقط روی یکی بیفتد،
      // شمارشِ کلِ جدول کنارِ زمانِ زیرمجموعه می‌نشیند و ردیف یک ترکیبِ
      // بی‌معنا را گزارش می‌کند.
      const countQuery = admin.from(table).select("*", { count: "exact", head: true });
      const { count, error } = await (filter
        ? countQuery.eq(filter.column, filter.value)
        : countQuery);

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

      const timeQuery = admin
        .from(table)
        .select(timeColumn)
        .order(timeColumn, { ascending: false })
        .limit(1);
      const { data, error: timeError } = await (filter
        ? timeQuery.eq(filter.column, filter.value)
        : timeQuery
      ).maybeSingle();

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
    createReader: supabaseReader,
  };

  const result = await buildDesk(gateway, new Date());
  return NextResponse.json(result.body, { status: result.status });
}
