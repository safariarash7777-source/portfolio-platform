import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readIranMarket } from "@/lib/market-bounded";
import { buildIndexSeries, type IndexHistRow } from "@/lib/core/indexTrend";
import { loadResearchDraftsView } from "@/lib/intelligence/research-drafts-view";
import {
  approvedCodalUrl,
  type ArashDeskData,
  type DeskCompanyReport,
  type DeskRead,
} from "./workspace-model";
import { collectDeskReads } from "./workspace-read";
type Client = Awaited<ReturnType<typeof createClient>>;
const unavailable = <T>(data: T, reason: string): DeskRead<T> => ({
  data,
  state: "unavailable",
  reason,
});
async function chart(client: Client): Promise<ArashDeskData["chart"]> {
  try {
    const { data, error } = await client
      .from("index_history")
      .select("jdate,total_index,equal_weight_index,trade_value")
      .order("jdate", { ascending: false })
      .limit(180);
    if (error) return unavailable([], "خواندن تاریخچهٔ شاخص ممکن نیست.");
    const rows = (data ?? []) as IndexHistRow[];
    const series = buildIndexSeries(rows);
    if (rows.length && !series.length)
      return unavailable(
        [],
        "نقطهٔ معتبر برای رسم شاخص در دادهٔ دریافت‌شده نیست.",
      );
    return {
      data: series,
      state: series.length ? "ready" : "empty",
      reason: null,
    };
  } catch {
    return unavailable([], "تاریخچهٔ شاخص در دسترس نیست.");
  }
}
async function reports(client: Client): Promise<ArashDeskData["reports"]> {
  try {
    const { data, error } = await client
      .from("codal_feed")
      .select("id,symbol,title,category,sent_date,sent_time,created_at,link")
      .order("sent_date", { ascending: false, nullsFirst: false })
      .order("sent_time", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(20);
    if (error)
      return unavailable([], "خواندن فید گزارش‌های شرکت‌ها ممکن نیست.");
    const rows: DeskCompanyReport[] = (data ?? []).map((row) => ({
      id: String(row.id),
      symbol: row.symbol,
      title: row.title,
      category: row.category ?? null,
      sourceDate: row.sent_date ?? null,
      sourceTime: row.sent_time ?? null,
      recordedAt: row.created_at ?? null,
      url: approvedCodalUrl(row.link),
    }));
    return { data: rows, state: rows.length ? "ready" : "empty", reason: null };
  } catch {
    return unavailable([], "فید گزارش‌ها در دسترس نیست.");
  }
}
/** Gate before all private reads. Uses the session/RLS, never service-role. */
export async function loadArashDeskData(): Promise<
  | { authorized: true; data: ArashDeskData }
  | { authorized: false; reason: string }
> {
  let client: Client;
  try {
    client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return { authorized: false, reason: "نشست مدیریت تأیید نشد." };
    const { data: profile, error: roleError } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleError || profile?.role !== "admin")
      return {
        authorized: false,
        reason: "دسترسی مدیریت تأیید نشد؛ دادهٔ خصوصی خوانده نشد.",
      };
  } catch {
    return {
      authorized: false,
      reason: "تأیید دسترسی مدیریت اکنون ممکن نیست.",
    };
  }
  const data = await collectDeskReads({
    market: readIranMarket,
    chart: () => chart(client),
    reports: () => reports(client),
    research: loadResearchDraftsView,
  });
  return { authorized: true, data };
}
