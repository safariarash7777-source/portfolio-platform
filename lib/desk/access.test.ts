import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردهای **ایستای** میز — `G3-002` / `P2-G3-MEGA-004`.
 *
 * ── این فایل چه چیزی را اثبات می‌کند و چه چیزی را نه ────────────────────
 * رفتارِ مجوز و طبقه‌بندی حالا در `lib/desk/service.test.ts` **واقعاً اجرا
 * می‌شود** (۴۰۱، ۴۰۳، نساختنِ خواننده در مسیرِ ردشده، چهار حالت).
 * پس این فایل دیگر وانمود نمی‌کند تستِ دسترسی است.
 *
 * آنچه اینجا می‌ماند فقط چیزهایی است که **ذاتاً ایستا**اند: نبودِ وابستگیِ
 * مدل، نبودِ واژگانِ ممنوع، توکن‌بودنِ رنگ، حفظِ مقصدهای موجود، و اینکه
 * مسیرِ HTTP منطق را به لایهٔ تست‌پذیر واگذار کرده باشد.
 *
 * ⚠️ هیچ‌کدام از این‌ها — و هیچ‌کدام از تست‌های رفتاری — جای **تستِ HTTPِ
 * احرازشده با Supabaseِ زنده** یا **راستی‌آزماییِ زمانِ اجرا روی Production**
 * را نمی‌گیرد. هر سه لازم‌اند.
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
const SERVICE = read("lib", "desk", "service.ts");
const SOURCES = read("lib", "desk", "sources.ts");

