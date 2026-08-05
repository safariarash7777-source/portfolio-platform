/**
 * آدرسِ عمومیِ سایت — منبعِ واحدِ حقیقت برای `metadataBase`، `robots` و `sitemap`.
 *
 * ── مشکلی که این فایل حل می‌کند ─────────────────────────────────────────────
 * هر سه‌جا این خط را داشتند:
 *
 *     process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
 *
 * و `NEXT_PUBLIC_APP_URL` روی Vercel ست نشده بود. نتیجه روی **Production**:
 *
 *     og:image      = http://localhost:3000/og-default.png
 *     twitter:image = http://localhost:3000/og-default.png
 *     sitemap.xml   = <loc>http://localhost:3000/</loc>
 *
 * یعنی تصویرِ اشتراک‌گذاری در تلگرام و توییتر اصلاً بارگذاری نمی‌شد و نقشهٔ
 * سایت برای موتورهای جستجو بی‌معنا بود. هیچ‌چیز هم خطا نمی‌داد: fallback بی‌صدا
 * کار می‌کرد و صفحه سالم به‌نظر می‌رسید.
 *
 * ── قاعده‌ای که حالا برقرار است ─────────────────────────────────────────────
 * **Production هرگز نمی‌تواند metadata با localhost منتشر کند.** اگر روی
 * Vercel production آدرسِ معتبری پیدا نشود — یا آدرسِ داده‌شده localhost باشد —
 * این تابع throw می‌کند و build می‌شکند. شکستنِ build بهتر از انتشارِ بی‌صدای
 * لینک‌های خراب است؛ همان چیزی که یک بار اتفاق افتاد و کسی متوجه نشد.
 *
 * ⚠️ `NODE_ENV` عمداً معیارِ «production» نیست. `npm run build` محلی و در CI هم
 * `NODE_ENV=production` دارد ولی هیچ متغیرِ Vercel ندارد؛ اگر معیار آن بود،
 * هر build در CI می‌شکست. معیارِ درست `VERCEL_ENV` است.
 */

type Env = Record<string, string | undefined>;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** مقدارِ خالی و فقط-فاصله را مثل «ست نشده» می‌بیند. */
function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * `example.com` → `https://example.com`
 *
 * متغیرهای خودکارِ Vercel (`VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) **بدون
 * scheme** می‌آیند. بدونِ این نرمال‌سازی `new URL("example.com")` پرتاب می‌کند و
 * `new URL("localhost:3000")` هم بدتر: آن را با پروتکلِ `localhost:` پارس می‌کند.
 */
function normalize(raw: string): URL {
  const withScheme = raw.includes("://") ? raw : `https://${raw}`;
  return new URL(withScheme);
}

export function isLocalUrl(url: URL): boolean {
  return LOCAL_HOSTNAMES.has(url.hostname) || url.hostname.endsWith(".local");
}

/**
 * آدرسِ پایهٔ سایت را برمی‌گرداند (فقط origin، بدونِ اسلشِ انتهایی).
 *
 * ترتیب:
 *   ۱. `NEXT_PUBLIC_APP_URL` — تنظیمِ صریح، همیشه برنده
 *   ۲. `VERCEL_PROJECT_PRODUCTION_URL` — دامنهٔ production پروژه، حتی روی preview
 *   ۳. `VERCEL_URL` — آدرسِ همین deployment
 *   ۴. `http://localhost:3000` — **فقط** وقتی اصلاً روی Vercel نیستیم
 *
 * چرا ۲ قبل از ۳: روی یک preview، `VERCEL_URL` آدرسِ همان preview است. اگر
 * metadata از آن ساخته شود، لینکِ کارتِ اشتراک‌گذاری به یک deployment موقتِ
 * محافظت‌شده اشاره می‌کند. دامنهٔ production همیشه پاسخِ درست‌تری است.
 */
export function resolveAppUrl(env: Env = process.env): string {
  const isVercel = Boolean(clean(env.VERCEL) ?? clean(env.VERCEL_ENV));
  const isVercelProduction = clean(env.VERCEL_ENV) === "production";

  const candidate =
    clean(env.NEXT_PUBLIC_APP_URL) ??
    clean(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    clean(env.VERCEL_URL);

  if (candidate) {
    let url: URL;
    try {
      url = normalize(candidate);
    } catch {
      throw new Error(`resolveAppUrl: آدرسِ نامعتبر «${candidate}» — یکی از NEXT_PUBLIC_APP_URL / VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL را درست کن.`);
    }
    // بندِ اصلی: حتی اگر کسی صریحاً localhost را ست کند، Production نمی‌پذیرد.
    if (isVercelProduction && isLocalUrl(url)) {
      throw new Error(`resolveAppUrl: آدرسِ محلیِ «${url.origin}» روی Vercel production مجاز نیست — metadata با localhost منتشر نمی‌شود.`);
    }
    return url.origin;
  }

  if (isVercel) {
    throw new Error(
      "resolveAppUrl: روی Vercel هیچ آدرسِ عمومی‌ای پیدا نشد. NEXT_PUBLIC_APP_URL را ست کن — " +
        "بازگشت به localhost اینجا یعنی انتشارِ لینک‌های خراب."
    );
  }

  // فقط توسعهٔ محلی و buildهای خارج از Vercel به اینجا می‌رسند.
  return "http://localhost:3000";
}
