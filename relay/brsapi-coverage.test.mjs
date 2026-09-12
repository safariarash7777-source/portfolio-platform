/**
 * گاردِ پوششِ بودجه.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 * حفرهٔ «مسیرِ بی‌بودجه» یک‌بار با مهاجرتِ دستی بسته شد. بدونِ گارد، دفعهٔ بعد
 * که کسی یک `fetch` تازه به BrsApi اضافه کند دوباره باز می‌شود — و این بار
 * هیچ‌کس متوجه نمی‌شود، چون همه‌چیز سبز است.
 *
 * پس فهرستِ نقاطِ تماس از **خودِ کد** استخراج می‌شود و با فهرستِ اعلام‌شده
 * مقایسه می‌شود. هر نقطهٔ تازه باید صریح ثبت شود — با کلیدِ سهمیه‌اش و
 * وضعیتِ پوششش. سکوت پذیرفته نیست.
 *
 * ── تفکیکی که نباید گم شود ─────────────────────────────────────────────────
 *   • **call site** = یک جای مشخص در کد که می‌تواند درخواست بفرستد.
 *   • **endpoint**  = آدرسِ یکتای BrsApi. چند call site می‌توانند یکی باشند.
 *   • **کلیدِ سهمیه** = کدام سهمیه خرج می‌شود. دو کلید یعنی دو شمارندهٔ جدا.
 * قاطی‌کردنشان همان اشتباهی است که «۷ از ۱۲» را ساخت.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const tests = [];
const t = (n, f) => tests.push([n, f]);

const DIR = new URL(".", import.meta.url).pathname;

/** فهرستِ اعلام‌شده — منبعِ واحدِ حقیقت برای مستندات و این گارد. */
export const CALL_SITES = [
  // id                file                    endpoint                   کلید        طبقه
  ["market-index",     "server.mjs",           "Tsetmc/Index.php",        "main",     "critical"],
  ["gold-currency",    "server.mjs",           "Market/Gold_Currency.php","main",     "critical"],
  ["all-symbols",      "server.mjs",           "Tsetmc/AllSymbols.php",   "main",     "critical"],
  ["nav-bulk",         "server.mjs",           "Tsetmc/Nav.php",          "main",     "standard"],
  ["nav-completion",   "server.mjs",           "Tsetmc/Nav.php",          "main",     "bulk"],
  ["fund-meta",        "server.mjs",           "Tsetmc/Symbol.php",       "main",     "bulk"],
  ["symbol-detail",    "symbol-detail.mjs",    "Tsetmc/Symbol.php",       "main",     "bulk"],
  ["ime-certificate",  "ime.mjs",              "IME/Certificate.php",     "main",     "standard"],
  ["ime-physical",     "ime.mjs",              "IME/Physical.php",        "main",     "bulk"],
  ["options",          "options.mjs",          "Tsetmc/Option.php",       "main",     "standard"],
  ["candle-backfill",  "candle-backfill.mjs",  "Tsetmc/Candlestick.php",  "main",     "bulk"],
  ["codal-list",       "codal.mjs",            "Codal/Announcement.php",  "main",     "standard"],
  ["codal-archive",    "codal.mjs",            "Codal/Announcement.php",  "main",     "bulk"],
  ["commodity",        "commodity.mjs",        "Market/Commodity.php",    "commodity","standard"],
];

const MODULES = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && !f.includes(".test."));

function sourceOf(f) { return readFileSync(join(DIR, f), "utf8"); }

t("شمارش‌ها با هم قاطی نمی‌شوند — call site و endpoint و کلید سه چیزند", () => {
  const endpoints = new Set(CALL_SITES.map((r) => r[2]));
  const keys = new Set(CALL_SITES.map((r) => r[3]));
  assert.equal(CALL_SITES.length, 14, "۱۴ نقطهٔ تماس");
  assert.equal(endpoints.size, 11, "۱۱ endpointِ یکتا — چون Nav و Symbol و Announcement هرکدام دو نقطه دارند");
  assert.equal(keys.size, 2, "۲ کلیدِ سهمیه — اصلی و کامودیتی");
});

