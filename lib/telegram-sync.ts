import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseChannelFeed } from "@/lib/telegram-feed";

// منطقِ مشترکِ همگام‌سازیِ هابِ محتوا با فیدِ عمومیِ تلگرام. هم کرانِ زمان‌بندی‌شده
// (/api/cron/telegram-sync) و هم دکمهٔ دستیِ ادمین از همین تابع استفاده می‌کنند تا
// یک مسیرِ کد باشد. با سرویس‌رول درج می‌شود (RLS دور زده می‌شود)؛ فراخواننده باید
// خودش مجاز بودن را تضمین کند (CRON_SECRET یا احرازِ ادمین).

const PUBLIC_CHANNEL_USERNAME = (
  process.env.TELEGRAM_PUBLIC_CHANNEL_USERNAME || "arashsafariiiiiiii"
)
  .replace(/^@/, "")
  .toLowerCase();

export interface SyncResult {
  ok: boolean;
  found: number;
  inserted: number;
  /** در صورتِ خطا: feed_unreachable | fetch_failed | insert_failed */
  reason?: string;
  channel: string;
}

export async function runTelegramFeedSync(): Promise<SyncResult> {
  const channel = PUBLIC_CHANNEL_USERNAME;
  const feedUrl = `https://t.me/s/${channel}`;

  let html: string;
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ArashSafariBot/1.0; +https://t.me/arashsafariiiiiiii)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, found: 0, inserted: 0, reason: "feed_unreachable", channel };
    }
    html = await res.text();
  } catch {
    return { ok: false, found: 0, inserted: 0, reason: "fetch_failed", channel };
  }

  const posts = parseChannelFeed(html, channel);
  if (posts.length === 0) {
    return { ok: true, found: 0, inserted: 0, channel };
  }

  const admin = createAdminClient();

  // dedup: لینک‌های موجود را کنار بگذار (append-only).
  const urls = posts.map((p) => p.url);
  const { data: existingRows } = await admin
    .from("content_hub")
    .select("content_url")
    .in("content_url", urls);
  const existing = new Set((existingRows ?? []).map((r) => r.content_url));

  const fresh = posts.filter((p) => !existing.has(p.url));
  if (fresh.length === 0) {
    return { ok: true, found: posts.length, inserted: 0, channel };
  }

  const rows = fresh.map((p) => {
    const lines = p.text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      platform: "telegram" as const,
      kind: p.kind,
      content_url: p.url,
      title: lines[0] ?? null,
      description: lines.slice(1).join("\n") || null,
      published_at: p.publishedAt ?? new Date().toISOString(),
    };
  });

  const { data: inserted, error } = await admin
    .from("content_hub")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("telegram-sync insert error:", error.message);
    return { ok: false, found: posts.length, inserted: 0, reason: "insert_failed", channel };
  }

  const count = inserted?.length ?? 0;
  await admin.from("audit_log").insert({
    actor_id: null,
    action: "content.sync",
    entity: "content_hub",
    after: { source: "telegram_feed", channel, found: posts.length, inserted: count },
  });

  return { ok: true, found: posts.length, inserted: count, channel };
}
