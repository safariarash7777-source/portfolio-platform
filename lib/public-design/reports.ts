import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  approvedCodalUrl,
  type DeskCompanyReport,
  type DeskRead,
} from "@/lib/desk/workspace-model";

/** Existing Codal metadata under the current session/RLS; no parsed-report claim. */
export async function publicReports(
  client: Awaited<ReturnType<typeof createClient>>,
): Promise<DeskRead<DeskCompanyReport[]>> {
  try {
    const { data, error } = await client
      .from("codal_feed")
      .select("id,symbol,title,category,sent_date,sent_time,created_at,link")
      .order("sent_date", { ascending: false, nullsFirst: false })
      .order("sent_time", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(12);
    if (error)
      return {
        state: "unavailable",
        data: [],
        reason: "خواندن اطلاعیه‌های کدال اکنون ممکن نیست.",
      };
    const rows = (data ?? []).map((row) => ({
      id: String(row.id),
      symbol: row.symbol,
      title: row.title,
      category: row.category ?? null,
      sourceDate: row.sent_date ?? null,
      sourceTime: row.sent_time ?? null,
      recordedAt: row.created_at ?? null,
      url: approvedCodalUrl(row.link),
    }));
    return { state: rows.length ? "ready" : "empty", data: rows, reason: null };
  } catch {
    return {
      state: "unavailable",
      data: [],
      reason: "فید اطلاعیه‌ها در دسترس نیست.",
    };
  }
}
