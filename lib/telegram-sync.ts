import "server-only";
import { tryCreateContentSyncClient } from "@/lib/supabase/content-sync";
import { datedFeedPosts, freshFeedPosts, parseChannelFeed } from "@/lib/telegram-feed";

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
  /** شناسهٔ کوتاهِ علت شکست؛ متن/URL خامِ فید در پاسخ قرار نمی‌گیرد. */
  reason?: string;
  skippedUndated?: number;
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
    // A 200 response can be a login/error page or an empty feed. Without a
    // post marker it cannot certify that the scheduled sync succeeded.
    return { ok: false, found: 0, inserted: 0, reason: "feed_empty", channel };
  }

  // content_hub.published_at is NOT NULL and is displayed as publication time.
  // Never substitute the capture time when Telegram omits or mangles <time>.
  const { eligible: dated, skippedUndated } = datedFeedPosts(posts);
  if (dated.length === 0) {
    return { ok: false, found: posts.length, inserted: 0, skippedUndated, reason: "source_date_missing", channel };
  }

  // ⚠️ این ماژول **هرگز** نباید سکرتِ غایب را به فراخوان پرتاب کند.
  //
  // هر شکستِ دیگرِ اینجا یک `reason` برمی‌گرداند، ولی این یکی پرتاب می‌کرد و
  // چون `runTelegramFeedSync` از `PUT /api/admin/content` هم صدا زده می‌شود،
  // آن پرتاب از ماژول بیرون می‌زد و آن مسیر را با ۵۰۰ و بدنهٔ خالی می‌خواباند —
  // مسیری که خودش هیچ import مستقیمی به سکرت ندارد. یعنی وابستگی **غیرمستقیم**
  // بود و در لاگِ Production هم دقیقاً همان‌طور دیده شد.
  //
  // `content_hub` سیاستِ INSERT ندارد، پس نوشتن واقعاً سکرت می‌خواهد؛ چیزی که
  // عوض می‌شود شکلِ شکست است، نه نیاز.
  const admin = tryCreateContentSyncClient();
  if (!admin) {
    return { ok: false, found: posts.length, inserted: 0, skippedUndated, reason: "service_role_missing", channel };
  }

  // dedup: لینک‌های موجود را کنار بگذار (append-only).
  const urls = [...new Set(dated.map((p) => p.url))];
  const { data: existingRows, error: lookupError } = await admin
    .from("content_hub")
    .select("content_url")
    .in("content_url", urls);
  if (lookupError) {
    return { ok: false, found: posts.length, inserted: 0, skippedUndated, reason: "dedup_lookup_failed", channel };
  }
  const existing = new Set((existingRows ?? []).map((r) => r.content_url));

  const fresh = freshFeedPosts(dated, existing);
  if (fresh.length === 0) {
    return { ok: skippedUndated === 0, found: posts.length, inserted: 0, skippedUndated,
      ...(skippedUndated ? { reason: "source_date_missing" } : {}), channel };
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
      published_at: p.publishedAt,
    };
  });

  const { data: inserted, error } = await admin
    .from("content_hub")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("telegram-sync insert error:", error.message);
    return { ok: false, found: posts.length, inserted: 0, skippedUndated, reason: "insert_failed", channel };
  }

  const count = inserted?.length ?? 0;
  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: null,
    action: "content.sync",
    entity: "content_hub",
    after: { source: "telegram_feed", channel, found: posts.length, inserted: count, skippedUndated },
  });
  if (auditError) {
    return { ok: false, found: posts.length, inserted: count, skippedUndated, reason: "audit_failed", channel };
  }

  return { ok: skippedUndated === 0, found: posts.length, inserted: count, skippedUndated,
    ...(skippedUndated ? { reason: "source_date_missing" } : {}), channel };
}
