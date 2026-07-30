import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردِ صداقتِ زمان‌بندی — `G2-007`.
 *
 * `B-016` و `B-027` هر دو یک شکل داشتند: متنی در کد یا UI یک دورهٔ زمانی ادعا
 * می‌کرد که `vercel.json` تأییدش نمی‌کرد. هر دو دستی پیدا شدند، و دومی
 * (`Capabilities.tsx`) اصلاً در ممیزیِ اول دیده نشد.
 *
 * این تست همان درفت را ماشینی می‌کند. **`vercel.json` منبعِ حقیقتِ زمان‌بندی
 * است**؛ هر ادعای متناقض باید اینجا بشکند، نه در تولید.
 *
 * چهار چیزِ متفاوت که مدام با هم اشتباه می‌شوند:
 *   ۱. **عمرِ کش** — `CACHE_MS`؛ چقدر دادهٔ قبلی دوباره استفاده می‌شود
 *   ۲. **تازه‌سازیِ ترافیک‌محور** — فقط وقتی درخواستی برسد؛ هیچ تضمینی ندارد
 *   ۳. **Cronِ زمان‌بندی‌شده** — تنها مسیرِ تضمین‌شده
 *   ۴. **آخرین اجرای موفقِ واقعی** — فقط از `/admin/health`، نه از این فایل
 *
 * این تست فقط ۳ را در برابر ادعاهای متن می‌سنجد. **دربارهٔ ۴ هیچ ادعایی
 * نمی‌کند** — سبزبودنِ این تست به‌معنای اجراشدنِ cron نیست.
 */

const ROOT = process.cwd();

type Cron = { path: string; schedule: string };

function crons(): Cron[] {
  return JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")).crons;
}

/** آیا این cron حداکثر روزی چند بار اجرا می‌شود؟ (فیلدِ دقیقه عددِ ثابت است) */
function isDailyOrRarer(schedule: string): boolean {
  const [minute, hour] = schedule.split(/\s+/);
  return !minute.includes("*") && !minute.includes("/") && !hour.includes("*") && !hour.includes("/");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ── ۱) هر cron باید روتِ واقعی داشته باشد ───────────────────────────────────

test("هر مسیرِ cron در vercel.json یک route handlerِ واقعی دارد", () => {
  for (const c of crons()) {
    const route = join(ROOT, "app", c.path, "route.ts");
    assert.ok(existsSync(route), `مسیرِ cron «${c.path}» روتی ندارد: ${route}`);
  }
});

test("هیچ روتِ cronی بدونِ زمان‌بندی رها نشده", () => {
  const scheduled = new Set(crons().map((c) => c.path));
  const dir = join(ROOT, "app", "api", "cron");
  for (const f of walk(dir)) {
    const rel = "/" + f.slice(ROOT.length + 1).replace(/^app\//, "").replace(/\/route\.ts$/, "");
    assert.ok(
      scheduled.has(rel),
      `روتِ cron «${rel}» در vercel.json زمان‌بندی نشده — یا اضافه‌اش کن یا حذفش کن`
    );
  }
});

// ── ۲) کامنتِ روت با زمان‌بندیِ واقعی نخوانَد ──────────────────────────────

test("کامنتِ روتِ cron دورهٔ زیرروزانه ادعا نمی‌کند وقتی cron روزانه است", () => {
  // B-016 دقیقاً همین بود: کامنت «هر ۵ دقیقه» می‌گفت و vercel.json روزانه بود.
  const subDaily = /هر\s*[۰-۹0-9]+\s*دقیقه|every\s*\d+\s*minutes?/;
  for (const c of crons()) {
    if (!isDailyOrRarer(c.schedule)) continue;
    const src = readFileSync(join(ROOT, "app", c.path, "route.ts"), "utf8");
    const header = src.split("export async function")[0];
    const offending = header
      .split("\n")
      .filter((l) => subDaily.test(l) && !/قبلی|پیش‌تر|نادرست|اشتباه|بود که/.test(l));
    assert.deepEqual(
      offending,
      [],
      `«${c.path}» با زمان‌بندیِ «${c.schedule}» اجرا می‌شود ولی کامنتش دورهٔ دقیقه‌ای ادعا می‌کند`
    );
  }
});

// ── ۳) UIِ عمومی ادعای پایشِ متناقض نکند ────────────────────────────────────

test("کامپوننت‌های صفحهٔ اول ادعای «پایش هر N دقیقه» نمی‌کنند", () => {
  // `B-027` در دو فایل بود و ممیزیِ اول فقط یکی را دید. این گارد هر دو را
  // می‌گیرد و از برگشتنشان جلو می‌گیرد.
  //
  // فقط ادعای **پایش/هشدار** ممنوع است، نه هر عددی: «کشِ ۵دقیقه» توصیفِ درستِ
  // یک کش است و «قیمتِ لحظه‌ای» ادعای رله است، نه ادعای cron.
  const alertsCron = crons().find((c) => c.path.includes("alerts"));
  assert.ok(alertsCron, "cronِ alerts در vercel.json نیست");
  if (!isDailyOrRarer(alertsCron.schedule)) return; // زمان‌بندی متراکم شد → این گارد بی‌موضوع است

  const claim = /هر\s*[۰-۹0-9]+\s*دقیقه[^\n]{0,40}(پایش|هشدار|بررسی)/;
  const bad: string[] = [];
  for (const f of walk(join(ROOT, "components", "landing"))) {
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      // خطِ کامنت مجاز است — آنجا داریم دربارهٔ خودِ اشتباه توضیح می‌دهیم.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (claim.test(line)) bad.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    `cronِ هشدار «${alertsCron.schedule}» است؛ این خطوط دورهٔ دقیقه‌ای ادعا می‌کنند: ${bad.join(", ")}`
  );
});

// ── ۴) مرزِ کش از مرزِ cron جدا بماند ───────────────────────────────────────

test("عمرِ کشِ بازار با زمان‌بندیِ cron قاطی نشده", () => {
  const src = readFileSync(join(ROOT, "lib", "market.ts"), "utf8");
  const m = src.match(/const CACHE_MS = ([^;]+);/);
  assert.ok(m, "CACHE_MS در lib/market.ts پیدا نشد");
  // این عدد **عمرِ کش** است. اگر روزی به‌عنوانِ «دورهٔ پایش» بازتفسیر شود،
  // همان B-027 دوباره متولد می‌شود. مقدارش آزاد است؛ معنایش نه.
  assert.ok(/60 \* 1000/.test(m[1]), "قالبِ CACHE_MS عوض شده — معنایش را دوباره بررسی کن");
});