t("هر نقطهٔ تماسِ اعلام‌شده واقعاً در همان فایل هست", () => {
  for (const [id, file, endpoint] of CALL_SITES) {
    const src = sourceOf(file);
    assert.ok(src.includes(endpoint), `${id}: ${endpoint} در ${file} پیدا نشد`);
    assert.ok(src.includes(`"${id}"`), `${id}: شناسه‌اش در ${file} نیست`);
  }
});

t("هر نقطه هم مسیرِ کلاینت دارد هم شمارشِ مسیرِ قدیمی", () => {
  const missing = [];
  for (const [id, file] of CALL_SITES) {
    const src = sourceOf(file);
    const hasClient = new RegExp(`producer:\\s*"${id}"`).test(src);
    const hasLegacy = new RegExp(`countLegacy\\w*\\(\\s*"${id}"`).test(src);
    if (!hasClient || !hasLegacy) missing.push(`${id} (client=${hasClient}, legacy=${hasLegacy})`);
  }
  assert.deepEqual(missing, [], "این نقاط در یکی از دو حالتِ پرچم از بودجه کم نمی‌کنند");
});

t("هیچ endpointِ BrsApiای بیرون از سقف نمانده", () => {
  // آشکارسازِ نسخهٔ اول روی «fetch نزدیکِ کلمهٔ base» کار می‌کرد و دو مثبتِ
  // کاذب داد: `${base}/rest/v1/...` که Supabase است، و `excel.codal.ir` که
  // اصلاً BrsApi نیست. مبنای درست خودِ **endpointِ BrsApi** است.
  const ENDPOINTS = new Set(CALL_SITES.map((r) => r[2]));
  const offenders = [];
  for (const f of MODULES) {
    const lines = sourceOf(f).split("\n");
    lines.forEach((line, i) => {
      const hit = [...ENDPOINTS].find((e) => line.includes(e));
      if (!hit) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                    // کامنت
      const window = lines.slice(Math.max(0, i - 16), i + 17).join("\n");
      const covered = /\.request\(\{/.test(window) || /countLegacy\w*\(/.test(window);
      if (!covered) offenders.push(`${f}:${i + 1}  ${hit}`);
    });
  }
  assert.deepEqual(offenders, [],
    "این تماس‌ها نه از کلاینت رد می‌شوند نه شمرده می‌شوند — یعنی بیرونِ سقف‌اند");
});

t("کلیدِ کامودیتی در شمارندهٔ کلیدِ اصلی ریخته نمی‌شود", () => {
  const src = sourceOf("server.mjs");
  assert.ok(/commodity:\$\{day\}/.test(src) || /commodity:/.test(src),
    "بودجهٔ کامودیتی باید فضای‌نامِ روزِ جدا داشته باشد");
  // بررسیِ **اتصال**، نه صرفِ وجودِ نام. نسخهٔ اول فقط دنبالِ رشته می‌گشت و
  // وقتی فراخوان به شمارندهٔ کلیدِ اصلی وصل شد، چیزی نفهمید.
  assert.match(src, /refreshCommodities\(HDRS,\s*\{[^}]*countLegacy:\s*countLegacyCommodity\s*\}/,
    "`refreshCommodities` باید به شمارندهٔ کامودیتی وصل باشد، نه شمارندهٔ کلیدِ اصلی");
  assert.match(src, /refreshCommodities\(HDRS,\s*\{[^}]*client:\s*commodityClient\(\)/,
    "و به کلاینتِ کلیدِ کامودیتی");
});

console.log("brsapi-coverage:");
for (const [n, f] of tests) {
  try { await f(); pass++; console.log(`  ✓ ${n}`); }
  catch (e) { fail++; console.error(`  ✗ ${n}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
