import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAppUrl, isLocalUrl } from "./site-url";

/**
 * گاردهای آدرسِ عمومیِ سایت.
 *
 * این تست‌ها از یک باگِ **زنده روی Production** آمده‌اند، نه از فرض: تگ‌های
 * `og:image` و `twitter:image` روی دامنهٔ عمومی مقدارِ
 * `http://localhost:3000/og-default.png` داشتند، چون `NEXT_PUBLIC_APP_URL`
 * روی Vercel ست نشده بود و fallback بی‌صدا کار می‌کرد.
 *
 * `resolveAppUrl` عمداً `env` را پارامتر می‌گیرد تا هر سناریو بدونِ دست‌کاریِ
 * `process.env` سنجیده شود — تستِ متغیرِ محیطی که global را عوض کند، تستِ
 * بعدی را آلوده می‌کند.
 */

const PROD_DOMAIN = "portfolio-platform-fawn.vercel.app";

// ── ۱) تنظیمِ صریح همیشه برنده است ──────────────────────────────────────────

test("NEXT_PUBLIC_APP_URL بر متغیرهای خودکارِ Vercel اولویت دارد", () => {
  const url = resolveAppUrl({
    NEXT_PUBLIC_APP_URL: "https://arashsafari.ir",
    VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN,
    VERCEL_URL: "some-preview.vercel.app",
    VERCEL_ENV: "production",
    VERCEL: "1",
  });
  assert.equal(url, "https://arashsafari.ir");
});

// ── ۲) مقادیرِ خودکارِ Vercel به HTTPS کامل تبدیل می‌شوند ────────────────────

test("VERCEL_PROJECT_PRODUCTION_URL بدونِ scheme به https نرمال می‌شود", () => {
  const url = resolveAppUrl({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN,
  });
  assert.equal(url, `https://${PROD_DOMAIN}`);
});

test("VERCEL_URL وقتی استفاده می‌شود که آدرسِ production در دسترس نباشد", () => {
  const url = resolveAppUrl({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_URL: "portfolio-platform-abc123.vercel.app",
  });
  assert.equal(url, "https://portfolio-platform-abc123.vercel.app");
});

test("روی preview، دامنهٔ production بر آدرسِ همان preview ترجیح دارد", () => {
  // وگرنه کارتِ اشتراک‌گذاری به یک deploymentِ موقتِ محافظت‌شده لینک می‌دهد.
  const url = resolveAppUrl({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN,
    VERCEL_URL: "portfolio-platform-abc123.vercel.app",
  });
  assert.equal(url, `https://${PROD_DOMAIN}`);
});

test("اسلشِ انتهایی و مسیر حذف می‌شوند — فقط origin می‌ماند", () => {
  assert.equal(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://example.com/" }), "https://example.com");
  assert.equal(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://example.com/a/b" }), "https://example.com");
});

// ── ۳) توسعهٔ محلی حق دارد localhost باشد ───────────────────────────────────

test("خارج از Vercel، localhost مجاز است", () => {
  assert.equal(resolveAppUrl({}), "http://localhost:3000");
  assert.equal(resolveAppUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("buildِ محلی/CI با NODE_ENV=production نباید بشکند", () => {
  // ⚠️ اگر معیارِ «production» را `NODE_ENV` می‌گذاشتیم، همین حالت هر build در
  // CI را می‌شکست. معیار `VERCEL_ENV` است، نه `NODE_ENV`.
  assert.equal(resolveAppUrl({ NODE_ENV: "production" }), "http://localhost:3000");
});

// ── ۴) Production بدونِ آدرسِ معتبر fail-closed می‌شود ───────────────────────

test("Vercel production بدونِ هیچ آدرسی throw می‌کند", () => {
  assert.throws(
    () => resolveAppUrl({ VERCEL: "1", VERCEL_ENV: "production" }),
    /هیچ آدرسِ عمومی/
  );
});

test("Vercel production آدرسِ localhost را حتی اگر صریح باشد رد می‌کند", () => {
  // این همان بندی است که باگِ اصلی را غیرممکن می‌کند.
  assert.throws(
    () =>
      resolveAppUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    /localhost/
  );
});

test("هر deploymentِ Vercel بدونِ آدرس throw می‌کند، نه فقط production", () => {
  assert.throws(() => resolveAppUrl({ VERCEL: "1", VERCEL_ENV: "preview" }), /هیچ آدرسِ عمومی/);
});

test("مقدارِ خالی مثل «ست نشده» رفتار می‌کند، نه آدرسِ نامعتبر", () => {
  assert.equal(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "   " }), "http://localhost:3000");
});

test("آدرسِ نامعتبر با پیامِ روشن throw می‌کند", () => {
  assert.throws(() => resolveAppUrl({ NEXT_PUBLIC_APP_URL: "ht!tp://" }), /نامعتبر/);
});

test("isLocalUrl میزبان‌های محلی را می‌شناسد", () => {
  for (const h of ["http://localhost:3000", "http://127.0.0.1", "http://0.0.0.0:8080", "http://box.local"]) {
    assert.equal(isLocalUrl(new URL(h)), true, h);
  }
  assert.equal(isLocalUrl(new URL(`https://${PROD_DOMAIN}`)), false);
});

// ── ۵) نتیجهٔ واقعی: og:image و twitter:image روی دامنهٔ عمومی ───────────────

test("در Production، og:image و twitter:image به دامنهٔ عمومی می‌رسند", () => {
  // همان کاری که Next.js با `metadataBase` + مسیرِ نسبی می‌کند.
  const base = resolveAppUrl({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN,
  });
  const resolved = new URL("/og-default.png", base).toString();
  assert.equal(resolved, `https://${PROD_DOMAIN}/og-default.png`);
  assert.doesNotMatch(resolved, /localhost/);
});

test("sitemap و robots هم از همان پایه ساخته می‌شوند", () => {
  const base = resolveAppUrl({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: PROD_DOMAIN,
  });
  assert.equal(`${base}/sitemap.xml`, `https://${PROD_DOMAIN}/sitemap.xml`);
});

// ── ۶) هیچ‌جا fallbackِ قدیمی برنگردد ───────────────────────────────────────

test("هیچ فایلی fallbackِ localhost را دوباره وارد نکرده است", () => {
  const ROOT = process.cwd();
  const offenders: string[] = [];
  for (const rel of ["app/layout.tsx", "app/robots.ts", "app/sitemap.ts"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (/NEXT_PUBLIC_APP_URL\s*\?\?/.test(src)) offenders.push(`${rel}: fallbackِ مستقیم به‌جای resolveAppUrl`);
    if (!src.includes("resolveAppUrl")) offenders.push(`${rel}: از resolveAppUrl استفاده نمی‌کند`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
