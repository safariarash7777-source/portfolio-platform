import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * توکنِ کوتاه‌عمرِ ورود به داشبوردِ نرخ ارز (Streamlit روی لیارا).
 *
 * چرا لازم است: داشبورد روی دامنهٔ دیگری (لیارا، داخلِ ایران) اجرا می‌شود، پس
 * `middleware.ts` این سایت آن را گیت نمی‌کند و iframe هم هیچ محافظتی نیست.
 * این ماژول — فقط سمتِ سرور و بعد از تأییدِ نقشِ admin — یک توکنِ امضاشده
 * می‌سازد که داشبورد خودش اعتبارش را می‌سنجد.
 *
 *     token = "{exp}.{sub}.{sig}"
 *     sig   = base64url( HMAC-SHA256(FX_EMBED_SECRET, "{exp}.{sub}") )
 *
 * سمتِ پایتون در `auth_gate.py` داشبورد همین قالب را بررسی می‌کند. اگر یکی را
 * عوض کردید، آن یکی را هم عوض کنید.
 *
 * `FX_EMBED_SECRET` باید روی Vercel **و** روی لیارا یکسان باشد و هرگز
 * `NEXT_PUBLIC_` نشود — لو رفتنش یعنی هرکسی می‌تواند توکن بسازد.
 */

/** عمرِ توکن. فقط برای «ورود» است؛ نشستِ باز با انقضای آن قطع نمی‌شود. */
const TTL_SECONDS = 600;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(secret: string, payload: string): string {
  return b64url(createHmac("sha256", secret).update(payload, "utf8").digest());
}

export type FxEmbed =
  | { ok: true; url: string; origin: string }
  | { ok: false; reason: "no-url" | "no-secret" };

/**
 * آدرسِ کاملِ iframe را می‌سازد. فقط از کامپوننتِ سرور صدا بزنید، بعد از اینکه
 * نقشِ admin تأیید شده — این تابع خودش نقش را چک نمی‌کند.
 *
 * @param sub شناسهٔ کاربرِ ادمین؛ داخلِ امضا می‌رود تا توکن قابلِ ردیابی باشد.
 */
export function buildFxEmbedUrl(sub: string): FxEmbed {
  const base = process.env.FX_DASHBOARD_URL?.trim();
  const secret = process.env.FX_EMBED_SECRET?.trim();
  if (!base) return { ok: false, reason: "no-url" };
  if (!secret) return { ok: false, reason: "no-secret" };

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  // نقطه جداکنندهٔ توکن است؛ اگر شناسه نقطه داشته باشد امضا درست تجزیه نمی‌شود.
  const safeSub = sub.replace(/[^A-Za-z0-9_-]/g, "") || "admin";
  const token = `${exp}.${safeSub}.${sign(secret, `${exp}.${safeSub}`)}`;

  const url = new URL(base);
  url.searchParams.set("embed", "true");   // Streamlit: بدونِ نوارِ ابزار و حاشیه
  url.searchParams.set("t", token);
  return { ok: true, url: url.toString(), origin: url.origin };
}

/** فقط برای تست — هم‌ارزیِ امضا با پیاده‌سازیِ پایتون را می‌سنجد. */
export function verifyForTest(token: string, secret: string, nowMs = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, sub, sig] = parts;
  const expected = Buffer.from(sign(secret, `${exp}.${sub}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  return Number(exp) * 1000 > nowMs;
}
