import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────
 * `package.json` فایل‌های تست را **یک‌به‌یک** نام می‌برد. یعنی یک فایلِ تستِ
 * تازه تا وقتی دستی اضافه نشود اجرا **نمی‌شود** — و بدترین بخشش این است که
 * هیچ چیزی قرمز نمی‌شود. همین حالا سرِ `lib/desk/clock.test.ts` اتفاق افتاد:
 * هفت تست نوشته شد، `npm run test:core` سبز ماند، و شمارشِ کل تکان نخورد.
 *
 * تستی که اجرا نمی‌شود از نبودنش بدتر است: جای خالی را پر می‌کند و کسی
 * دیگر سراغش نمی‌رود. این دقیقاً همان «سبزِ کسب‌نشده‌ای» است که کلِ Wave 8
 * دربارهٔ آن است، فقط یک لایه بالاتر — این‌بار در خودِ ابزارِ سنجش.
 */

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const ALL_SCRIPTS = Object.values(pkg.scripts).join(" ");

/** همهٔ `*.test.ts`های زیرِ یک پوشه، به‌صورتِ بازگشتی. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...testFiles(rel));
    else if (entry.name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}

test("every test file under lib/ is registered in an npm script and actually runs", () => {
  const orphans = testFiles("lib").filter((f) => !ALL_SCRIPTS.includes(f));
  assert.deepEqual(
    orphans,
    [],
    `این فایل‌های تست در هیچ اسکریپتی ثبت نشده‌اند، پس هرگز اجرا نمی‌شوند:\n  ${orphans.join("\n  ")}`
  );
});

/**
 * کنترلِ شکست‌پذیری: خودِ این سنجه باید بتواند قرمز شود. اگر `testFiles`
 * روزی چیزی پیدا نکند، تستِ بالا برای همیشه سبز می‌ماند و هیچ چیزی
 * نمی‌گوید — همان دامِ آشنا، یک پله عمیق‌تر.
 */
test("the orphan check is looking at real files and can fail", () => {
  const found = testFiles("lib");
  assert.ok(found.length > 40, `فقط ${found.length} فایلِ تست پیدا شد — پویش درست کار نمی‌کند`);
  assert.ok(found.includes("lib/desk/clock.test.ts"), "فایلِ شناخته‌شده در پویش نیست");
  assert.ok(
    !ALL_SCRIPTS.includes("lib/desk/this-file-does-not-exist.test.ts"),
    "سنجهٔ ثبت‌شدن باید بتواند «ثبت نشده» را تشخیص دهد"
  );
});
