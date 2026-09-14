#!/usr/bin/env node
//
// compare.mjs — مقایسهٔ **دوطرفهٔ** دو خروجیِ `inventory.sql`.
//
//   node scripts/backup/compare.mjs <source.txt> <restored.txt> \
//        [--source-after <after.txt>] [--report out.txt]
//
// کدِ خروجی — **سه حالت، نه دو**:
//   ۰ → ساختار تأیید شد **و** همهٔ شمارش‌ها دقیقاً برابر بودند.
//   ۲ → ساختار تأیید شد، ولی بخشی از داده **تأییدنشده** ماند (رجوع به
//       «چرا drift اثبات نیست»). این PASS **نیست**.
//   ۱ → شکست.
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
//
// ── چرا `--source-after` وجود دارد ──────────────────────────────────────────
//
// اثرِ انگشتِ مبدأ **پیش از** dump خوانده می‌شود و dump چند دقیقه طول می‌کشد.
// Production در همان چند دقیقه می‌نویسد: رله هر ۵ دقیقه اسنپ‌شات می‌گذارد،
// `symbol_history` روزانه بیش از هزار ردیف می‌گیرد، کدال مدام درج می‌کند. پس
// فایلِ بازگردانی‌شده **بیشتر** ردیف دارد از عددی که پیش از dump ثبت شده — و
// مقایسهٔ سخت‌گیرانه یک بکاپِ کاملاً سالم را مردود می‌کند.
//
// این بدترین نوع شکست است: «بکاپ خراب است» در حالی که فقط دیتابیس زنده بوده.
// اپراتور یا بکاپ را دور می‌اندازد، یا بدتر، یاد می‌گیرد این مقایسه را جدی
// نگیرد.
//
// راهِ حل **اعلام‌کردن** نیست، **اندازه‌گیری** است: فهرست دو بار از مبدأ
// خوانده می‌شود، یکی پیش از dump و یکی پس از آن. هر جدولی که بینِ آن دو
// تکان خورده، ثابت شده که در همان پنجره نوشته می‌شده؛ برای همان جدول‌ها
// عددِ مقصد اگر **داخلِ همان بازه** باشد پذیرفته می‌شود و به‌عنوانِ `drift`
// گزارش می‌شود — دیده‌شده، نه نادیده‌گرفته.
//
// بیرونِ بازه همچنان شکست است. مخصوصاً عددِ **کمتر** از کمینهٔ بازه: آن
// دیگر «دیتابیس زنده بود» نیست، آن یعنی داده از دست رفته.
//
// ── ⚠️ چرا drift «اثبات» نیست، فقط «شاهد» است ───────────────────────────────
//
// نسخهٔ قبلِ همین فایل عددِ داخلِ بازه را **قبول** می‌کرد و کدِ ۰ می‌داد. آن
// غلط بود و بازبینیِ مستقل درست گرفت: بازه فقط می‌گوید «این جدول در آن پنجره
// زنده بوده»، نه «آنچه بازگردانی شد همان چیزی است که در dump بود».
//
// یک بکاپِ **ناقص** هم می‌تواند عددی داخلِ همان بازه بدهد. و بدتر: شمارشِ
// ردیف اصلاً محتوا را نمی‌بیند — تغییرِ مقدارِ یک ستون، یا یک درج و یک حذفِ
// هم‌زمان، عدد را **دست‌نخورده** می‌گذارد. پس حتی برابریِ دقیقِ شمارش هم
// «دادهٔ یکسان» را ثابت نمی‌کند؛ فقط «تعدادِ یکسان» را.
//
// اثباتِ واقعی یک **snapshotِ مشترک** می‌خواهد: فهرستِ مبدأ باید در همان
// snapshotی خوانده شود که dump از آن گرفته شده. `pg_dump --snapshot=<id>`
// این را پشتیبانی می‌کند (بررسی شد: `pg_dump 16.13 --help`)، ولی عبورِ این
// پرچم از `supabase db dump` **از این محیط قابلِ راستی‌آزمایی نبود** — CLI
// اینجا نصب نیست و شبکه‌اش بسته است. پس آن مسیر «ممکن نیست» نوشته نمی‌شود،
// **«نامشخص»** نوشته می‌شود.
//
// تا آن روز این فایل چهار وضعیت را **جدا** گزارش می‌کند و تأییدنشده را به
// PASSِ کامل تبدیل نمی‌کند.
//
// جدول‌هایی که بینِ دو خواندن تکان نخورده‌اند همچنان **برابریِ دقیق** لازم
// دارند، و کلِ بخش‌های ساختاری (ستون، قید، ایندکس، تابع، سیاست، امتیاز،
// تریگر) دست‌نخورده و سخت‌گیرانه می‌مانند. زنده‌بودنِ دیتابیس دربارهٔ
// **ساختار** هیچ عذری نمی‌سازد.

import { readFileSync, writeFileSync } from "node:fs";

const [, , sourcePath, restoredPath, ...rest] = process.argv;

