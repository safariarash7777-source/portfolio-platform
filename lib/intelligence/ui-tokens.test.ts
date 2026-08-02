import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * گاردهای ایستای توکنِ رنگ برای صفحهٔ هوشمندی — `G3-003`.
 *
 * ── درسی که این فایل نگه می‌دارد ────────────────────────────────────────
 * `B-040` گفت متنِ `--navy-deep` روی تمِ تیره نامرئی می‌شود، چون بلوکِ `.dark`
 * فقط توکن‌های پس‌زمینه، خط و متن را بازنویسی می‌کند. جهتِ **معکوسِ**
 * همان تله هم وجود دارد و در این مأموریت با اسکرین‌شاتِ واقعی دیده شد:
 *
 *   `--gold-tint` (#F5E6B8) در تمِ تیره **بازنویسی نمی‌شود** و روشن می‌ماند،
 *   ولی `--text-2` روشن می‌شود (#CBD5E1). نتیجه: روشن روی روشن — بنری که در
 *   تمِ روشن خوانا بود، در تمِ تیره عملاً ناخوانا می‌شود.
 *
 * قاعده‌ای که از این درس می‌آید: **پس‌زمینهٔ بازنویسی‌نشده باید متنِ
 * بازنویسی‌نشده داشته باشد.** روی `--gold-tint` فقط `--navy-deep` یا `--gold`
 * مجاز است، نه هیچ‌کدام از `--text*`.
 */

const ROOT = process.cwd();
const FILES = [
  join(ROOT, "components", "admin", "IntelligenceDesk.tsx"),
  join(ROOT, "app", "(protected)", "admin", "intelligence", "page.tsx"),
];

const sources = FILES.map((f) => ({ file: f, code: readFileSync(f, "utf8") }));

/** جفتِ پس‌زمینه/متن را از یک شیءِ `style` بیرون می‌کشد. */
function stylePairs(code: string): Array<{ bg: string; fg: string; at: string }> {
  const pairs: Array<{ bg: string; fg: string; at: string }> = [];
  const re = /background:\s*"var\((--[a-z0-9-]+)\)"\s*,\s*color:\s*"var\((--[a-z0-9-]+)\)"/g;
  for (const m of code.matchAll(re)) {
    pairs.push({ bg: m[1], fg: m[2], at: m[0] });
  }
  return pairs;
}

/** توکن‌هایی که بلوکِ `.dark` بازنویسی می‌کند. */
const THEME_AWARE = new Set(["--text", "--text-2", "--text-3", "--bg", "--surface", "--surface-2", "--line", "--line-strong"]);
/** پس‌زمینه‌هایی که در تمِ تیره **ثابت** می‌مانند. */
const THEME_FIXED_BG = new Set(["--gold-tint", "--navy", "--navy-deep"]);

test("a theme-fixed background never carries theme-aware text", () => {
  for (const { file, code } of sources) {
    for (const p of stylePairs(code)) {
      if (THEME_FIXED_BG.has(p.bg) && THEME_AWARE.has(p.fg)) {
        assert.fail(
          `${file}: پس‌زمینهٔ ثابتِ ${p.bg} با متنِ تم‌آگاهِ ${p.fg} — در یکی از دو تم ناخوانا می‌شود. ${p.at}`
        );
      }
    }
  }
});

test("the guard actually inspects some style pairs — it is not vacuously green", () => {
  const total = sources.reduce((n, s) => n + stylePairs(s.code).length, 0);
  assert.ok(total >= 5, `فقط ${total} جفتِ سبک پیدا شد؛ الگوی استخراج احتمالاً شکسته است`);
});

test("headings use --text, never --navy-deep, which the dark theme does not override (B-040)", () => {
  for (const { file, code } of sources) {
    const headings = code.match(/<h[1-3][^>]*style=\{\{[^}]*\}\}/g) ?? [];
    for (const h of headings) {
      assert.doesNotMatch(h, /--navy/, `${file}: عنوان با --navy رنگ شده — در تمِ تیره نامرئی می‌شود`);
    }
  }
});

test("no raw hex or named colour is written outside the token system", () => {
  for (const { file, code } of sources) {
    const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
    // rgba(...) برای شفافیتِ حالت‌های موفق/خطا مجاز است چون معادلِ توکنی ندارد.
    const hex = withoutComments.match(/(?:color|background):\s*"#[0-9a-f]{3,8}"/gi) ?? [];
    assert.deepEqual(hex, [], `${file}: رنگِ خام خارج از توکن: ${hex.join(" ")}`);
  }
});

/** هیچ دکمهٔ انتشارِ عمومی در این نما ساخته نمی‌شود — قاعدهٔ سختِ مأموریت. */
test("the desk builds no public publication control", () => {
  const desk = sources[0].code;
  assert.doesNotMatch(desk, /"published"/, "مقصدِ published نباید از UI فراخوانی شود");
  assert.doesNotMatch(desk, /انتشار عمومی\s*<\/button>|>\s*انتشار\s*</, "دکمهٔ انتشار پیدا شد");
});
