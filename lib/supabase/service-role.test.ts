import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { serviceRoleGap, SERVICE_ROLE_GAP_STATUS } from "@/lib/supabase/service-role";

/**
 * گاردِ دامنهٔ سکرتِ سرور.
 *
 * ── چه اتفاقی افتاد ────────────────────────────────────────────────────
 * `CLAUDE.md` می‌گوید `admin.ts` «فقط verify پرداخت و وبهوک تلگرام». ولی هیچ
 * چیزی این را اجرا نمی‌کرد، پس به مرور **۲۲ فایل** به آن وصل شدند — از جمله
 * فهرستِ عمومیِ وبینارها و کلِ میزِ آرش. وقتی
 * `SUPABASE_SERVICE_ROLE_KEY` روی Production ست نشده بود، همهٔ آن‌ها با هم
 * افتادند و به‌نظر رسید «هیچ فیچری کار نمی‌کند».
 *
 * قاعده‌ای که نوشته شده ولی سنجیده نمی‌شود، قاعده نیست. این فایل آن را
 * می‌سنجد: هر مصرف‌کنندهٔ تازه باید **عمداً** به فهرست اضافه شود و دلیلش
 * کنارش نوشته شود.
 */

const ROOT = process.cwd();

/**
 * تنها جاهایی که مجازند سکرتِ سرور را لمس کنند — هر کدام با دلیلی که چرا
 * نشستِ کاربر آنجا وجود ندارد یا RLS اجازه نمی‌دهد.
 */
const ALLOWED = new Map<string, string>([
  ["lib/supabase/admin.ts", "خودِ کارخانه"],
  ["lib/supabase/service-role.test.ts", "همین گارد"],

  // ── هیچ نشستی وجود ندارد: تماسِ بیرونی یا cron ──
  ["app/api/payment/callback/route.ts", "بازگشتِ زرین‌پال — بدونِ کوکیِ کاربر"],
  ["app/api/webinars/payment/callback/route.ts", "بازگشتِ زرین‌پالِ وبینار — بدونِ کوکیِ کاربر"],
  ["app/api/telegram/webhook/route.ts", "وبهوکِ تلگرام — فراخوانِ سرورِ تلگرام"],
  ["app/api/leads/webhook/route.ts", "وبهوکِ Mini App — احراز با رمزِ مشترک"],
  ["lib/cron/store.ts", "دفترِ اجرای cron — بدونِ کاربر"],
  ["lib/telegram-sync.ts", "cronِ همگام‌سازی — بدونِ کاربر"],
  ["lib/market.ts", "`evaluateAlerts` از cronِ هشدار صدا زده می‌شود"],
  ["lib/fx/seedStore.ts", "آپلودِ بذرِ ارز از اسکریپتِ بیرونی"],

  // ── نشست هست، ولی RLS سیاستِ نوشتن ندارد ──
  ["app/api/webinars/payment/route.ts", "`payments` سیاستِ INSERT ندارد"],
  ["app/api/admin/announcements/route.ts", "`announcements` سیاستِ INSERT/UPDATE ندارد"],
  ["app/api/admin/analyses/route.ts", "انتشار در `signals`/`weekly_outlooks` سیاستِ INSERT ندارد"],

  // ── تشخیص و افزونهٔ اختیاری ──
  ["app/api/admin/health/route.ts", "حضورِ خودِ کلید را گزارش می‌کند"],
  ["app/api/webinars/list/route.ts", "شمارشِ ثبت‌نام افزونهٔ اختیاری است؛ نبودش `null` می‌دهد"],
]);

/**
 * کدِ بدونِ کامنت — همان قاعدهٔ `lib/core/vocab.test.ts` و `lib/desk/access.test.ts`.
 *
 * بدونِ این، گارد **مستنداتِ خودش** را می‌گیرد: فایل‌هایی که توضیح می‌دهند چرا
 * دیگر `createAdminClient()` را صدا نمی‌زنند، دقیقاً به‌خاطرِ همان جمله علامت
 * می‌خورند. آن‌وقت تست دربارهٔ کدِ اجراشونده چیزی نمی‌گوید.
 */
const codeOnly = (source: string) =>
  source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCE_DIRS = ["app", "lib", "components"];

test("only the documented callers may reach the service-role client", () => {
  const offenders: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const text = codeOnly(readFileSync(file, "utf8"));
      if (!/from "@\/lib\/supabase\/admin"/.test(text)) continue;
      const rel = relative(ROOT, file).split(sep).join("/");
      if (!ALLOWED.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `این فایل‌ها به سکرتِ سرور وصل شده‌اند بدونِ اینکه در فهرستِ ALLOWED دلیلی داشته باشند:\n  ${offenders.join("\n  ")}\n` +
      "اگر واقعاً لازم است، با دلیلِ صریح اضافه‌اش کن؛ وگرنه از `@/lib/supabase/server` استفاده کن."
  );
});

/**
 * فهرستی که به فایلِ حذف‌شده اشاره کند، آرام‌آرام بی‌معنا می‌شود — و آن‌وقت
 * گاردِ بالا هم بی‌صدا ضعیف می‌شود بدونِ اینکه قرمز شود.
 *
 * دو ورودی خودارجاع‌اند و از این بررسی مستثنا: `admin.ts` خودش کارخانه است و
 * از خودش import نمی‌کند، و همین فایل فقط نامِ مسیر را به‌عنوان متن دارد.
 */
const SELF_REFERENTIAL = new Set([
  "lib/supabase/admin.ts",
  "lib/supabase/service-role.test.ts",
]);

