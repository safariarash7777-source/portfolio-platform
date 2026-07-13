import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseChannelFeed } from "@/lib/telegram-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// نامِ کاربریِ کانالِ *عمومی* (بدونِ @). فیدِ t.me/s/<username> عمومی است و
// تاریخچه را می‌دهد؛ پس این کران پست‌های قدیمی و جدید را هر دو می‌آورد بدونِ
// آنکه بات ادمینِ کانال باشد. کانالِ خصوصیِ پولی (TELEGRAM_CHANNEL_ID) این‌جا
// دخیل نیست تا محتوای پولی عمومی نشود.
const PUBLIC_CHANNEL_USERNAME = (
  process.env.TELEGRAM_PUBLIC_CHANNEL_USERNAME || "arashsafariiiiiiii"
)
  .replace(/^@/, "")
  .toLowerCase();

// GET /api/cron/telegram-sync — همگام‌سازیِ هابِ محتوا با فیدِ عمومیِ کانال.
// با CRON_SECRET محافظت می‌شود (اعتبارسنجی پیش از هر خواندن/نوشتن). append-only:
// فقط لینک‌های تازه درج می‌شوند؛ رکوردِ موجود دست‌نخورده می‌ماند.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const feedUrl = `https://t.me/s/${PUBLIC_CHANNEL_USERNAME}`;
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
      return NextResponse.json(
        { ok: false, reason: "feed_unreachable", status: res.status },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json({ ok: false, reason: "fetch_failed" }, { status: 502 });
  }

  const posts = parseChannelFeed(html, PUBLIC_CHANNEL_USERNAME);
  if (posts.length === 0) {
    return NextResponse.json({ ok: true, found: 0, inserted: 0 });
  }

  const admin = createAdminClient();

  // dedup: لینک‌هایی که از قبل هستند را کنار بگذار (append-only).
  const urls = posts.map((p) => p.url);
  const { data: existingRows } = await admin
    .from("content_hub")
    .select("content_url")
    .in("content_url", urls);
  const existing = new Set((existingRows ?? []).map((r) => r.content_url));

  const fresh = posts.filter((p) => !existing.has(p.url));
  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, found: posts.length, inserted: 0 });
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
    return NextResponse.json(
      { ok: false, reason: "insert_failed" },
      { status: 500 }
    );
  }

  await admin.from("audit_log").insert({
    actor_id: null,
    action: "content.sync",
    entity: "content_hub",
    after: {
      source: "telegram_feed",
      channel: PUBLIC_CHANNEL_USERNAME,
      found: posts.length,
      inserted: inserted?.length ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    found: posts.length,
    inserted: inserted?.length ?? 0,
  });
}
