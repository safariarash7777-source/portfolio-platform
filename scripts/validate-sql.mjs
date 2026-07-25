#!/usr/bin/env node
/**
 * اعتبارسنجیِ فایل‌های migration — **بدونِ اتصال به هیچ دیتابیس و بدونِ اجرای SQL.**
 *
 * این بررسی‌ها *سیاستی* هستند، نه گرامری. برای اعتبارسنجیِ گرامرِ واقعیِ Postgres
 * از `scripts/validate-sql-grammar.py` (libpg_query) استفاده کن.
 *
 *   node scripts/validate-sql.mjs
 *
 * خروج ۰ = پاس · ۱ = مردود
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("sql/**/*.sql").sort();

/** دستوراتی که در یک migrationِ ردیابی‌شده نباید بی‌سروصدا ظاهر شوند. */
const DESTRUCTIVE = [
  { re: /\bDROP\s+TABLE\b/i, what: "DROP TABLE" },
  { re: /\bDROP\s+SCHEMA\b/i, what: "DROP SCHEMA" },
  { re: /\bDROP\s+DATABASE\b/i, what: "DROP DATABASE" },
  { re: /\bDROP\s+COLUMN\b/i, what: "DROP COLUMN" },
  { re: /\bTRUNCATE\b/i, what: "TRUNCATE" },
  { re: /\bDELETE\s+FROM\b/i, what: "DELETE FROM" },
  { re: /\bALTER\s+TABLE\s+\S+\s+RENAME\b/i, what: "ALTER TABLE … RENAME" },
];

const SECRETISH = [
  { re: /\beyJ[A-Za-z0-9_-]{10,}\./, what: "توکنِ JWT" },
  { re: /\b(postgres(ql)?|mysql):\/\/[^\s:@/]+:[^\s@/]{6,}@/, what: "رشتهٔ اتصال با رمز" },
  { re: /\bPASSWORD\s+'[^']{6,}'/i, what: "رمزِ درون‌خطی" },
];

/** خطوطِ کامنت را حذف می‌کند تا policy فقط روی SQLِ اجراشدنی اعمال شود. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * تشخیصِ دستورِ واقعاً مخرب، با دو تصحیحِ مهمِ مثبتِ کاذب:
 *  ۱. `BEFORE TRUNCATE` / `AFTER DELETE` رویدادِ تریگر است، نه حذفِ داده —
 *     در این ریپو دقیقاً برعکس: تریگرهای گاردِ append-only.
 *  ۲. بدنهٔ `CREATE TRIGGER` / `CREATE FUNCTION` کدِ اجرانشده است.
 */
function destructiveOps(code) {
  const withoutTriggerEvents = code.replace(
    /\b(before|after|instead\s+of)\s+(insert|update|delete|truncate)(\s+or\s+(insert|update|delete|truncate))*/gi,
    " "
  );
  const hits = new Set();
  for (const stmt of withoutTriggerEvents.split(";")) {
    if (/^\s*create\s+(or\s+replace\s+)?(trigger|function)\b/i.test(stmt)) continue;
    for (const d of DESTRUCTIVE) if (d.re.test(stmt)) hits.add(d.what);
  }
  return [...hits];
}

/** شمارشِ dollar-quoteهای بازنشده ($$ و $tag$). */
function unbalancedDollarQuotes(sql) {
  const tags = sql.match(/\$[A-Za-z_]*\$/g) ?? [];
  const counts = new Map();
  for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n % 2 !== 0).map(([t]) => t);
}

let failed = 0;
const warnings = [];

if (files.length === 0) {
  console.error("❌ هیچ فایلِ SQL پیدا نشد — مسیرِ sql/ را بررسی کن.");
  process.exit(1);
}

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const problems = [];

  // ۱) dollar-quoteهای متوازن (شایع‌ترین خطای نحویِ فایل‌های plpgsql)
  const openTags = unbalancedDollarQuotes(code);
  if (openTags.length) problems.push(`dollar-quoteِ نامتوازن: ${openTags.join(", ")}`);

  // ۲) توازنِ تراکنش
  const begins = (code.match(/^\s*BEGIN\s*;/gim) ?? []).length;
  const commits = (code.match(/^\s*(COMMIT|ROLLBACK)\s*;/gim) ?? []).length;
  if (begins !== commits) {
    problems.push(`تراکنشِ نامتوازن: ${begins} BEGIN در برابر ${commits} COMMIT/ROLLBACK`);
  }

  // ۳) هیچ سکرتی داخلِ SQL
  for (const s of SECRETISH) {
    if (s.re.test(code)) problems.push(`سکرتِ احتمالی در SQL: ${s.what}`);
  }

  // ۴) دستورِ مخرب — مردود نمی‌کند، ولی باید دیده شود
  const destructive = destructiveOps(code);
  if (destructive.length) warnings.push(`${file}: ${destructive.join("، ")}`);

  // ۵) فایلِ عملاً خالی
  if (code.trim().length === 0) problems.push("فایل هیچ SQLِ اجراشدنی ندارد");

  if (problems.length) {
    failed += 1;
    console.error(`❌ ${file}`);
    for (const p of problems) console.error(`   • ${p}`);
  } else {
    console.log(`✅ ${file}`);
  }
}

if (warnings.length) {
  console.log("\n⚠️  دستوراتِ مخرب (عمدی؟ حتماً rollback مستند باشد):");
  for (const w of warnings) console.log(`   • ${w}`);
}

console.log(`\n${files.length} فایل بررسی شد · ${failed} مردود`);
console.log("هیچ SQLای اجرا نشد و به هیچ دیتابیسی وصل نشدیم.");
process.exit(failed === 0 ? 0 : 1);