test("the allowlist has no stale entry", () => {
  const stale = [...ALLOWED.keys()].filter((rel) => {
    let text: string;
    try {
      text = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      return true; // فایل اصلاً دیگر وجود ندارد
    }
    if (SELF_REFERENTIAL.has(rel)) return false;
    return !/from "@\/lib\/supabase\/admin"/.test(text);
  });
  assert.deepEqual(stale, [], `این ورودی‌ها دیگر سکرتِ سرور را لمس نمی‌کنند: ${stale.join(", ")}`);
});

/**
 * مرزِ سختِ `CLAUDE.md`: کلیدِ سرویس‌رول هرگز نباید به باندلِ مرورگر برسد.
 * `server-only` این را در build می‌گیرد، ولی یک گاردِ صریح ارزانتر از یک
 * نشتِ کشف‌نشده است.
 */
test("no client component imports the service-role client", () => {
  const leaks: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const text = codeOnly(readFileSync(file, "utf8"));
      if (!/from "@\/lib\/supabase\/admin"/.test(text)) continue;
      if (/^\s*["']use client["']/m.test(text)) leaks.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(leaks, [], `کامپوننتِ کلاینت به سکرتِ سرور وصل است: ${leaks.join(", ")}`);
});

test("the gap response names the missing variable and the broken feature", () => {
  const gap = serviceRoleGap("پرداختِ وبینار");
  assert.equal(gap.error, "service_role_unavailable");
  assert.equal(gap.missingEnv, "SUPABASE_SERVICE_ROLE_KEY");
  assert.match(gap.detail, /پرداختِ وبینار/);
  assert.match(gap.detail, /SUPABASE_SERVICE_ROLE_KEY/);
  // ۵۰۳ یعنی «پیکربندی ناقص، برمی‌گردد»؛ ۵۰۰ یعنی «پردازش شکست خورد».
  assert.equal(SERVICE_ROLE_GAP_STATUS, 503);
});

/**
 * تابعِ SECURITY DEFINER که خودش با `auth.uid()` احراز می‌کند، با کلاینتِ
 * service-role **همیشه** رد می‌شود چون آن کلاینت نشستی حمل نمی‌کند. این دقیقاً
 * چیزی بود که `register_for_webinar` و `capture_intel_package` را از کار
 * انداخته بود — حتی وقتی کلید موجود بود.
 */
test("no RPC that authenticates through auth.uid() is called with the service-role client", () => {
  const SESSION_RPCS = [
    "register_for_webinar",
    "capture_intel_package",
    "publish_intel_analysis",
    "seal_rehearsal_day",
    "publish_market_note",
  ];
  const offenders: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const text = codeOnly(readFileSync(file, "utf8"));
      const usesRpc = SESSION_RPCS.some((rpc) => text.includes(`"${rpc}"`));
      if (usesRpc && /from "@\/lib\/supabase\/admin"/.test(text)) {
        offenders.push(relative(ROOT, file).split(sep).join("/"));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `این فایل‌ها هم RPCِ نشست‌محور صدا می‌زنند و هم سکرتِ سرور را import می‌کنند؛ ` +
      `اگر RPC با آن کلاینت صدا زده شود «auth.uid() IS NULL» می‌شود و همیشه رد می‌شود: ${offenders.join(", ")}`
  );
});

/**
 * ── نقطهٔ کورِ گاردِ بالا ────────────────────────────────────────────────
 * فهرستِ ALLOWED فقط importِ **مستقیم** را می‌بیند. ولی نقصِ واقعی از راهِ
 * غیرمستقیم آمد: `app/api/admin/content/route.ts` هیچ importی به سکرت ندارد،
 * اما `runTelegramFeedSync` را صدا می‌زند و آن ماژول `createAdminClient()`
 * را مستقیم می‌ساخت. پرتاب از ماژول بیرون زد و آن مسیر را با ۵۰۰ و بدنهٔ
 * خالی خواباند — در لاگِ Production هم `/api/admin/content` جزوِ قربانی‌ها بود.
 *
 * پس ریشه بسته می‌شود نه شاخه: یک ماژولِ `lib/` نباید نبودِ سکرت را به
 * فراخوانش پرتاب کند، چون فراخوان نمی‌داند چنین چیزی ممکن است.
 */
const MAY_THROW_TO_ITS_CALLER = new Map<string, string>([
  // قراردادِ اعلام‌شده‌اش پرتاب است و هر دو فراخوانش try/catch دارند
  // (`app/api/admin/fx/seeds/route.ts`).
  ["lib/fx/seedStore.ts", "همهٔ شکست‌هایش پرتاب‌اند و فراخوان می‌گیردشان"],
]);

test("no lib module lets a missing service-role key escape to its caller", () => {
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "lib"))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel.endsWith(".test.ts") || rel === "lib/supabase/admin.ts") continue;
    const text = codeOnly(readFileSync(file, "utf8"));
    // `\b` جلوی تطبیق با `tryCreateAdminClient()` را می‌گیرد: پیش از `c` یک
    // حرفِ کلمه‌ای (`y`) هست، پس مرزِ کلمه آنجا نیست.
    if (!/\bcreateAdminClient\(\)/.test(text)) continue;
    if (MAY_THROW_TO_ITS_CALLER.has(rel)) continue;
    // پذیرفتنی است اگر پیش از ساختن، خودش حضورِ متغیر را سنجیده باشد.
    if (/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(text)) continue;
    offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    "این ماژول‌های lib/ تابعِ createAdminClient() را بدونِ محافظ صدا می‌زنند؛ " +
      "نبودِ سکرت از آن‌ها بیرون می‌زند و فراخوان را با ۵۰۰ خالی می‌خواباند. " +
      "از tryCreateAdminClient() استفاده کن یا حضورِ متغیر را بسنج: " +
      offenders.join(", ")
  );
});