test("the route delegates authorization and aggregation to the testable layer", () => {
  // اگر منطق دوباره داخلِ route handler برگردد، تست‌های رفتاری بی‌اثر
  // می‌شوند بدونِ اینکه قرمز شوند — پس همین‌جا بسته می‌شود.
  assert.match(ROUTE, /from "@\/lib\/desk\/service"/);
  assert.match(ROUTE, /buildDesk\(/);
  assert.doesNotMatch(codeOnly(ROUTE), /role\s*!==\s*"admin"/,
    "بررسیِ نقش باید در لایهٔ تست‌پذیر باشد، نه در route handler");
});

test("the desk reads through RLS, never around it", () => {
  // میز روی Production ۵۰۰ می‌داد چون خواندنش به `SUPABASE_SERVICE_ROLE_KEY`
  // گره خورده بود — کلیدی که هیچ‌کدام از این جدول‌ها لازمش ندارند. حالا با
  // کلاینتِ نشست می‌خواند، پس RLS گیتِ دومِ واقعی است: اگر گیتِ نقش در
  // `buildDesk` روزی خراب شود، دیتابیس همچنان جلوی غیرادمین را می‌گیرد.
  assert.doesNotMatch(ROUTE, /createAdminClient|supabase\/admin/,
    "میز دوباره به کلاینتِ service-role وصل شده و RLS را دور می‌زند");
  assert.match(ROUTE, /from "@\/lib\/supabase\/server"/);
});

test("the reader is built lazily, never before authorization", () => {
  // `createReader` یک factory است؛ اگر به یک نمونهٔ ساخته‌شده تبدیل شود،
  // خواندن پیش از مجوز آغاز می‌شود و تستِ رفتاری هم دیگر معنا نمی‌دهد.
  assert.match(ROUTE, /createReader:\s*\(\)\s*=>\s*supabaseReader\(/);
  const moduleScope = ROUTE.slice(0, ROUTE.indexOf("function supabaseReader"));
  assert.doesNotMatch(moduleScope, /supabaseReader\(|createClient\(/,
    "خواننده در سطحِ ماژول ساخته شده");
});

test("the admin view is gated independently of the route, not instead of it", () => {
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
  for (const [name, source] of Object.entries({ ROUTE, PAGE, BOARD, CONTRACTS, SERVICE, SOURCES })) {
    assert.doesNotMatch(codeOnly(source), /openai|anthropic|\bllm\b|gpt-|completions/i,
      `${name} reaches a model`);
  }
});

test("the desk never emits the forbidden advisory vocabulary", () => {
  // همان قاعدهٔ `lib/core/vocab.test.ts`، اینجا هم صریح تکرار می‌شود چون میز
  // متنِ کاربرپسندِ تازه می‌سازد.
  for (const [name, source] of Object.entries({ PAGE, BOARD, CONTRACTS, SERVICE, SOURCES })) {
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
  assert.doesNotMatch(ROUTE, /count:\s*Math\.|Math\.random/);
});

test("classification lives in the contract module, not in the route", () => {
  // «یک موتور، چند نما» — روت فقط جمع‌آوری می‌کند.
  assert.match(SERVICE, /from "@\/lib\/desk\/contracts"/);
  assert.doesNotMatch(ROUTE, /function classifySource|function rollupDeskState|function worstState/);
});

test("the desk performs no financial computation of its own", () => {
  // اگر روزی محاسبه لازم شد، جایش `lib/core/` است. حضورِ این الگوها یعنی
  // میز دارد به موتورِ دوم تبدیل می‌شود.
  for (const source of [ROUTE, SERVICE, CONTRACTS, SOURCES]) {
    assert.doesNotMatch(source, /\.reduce\([^)]*price|weightedAverage|computeRegime|runAllocation/i);
  }
});

test("the board handles loading, failure and empty without going blank", () => {
  assert.match(BOARD, /در حالِ خواندن/);
  assert.match(BOARD, /میز خوانده نشد/);
  assert.match(BOARD, /تلاشِ دوباره/);
  // مقدارِ ناموجود باید «نامعلوم» باشد، نه صفر یا خط تیره.
  assert.match(BOARD, /source\.count === null \? "نامعلوم"/);
});

test("the board styles only from design tokens", () => {
  const rawColors = BOARD.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.deepEqual(rawColors, [], `raw colors found: ${rawColors.join(", ")}`);
  assert.match(BOARD, /var\(--/);
});

/**
 * توکنی که تعریف نشده رنگ را از والد به ارث می‌برد، پس **تصادفاً** درست
 * به‌نظر می‌رسد و هیچ‌وقت لو نمی‌رود. میز `var(--text-1)` را به‌ارث برده بود
 * که در `globals.css` اصلاً وجود ندارد.
 */
test("every design token the board references is actually defined", () => {
  const css = read("app", "globals.css");
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  const used = new Set([...BOARD.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((m) => m[1]));
  const missing = [...used].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `توکنِ تعریف‌نشده: ${missing.join(", ")}`);
});

/**
 * تمِ تیره فقط `--text*`, `--surface*`, `--line*` و `--bg` را بازنویسی
 * می‌کند — نه `--navy*` را. پس متنِ اصلی هرگز نباید با توکنِ navy رنگ شود،
 * وگرنه روی پس‌زمینهٔ تیره تقریباً نامرئی می‌شود.
 */
test("no body or heading text is coloured with a token the dark theme does not override", () => {
  const darkBlock = read("app", "globals.css").split(".dark {")[1]?.split("}")[0] ?? "";
  assert.ok(darkBlock.includes("--text:"), "پیش‌فرضِ این کنترل نادرست است");
  assert.ok(!darkBlock.includes("--navy-deep:"), "پیش‌فرضِ این کنترل نادرست است");
  assert.doesNotMatch(BOARD, /color:\s*"var\(--navy(-deep)?\)"/,
    "متن با توکنِ navy رنگ شده که تمِ تیره بازنویسی‌اش نمی‌کند");
  assert.doesNotMatch(PAGE, /color:\s*"var\(--navy(-deep)?\)"/,
    "متن با توکنِ navy رنگ شده که تمِ تیره بازنویسی‌اش نمی‌کند");
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

test("the board shows each source's own state, not one merged verdict", () => {
  // اگر ردیف‌های per-source حذف شوند، منبعِ مرده دوباره پشتِ همسایه پنهان
  // می‌شود — همان نقصی که این مأموریت بست.
  assert.match(BOARD, /panel\.sources\.map/);
  assert.match(BOARD, /<StateBadge state=\{source\.state\}/);
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

test("the desk does not touch any public page owned by another track", () => {
  // مرزِ کاری با Manus (PR #102): میز فقط داخلِ /admin است.
  for (const source of [ROUTE, PAGE, BOARD, SERVICE, SOURCES]) {
    assert.doesNotMatch(source, /components\/landing|components\/layout\/Navbar|components\/layout\/Footer/);
  }
});
