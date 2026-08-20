#!/usr/bin/env node
//
// compare.mjs — مقایسهٔ **دوطرفهٔ** دو خروجیِ `inventory.sql`.
//
//   node scripts/backup/compare.mjs <source.txt> <restored.txt> [--report out.txt]
//
// خروجی: کدِ ۰ فقط وقتی دو فهرست **دقیقاً** یکی باشند.
//
// ── چرا یک فایلِ مشترک، نه دو پیاده‌سازی ─────────────────────────────────────
//
// نسخهٔ قبل منطقِ مقایسه را در bash و PowerShell **دو بار** داشت. هر تفاوتِ
// کوچک بینِ آن دو یعنی یکی از دو مسیر چیزی را می‌بیند که دیگری نمی‌بیند، و
// چون هر دو «سبز» می‌گویند، هیچ‌وقت معلوم نمی‌شود کدام درست است. حالا هر دو
// اسکریپت همین فایل را صدا می‌زنند. Node پیش‌نیازِ خودِ مخزن است، پس چیزی به
// پیش‌نیازها اضافه نمی‌شود.
//
// ── چرا دوطرفه ──────────────────────────────────────────────────────────────
//
// «هر چیزی که در مبدأ بود در مقصد هست» نصفِ سؤال است. شیءِ **اضافه** در مقصد
// هم یعنی بازگردانی همانی نیست که فکر می‌کنیم.

import { readFileSync, writeFileSync } from "node:fs";

const [, , sourcePath, restoredPath, ...rest] = process.argv;

if (!sourcePath || !restoredPath) {
  console.error("usage: compare.mjs <source.txt> <restored.txt> [--report out.txt]");
  process.exit(2);
}

const reportIndex = rest.indexOf("--report");
const reportPath = reportIndex >= 0 ? rest[reportIndex + 1] : null;

/**
 * `section|key|value` → Map(identity → value).
 *
 * برای بیشترِ بخش‌ها هویت `section|key` است و مقدار همان تعریف؛ این‌طور
 * «تعریفش عوض شد» جدا از «کلاً نیست» گزارش می‌شود.
 *
 * ⚠️ امتیازها استثنا هستند: یک جدول برای یک grantee چند privilege دارد، پس
 * `grant_table|public.payments` کلیدِ یکتا نیست. برای این بخش‌ها **کلِ خط**
 * هویت است. بدونِ این استثنا، دو ورودیِ متفاوت روی هم می‌افتادند و مقایسه
 * بی‌صدا چیزهایی را از قلم می‌انداخت.
 */
const MULTI_VALUED = /^grant_/;

function load(path) {
  const map = new Map();
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("|");
    if (parts.length < 3) continue;
    if (MULTI_VALUED.test(parts[0])) {
      map.set(trimmed, "");
    } else {
      map.set(`${parts[0]}|${parts[1]}`, parts.slice(2).join("|"));
    }
  }
  return map;
}

const source = load(sourcePath);
const restored = load(restoredPath);

const missing = []; // در مبدأ هست، در مقصد نیست
const extra = []; //   در مقصد هست، در مبدأ نیست
const changed = []; // در هر دو هست، مقدار فرق دارد

for (const [key, value] of source) {
  if (!restored.has(key)) missing.push(`${key} = ${value}`);
  else if (restored.get(key) !== value) {
    changed.push(`${key}\n      مبدأ:  ${value}\n      مقصد: ${restored.get(key)}`);
  }
}
for (const key of restored.keys()) {
  if (!source.has(key)) extra.push(`${key} = ${restored.get(key)}`);
}

const sectionsOf = (map) => {
  const counts = new Map();
  for (const key of map.keys()) {
    const section = key.split("|")[0];
    counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  return counts;
};

const lines = [];
const say = (text) => {
  lines.push(text);
  console.log(text);
};

say("── مقایسهٔ ساختار و داده ─────────────────────────────────────────────");
const sourceSections = sectionsOf(source);
for (const [section, count] of [...sourceSections].sort()) {
  const restoredCount = sectionsOf(restored).get(section) ?? 0;
  say(`  ${section.padEnd(16)} مبدأ ${String(count).padStart(6)}  مقصد ${String(restoredCount).padStart(6)}`);
}

const problems = missing.length + extra.length + changed.length;

if (missing.length) {
  say(`\n❌ ${missing.length} مورد در مقصد غایب است:`);
  for (const item of missing.slice(0, 40)) say(`    - ${item}`);
  if (missing.length > 40) say(`    … و ${missing.length - 40} مورد دیگر`);
}
if (extra.length) {
  say(`\n❌ ${extra.length} مورد در مقصد اضافه است:`);
  for (const item of extra.slice(0, 40)) say(`    + ${item}`);
  if (extra.length > 40) say(`    … و ${extra.length - 40} مورد دیگر`);
}
if (changed.length) {
  say(`\n❌ ${changed.length} مورد تعریفِ متفاوت دارد:`);
  for (const item of changed.slice(0, 40)) say(`    ~ ${item}`);
  if (changed.length > 40) say(`    … و ${changed.length - 40} مورد دیگر`);
}

if (problems === 0) {
  say(`\n✅ ${source.size} مورد بررسی شد · صفر اختلاف در هر دو جهت.`);
} else {
  say(`\n❌ ${problems} اختلاف. بکاپ قابلِ اتکا نیست.`);
}

if (reportPath) writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");

process.exit(problems === 0 ? 0 : 1);
