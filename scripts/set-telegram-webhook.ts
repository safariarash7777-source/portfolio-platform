#!/usr/bin/env npx tsx
/**
 * scripts/set-telegram-webhook.ts
 *
 * اسکریپت یک‌بارمصرف برای ثبت وبهوک بات تلگرام.
 * اجرا: npx tsx scripts/set-telegram-webhook.ts
 *
 * env vars لازم (از .env.local بخوانید یا export کنید):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 *   NEXT_PUBLIC_SITE_URL
 */

import "dotenv/config";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN تنظیم نشده.");
  process.exit(1);
}
if (!SECRET) {
  console.error("❌ TELEGRAM_WEBHOOK_SECRET تنظیم نشده.");
  process.exit(1);
}
if (!SITE_URL) {
  console.error("❌ NEXT_PUBLIC_SITE_URL تنظیم نشده.");
  process.exit(1);
}

const WEBHOOK_URL = `${SITE_URL}/api/telegram/webhook`;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function main() {
  console.log(`\n🔗 تنظیم وبهوک روی: ${WEBHOOK_URL}\n`);

  // ── setWebhook ──
  const setRes = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const setJson = await setRes.json();
  if (setJson.ok) {
    console.log("✅ setWebhook موفق:", setJson.description ?? "ok");
  } else {
    console.error("❌ setWebhook ناموفق:", setJson);
    process.exit(1);
  }

  // ── getWebhookInfo ──
  const infoRes = await fetch(`${API}/getWebhookInfo`);
  const infoJson = await infoRes.json();
  console.log("\n📋 getWebhookInfo:");
  console.log(JSON.stringify(infoJson.result, null, 2));
}

main().catch((err) => {
  console.error("خطای غیرمنتظره:", err);
  process.exit(1);
});