if (!sourcePath || !restoredPath) {
  console.error("usage: compare.mjs <source.txt> <restored.txt> [--report out.txt]");
  process.exit(2);
}

const reportIndex = rest.indexOf("--report");
const reportPath = reportIndex >= 0 ? rest[reportIndex + 1] : null;

const afterIndex = rest.indexOf("--source-after");
const sourceAfterPath = afterIndex >= 0 ? rest[afterIndex + 1] : null;

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
const sourceAfter = sourceAfterPath ? load(sourceAfterPath) : null;

const missing = []; // در مبدأ هست، در مقصد نیست
const extra = []; //   در مقصد هست، در مبدأ نیست
const changed = []; // در هر دو هست، مقدار فرق دارد
const drift = []; //   شمارشِ یک جدولِ زنده، داخلِ بازهٔ اندازه‌گیری‌شده

/** فقط شمارشِ ردیف پنجره می‌گیرد؛ هیچ بخشِ ساختاری‌ای نه. */
const isRowCount = (key) => key.startsWith("rowcount|");

/**
 * بازهٔ مجاز برای یک جدول: `null` یعنی پنجره‌ای اندازه‌گیری نشده و برابریِ
 * دقیق لازم است.
 */
function window(key, before) {
  if (!sourceAfter || !isRowCount(key)) return null;
  const after = sourceAfter.get(key);
  if (after === undefined) return null;
  const a = Number(before);
  const b = Number(after);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

for (const [key, value] of source) {
  if (!restored.has(key)) {
    missing.push(`${key} = ${value}`);
    continue;
  }
  const got = restored.get(key);
  if (got === value) continue;

  const win = window(key, value);
  const n = Number(got);
  if (win && Number.isFinite(n) && n >= win.lo && n <= win.hi) {
    drift.push(`${key}: ${value} → ${got} (پنجرهٔ اندازه‌گیری‌شده ${win.lo}..${win.hi})`);
    continue;
  }
  const note = win
    ? `\n      پنجرهٔ زندهٔ اندازه‌گیری‌شده: ${win.lo}..${win.hi} — مقصد بیرونِ آن است`
    : "";
  changed.push(`${key}\n      مبدأ:  ${value}\n      مقصد: ${got}${note}`);
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

if (drift.length) {
  say(`\n⚠️ ${drift.length} جدول حینِ بکاپ نوشته شده — شمارشش **تأیید نشد**:`);
  for (const item of drift.slice(0, 40)) say(`    ~ ${item}`);
  if (drift.length > 40) say(`    … و ${drift.length - 40} مورد دیگر`);
}

/* ── چهار وضعیتِ جدا ──────────────────────────────────────────────────────── */

const structureOk = missing.length + extra.length + changed.length === 0;
const dataVerified = structureOk && drift.length === 0;

say("\n── وضعیت‌ها، جدا از هم ───────────────────────────────────────────");
say(`  restore                  : خارج از دامنهٔ این فایل (کدِ خروجیِ psql)`);
say(`  ساختار بررسی‌شده           : ${structureOk ? "✅ تأیید شد" : "❌ شکست"}`);
say(`  تطبیقِ شمارشِ ردیف‌ها        : ${
  !structureOk ? "—" : drift.length === 0 ? "✅ برابریِ دقیق" : `⚠️ ${drift.length} جدول تأییدنشده`
}`);
say(`  تطبیق با snapshotِ مشترک   : ❌ انجام نشد — عبورِ \`--snapshot\` از supabase CLI نامشخص است`);

say(
  "\n  محدودهٔ تضمین: شمارشِ ردیف **محتوا را نمی‌بیند**. تغییرِ مقدارِ یک ستون،" +
  "\n  یا یک درج و یک حذفِ هم‌زمان، عدد را دست‌نخورده می‌گذارد. حتی برابریِ" +
  "\n  دقیقِ شمارش «دادهٔ یکسان» را اثبات نمی‌کند — «تعدادِ یکسان» را می‌گوید." +
  "\n  sha256ِ فایل‌ها هم فقط تمامیتِ **همان فایل** را نشان می‌دهد، نه" +
  "\n  کامل‌بودنِ دادهٔ مبدأ.",
);

if (!structureOk) {
  say(`\n❌ ${problems} اختلافِ ساختاری/شمارشی. بکاپ قابلِ اتکا نیست.`);
} else if (!dataVerified) {
  say(
    `\n⚠️ PARTIAL — ساختار تأیید شد و بازگردانی کار کرد، ولی برابریِ دادهٔ` +
    `\n   ${drift.length} جدول **اثبات نشد**. این PASS نیست و به‌تنهایی مجوزِ` +
    `\n   اجرای migration روی Production نمی‌دهد.`,
  );
} else {
  say(`\n✅ ${source.size} مورد بررسی شد · ساختار و شمارشِ همهٔ جدول‌ها دقیقاً برابر.`);
}

if (reportPath) writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");

// ۰ تأییدشده · ۲ تأییدنشده · ۱ شکست
process.exit(!structureOk ? 1 : dataVerified ? 0 : 2);
