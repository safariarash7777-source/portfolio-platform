import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردهای دسترسی و صداقتِ میز — `G3-002`.
 *
 * این‌ها تستِ ایستا روی متنِ منبع‌اند، نه تستِ زمانِ اجرا. دلیلش صریح است:
 * مسیرِ کاملِ HTTP نیازمندِ Supabase زنده است و آن در CI موجود نیست. پس
 * به‌جای شبیه‌سازیِ احراز هویت — که فقط شبیه‌سازیِ خودش را اثبات می‌کند —
 * وجودِ هر دو لایهٔ گیت و نبودِ الگوهای ممنوع را تأیید می‌کنیم.
 *
 * ⚠️ محدودیت را صریح می‌گوییم: این تست‌ها **اجرای واقعیِ ردِ دسترسی را
 * اثبات نمی‌کنند**؛ اثبات می‌کنند که کدِ رد‌کننده حذف یا دور زده نشده.
 */

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/**
 * کدِ بدونِ کامنت — همان قاعدهٔ `lib/core/vocab.test.ts`.
 *
 * لازم است چون گاردهای پایین دقیقاً همان واژه‌هایی را می‌جویند که
 * مستندسازیِ خودِ این فایل‌ها ناچار است بنویسد («هیچ اتصالِ LLM»،
 * «واژهٔ توصیه ممنوع است»). بدونِ این، تست کامنتِ خودش را می‌گیرد و
 * چیزی دربارهٔ کدِ اجراشونده نمی‌گوید.
 */
const codeOnly = (source: string) =>
  source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*"));
    })
    .join("\n");

const ROUTE = read("app", "api", "admin", "desk", "route.ts");
const PAGE = read("app", "(protected)", "admin", "desk", "page.tsx");
const LAYOUT = read("app", "(protected)", "admin", "layout.tsx");
const BOARD = read("components", "admin", "DeskBoard.tsx");
const CONTRACTS = read("lib", "desk", "contracts.ts");

test("the route refuses an anonymous caller before touching any data", () => {
  assert.match(ROUTE, /auth\.getUser\(\)/);
  assert.match(ROUTE, /status:\s*401/);
  const authIndex = ROUTE.indexOf("auth.getUser()");
  const adminIndex = ROUTE.indexOf("createAdminClient()");
  assert.ok(authIndex > -1 && adminIndex > -1);
  assert.ok(authIndex < adminIndex, "the service-role client must not be built before the auth check");
});

test("the route refuses a signed-in non-admin with 403", () => {
  assert.match(ROUTE, /from\("profiles"\)[\s\S]*?select\("role"\)/);
  assert.match(ROUTE, /role\s*!==\s*"admin"/);
  assert.match(ROUTE, /status:\s*403/);
});

test("the page is gated independently of the route, not instead of it", () => {
  // دو لایه لازم است: اگر فقط نما گیت شود، API باز می‌مانَد؛ اگر فقط API گیت
  // شود، صفحه برای غیرِادمین رندر می‌شود و بعد خالی می‌ماند.
  assert.match(LAYOUT, /role\s*!==\s*"admin"/);
  assert.match(LAYOUT, /redirect\("\/dashboard"\)/);
  assert.match(PAGE, /dynamic\s*=\s*"force-dynamic"/);
  assert.match(PAGE, /robots:\s*\{\s*index:\s*false/);
});

test("the desk is never indexed and never renders a public route", () => {
  assert.match(PAGE, /robots/);
  assert.doesNotMatch(PAGE, /revalidate/);
});

test("no agent, LLM or OpenAI dependency reaches the desk", () => {
  for (const [name, source] of Object.entries({ ROUTE, PAGE, BOARD, CONTRACTS })) {
    assert.doesNotMatch(codeOnly(source), /openai|anthropic|\bllm\b|gpt-|completions/i,
      `${name} reaches a model`);
  }
});

test("the desk never emits the forbidden advisory vocabulary", () => {
  // همان قاعدهٔ `lib/core/vocab.test.ts`، اینجا هم صریح تکرار می‌شود چون میز
  // متنِ کاربرپسندِ تازه می‌سازد.
  for (const [name, source] of Object.entries({ PAGE, BOARD, CONTRACTS })) {
    assert.doesNotMatch(codeOnly(source), /توصیه|سیگنالِ خرید|پیشنهادِ خرید/,
      `${name} uses advisory wording`);
  }
});

test("the route fabricates nothing when a source is missing", () => {
  // منبعِ ناموجود باید `available: false` بدهد، نه `count: 0`.
  assert.match(ROUTE, /available:\s*false/);
  assert.match(ROUTE, /classifyQueryError/);
  assert.match(ROUTE, /missing_table/);
  // هیچ مقدارِ جایگزینِ عددی نباید در مسیرِ خطا نوشته شود.
  assert.doesNotMatch(ROUTE, /count:\s*Math\.|Math\.random|\|\|\s*0\b/);
});

test("classification lives in the contract module, not in the route", () => {
  // «یک موتور، چند نما» — روت فقط جمع‌آوری می‌کند.
  assert.match(ROUTE, /from "@\/lib\/desk\/contracts"/);
  assert.doesNotMatch(ROUTE, /function classifyPanel|function rollupDeskState/);
});

test("the desk performs no financial computation of its own", () => {
  // اگر روزی محاسبه لازم شد، جایش `lib/core/` است. حضورِ این الگوها یعنی
  // میز دارد به موتورِ دوم تبدیل می‌شود.
  assert.doesNotMatch(ROUTE, /\.reduce\([^)]*price|weightedAverage|computeRegime|runAllocation/i);
});

test("the board handles loading, failure and empty without going blank", () => {
  assert.match(BOARD, /در حالِ خواندن/);
  assert.match(BOARD, /میز خوانده نشد/);
  assert.match(BOARD, /تلاشِ دوباره/);
  // مقدارِ ناموجود باید «نامعلوم» باشد، نه صفر یا خط تیره.
  assert.match(BOARD, /metric\.value === null \? "نامعلوم"/);
});

test("the board styles only from design tokens", () => {
  const rawColors = BOARD.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.deepEqual(rawColors, [], `raw colors found: ${rawColors.join(", ")}`);
  assert.match(BOARD, /var\(--/);
});

test("the board is responsive and keeps a single-column mobile layout", () => {
  assert.match(BOARD, /grid-cols-1/);
  assert.match(BOARD, /md:grid-cols-2/);
  assert.match(BOARD, /flex-wrap/);
});

test("persian digits go through the shared formatter, never hand-rolled", () => {
  assert.match(BOARD, /toPersianDigits/);
  assert.doesNotMatch(BOARD, /\[.?[۰-۹].?\]|replace\(\/\[0-9\]/);
});

test("no existing admin destination was removed from the navigation", () => {
  const shell = read("components", "admin", "AdminShell.tsx");
  for (const href of [
    "/admin", "/admin/users", "/admin/manage?tab=portfolio", "/admin/manage?tab=payments",
    "/admin/manage?tab=waitlist", "/admin/announcements", "/admin/notes", "/admin/analyses",
    "/admin/content", "/admin/webinars", "/admin/radar", "/admin/fx", "/admin/health",
  ]) {
    assert.ok(shell.includes(`"${href}"`), `navigation lost ${href}`);
  }
  assert.ok(shell.includes('"/admin/desk"'), "the desk is not reachable from the navigation");
});
