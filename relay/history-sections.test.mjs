import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * گاردهای نگهداشتِ `ir_market_history` در رله — `P2-DATA-QUOTA-RECOVERY-001`.
 *
 * رله فرایندِ جداگانه‌ای روی لیاراست و اینجا اجرا نمی‌شود، پس این تست‌ها
 * ساختاری‌اند. آنچه می‌بندند دقیقاً همان دو نقصی است که اندازه‌گیری نشان داد:
 * نوشتنِ بخش‌های بی‌خواننده، و رد کردنِ بی‌صدای بخشِ غایب.
 */
const SRC = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");

const codeOnly = SRC.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
  })
  .join("\n");

test("the written sections are configurable and default to the consumed pair", () => {
  assert.match(codeOnly, /IR_HISTORY_SECTIONS/);
  assert.match(codeOnly, /process\.env\.IR_HISTORY_SECTIONS \|\| "gold,currency"/);
});

test("the unread sections are no longer hard-coded into the write path", () => {
  // نقصِ اصلی: `const sections = ["gold","currency","funds","stocks"]`.
  assert.doesNotMatch(
    codeOnly,
    /sections\s*=\s*\[\s*"gold"\s*,\s*"currency"\s*,\s*"funds"\s*,\s*"stocks"\s*\]/,
    "چهار بخش دوباره ثابت‌کد شده‌اند"
  );
});

test("a section that the source did not return is recorded, not silently dropped", () => {
  // نسخهٔ قبل فقط filter می‌کرد؛ نبودِ داده از یک بخش هیچ اثری نمی‌گذاشت.
  assert.match(codeOnly, /historyMissingSections/);
  assert.match(codeOnly, /missing sections/);
  assert.match(codeOnly, /historySections:\s*\{\s*written:/);
});

test("retention stays configurable and its status stays observable", () => {
  assert.match(codeOnly, /HISTORY_RETENTION_DAYS\s*=\s*Number\(process\.env\.HISTORY_RETENTION_DAYS/);
  assert.match(codeOnly, /historyPrune:\s*pruneStatus/);
});

test("the source-side sub-ticker filter is still applied before symbol_history", () => {
  // قاعدهٔ Z1. اندازه‌گیری تأیید کرد که امروز صفر ردیفِ آلوده هست؛ این گارد
  // نمی‌گذارد آن دستاورد بی‌صدا برگردد.
  assert.match(codeOnly, /if \(isSubTicker\(r\.id\) \|\| isRightsIssue\(r\.id\)\) continue;/);
});

test("nothing in the relay deletes from symbol_history", () => {
  // حذف از این جدول فقط با migrationِ مصوب مجاز است (قاعدهٔ D1) و تریگرِ
  // `trg_symbol_history_immutable` هم جلویش را می‌گیرد. رله نباید حتی تلاش کند.
  const deletes = [...codeOnly.matchAll(/method:\s*"DELETE"/g)];
  assert.equal(deletes.length, 1, "تعدادِ مسیرهای DELETE در رله عوض شده");
  assert.doesNotMatch(codeOnly, /symbol_history\?[^\n]*\n?[^\n]*method:\s*"DELETE"/);
  assert.match(codeOnly, /ir_market_history\?captured_at=lt\./);
});
