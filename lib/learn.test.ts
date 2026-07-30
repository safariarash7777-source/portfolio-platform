import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LESSONS, publishedLessons, hasPublishedLessons, getLesson } from "@/lib/learn";

/**
 * گاردِ صداقتِ ناحیهٔ یادگیری — `B-028` / `P2-G2-010`.
 *
 * قاعده: سرفصلِ بی‌متن **حذف نمی‌شود**، ولی مثلِ محتوای در دسترس هم رفتار
 * نمی‌کند. کارتِ کلیک‌پذیری که به صفحهٔ خالی می‌رسد — حتی با برچسبِ «به‌زودی» —
 * در عمل خوانده می‌شود «محتوا آماده است».
 *
 * این تست **نمی‌گوید** دروس باید منتشر نشوند؛ انتشار تصمیمِ آرش است. فقط
 * می‌گوید هر وضعیتی که هست، نمایش با آن بخوانَد.
 */

const ROOT = process.cwd();
const LIST_PAGE = readFileSync(join(ROOT, "app", "learn", "page.tsx"), "utf8");
const DETAIL_PAGE = readFileSync(join(ROOT, "app", "learn", "[slug]", "page.tsx"), "utf8");

test("هیچ سرفصلی حذف نشده — پیش‌نویس‌ها سرِ جایشان‌اند", () => {
  assert.equal(LESSONS.length, 6, "شش سرفصلِ SPEC باید باقی بمانند");
  for (const l of LESSONS) {
    assert.ok(l.slug && l.title && l.summary, `سرفصلِ ناقص: ${l.slug}`);
  }
});

test("publishedLessons دقیقاً همان‌هایی است که published دارند", () => {
  assert.deepEqual(
    publishedLessons().map((l) => l.slug),
    LESSONS.filter((l) => l.published).map((l) => l.slug)
  );
  assert.equal(hasPublishedLessons(), LESSONS.some((l) => l.published));
});

test("صفحهٔ فهرست فقط درسِ منتشرشده را لینک می‌کند", () => {
  // شرطِ لینک باید به `l.published` گره خورده باشد، نه بی‌قید.
  assert.match(
    LIST_PAGE,
    /l\.published\s*\?\s*\(\s*<Link/,
    "کارت باید فقط وقتی `published` است به <Link> تبدیل شود"
  );
  assert.match(LIST_PAGE, /aria-disabled="true"/, "کارتِ منتشرنشده باید صریحاً غیرفعال علامت بخورد");
});

test("درسِ منتشرنشده ایندکس نمی‌شود", () => {
  assert.match(
    DETAIL_PAGE,
    /robots:\s*lesson\.published\s*\?\s*undefined\s*:\s*\{\s*index:\s*false/,
    "صفحهٔ درسِ منتشرنشده باید noindex باشد"
  );
});

test("وقتی هیچ درسی منتشر نشده، متنِ سکشن این را صریح می‌گوید", () => {
  if (hasPublishedLessons()) return; // با انتشار، این بند بی‌موضوع می‌شود
  assert.match(LIST_PAGE, /هنوز هیچ درسی منتشر نشده/);
  assert.match(LIST_PAGE, /!hasPublishedLessons\(\)/, "متن باید به وضعیتِ واقعی گره خورده باشد، نه ثابت");
});

test("مسیرِ درس هنوز کار می‌کند — چیزی پاک نشده", () => {
  for (const l of LESSONS) {
    assert.ok(getLesson(l.slug), `درسِ ${l.slug} باید هنوز قابلِ بازیابی باشد`);
  }
  assert.equal(getLesson("no-such-lesson"), null);
});
