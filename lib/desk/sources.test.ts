import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_DESK_SOURCES, DESK_SOURCES } from "@/lib/desk/sources";

/**
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────
 * نسخهٔ اولِ میز پنج ستونِ زمانیِ **ناموجود** را می‌خواند:
 *   `ir_market_snapshots.captured_at` (واقعی: `updated_at`)
 *   `fx_rates.date`                   (واقعی: `created_at` / `rate_date`)
 *   `market_breadth.date`             (واقعی: `created_at`؛ `jdate` متنِ جلالی است)
 *   `codal_reports.created_at`        (واقعی: `captured_at`)
 *   `weekly_outlooks.created_at`      (واقعی: `published_at`)
 *
 * و چون خطای ستون بی‌صدا بلعیده می‌شد، هر پنج شاخص «به‌روز» گزارش می‌شدند.
 * یک شاخصِ مرده که سبز است از نبودنِ شاخص بدتر است.
 *
 * پس این تست هر ستونِ اعلام‌شده را با DDLِ واقعیِ `sql/` تطبیق می‌دهد. اگر
 * کسی ستونی بنویسد که وجود ندارد، CI می‌افتد — نه Production.
 */

const SQL_DIR = join(process.cwd(), "sql");

const ALL_SQL = readdirSync(SQL_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(SQL_DIR, f), "utf8"))
  .join("\n\n");

/** بدنهٔ `CREATE TABLE public.<name> ( … )` را با شمارشِ پرانتز بیرون می‌کشد. */
function tableBody(sql: string, table: string): string | null {
  const opener = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\s*\\(`,
    "i"
  );
  const m = opener.exec(sql);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < sql.length && depth > 0) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    i++;
  }
  return depth === 0 ? sql.slice(start, i - 1) : null;
}

/** نامِ ستون‌های سطحِ اولِ یک بدنهٔ DDL. */
function columnNames(body: string): Set<string> {
  const names = new Set<string>();
  let depth = 0;
  let line = "";
  const flush = () => {
    const t = line.trim().replace(/^--.*$/gm, "").trim();
    const m = /^([a-z_][a-z0-9_]*)\s/i.exec(t);
    if (m) names.add(m[1].toLowerCase());
    line = "";
  };
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) flush();
    else line += ch;
  }
  flush();
  return names;
}

test("every declared source table has a real CREATE TABLE in sql/", () => {
  for (const spec of ALL_DESK_SOURCES) {
    assert.ok(
      tableBody(ALL_SQL, spec.table),
      `منبعِ \`${spec.table}\` در هیچ فایلِ sql/ تعریف نشده — یا نامش غلط است یا migration وجود ندارد`
    );
  }
});

test("every declared timestamp column actually exists in that table's DDL", () => {
  for (const spec of ALL_DESK_SOURCES) {
    if (!spec.timeColumn) continue;
    const body = tableBody(ALL_SQL, spec.table);
    assert.ok(body, `DDLِ \`${spec.table}\` پیدا نشد`);
    const columns = columnNames(body!);
    assert.ok(
      columns.has(spec.timeColumn.toLowerCase()),
      `ستونِ \`${spec.timeColumn}\` در جدولِ \`${spec.table}\` وجود ندارد. ستون‌های موجود: ${[...columns].join(", ")}`
    );
  }
});

/**
 * کنترلِ شکست‌پذیری: خودِ سنجه باید بتواند قرمز شود، وگرنه سبزبودنش چیزی
 * ثابت نمی‌کند. این همان دام است که پنج شاخصِ قبلی در آن افتادند.
 */
test("the column check can actually fail", () => {
  const body = tableBody(ALL_SQL, "fx_rates");
  assert.ok(body);
  const columns = columnNames(body!);
  assert.ok(columns.has("created_at"), "پیش‌فرضِ کنترل نادرست است");
  assert.ok(
    !columns.has("date"),
    "`fx_rates.date` نباید وجود داشته باشد — دقیقاً همان ستونی که نسخهٔ اول اشتباه می‌خواند"
  );
  assert.ok(!columns.has("captured_at"), "کنترلِ منفی برای `ir_market_snapshots` نیز باید معنا بدهد");
});

test("the five historically wrong columns are not silently back", () => {
  const wrong: [string, string][] = [
    ["ir_market_snapshots", "captured_at"],
    ["fx_rates", "date"],
    ["market_breadth", "date"],
    ["codal_reports", "created_at"],
    ["weekly_outlooks", "created_at"],
  ];
  for (const [table, column] of wrong) {
    const spec = ALL_DESK_SOURCES.find((s) => s.table === table);
    assert.ok(spec, `منبعِ \`${table}\` از رجیستری حذف شده`);
    assert.notEqual(
      spec!.timeColumn,
      column,
      `\`${table}.${column}\` دوباره اعلام شده — این ستون وجود ندارد`
    );
  }
});

/**
 * ── چرا این سه تست وجود دارند ───────────────────────────────────────────
 * قرارداد قبلاً `okWithinMinutes` **و** `staleWithinMinutes` داشت، ولی
 * `classifySource` فقط اولی را می‌خواند. عددِ دوم در کد، در رجیستری و در
 * گزارش‌ها تکرار می‌شد و **هیچ کاری نمی‌کرد** — یک پیکربندیِ تزیینی.
 *
 * این دقیقاً همان دسته از دروغی است که کلِ این ماژول علیه‌اش ساخته شده:
 * چیزی که شبیهِ تنظیم است ولی روی رفتار اثر ندارد. پس مرزِ آستانه دقیقاً
 * یک عدد است و همین‌جا قفل می‌شود.
 */
test("a freshness rule carries exactly one knob and no decorative extras", () => {
  for (const spec of ALL_DESK_SOURCES) {
    if (spec.rule === null) continue;
    assert.deepEqual(
      Object.keys(spec.rule).sort(),
      ["freshWithinMinutes"],
      `منبعِ \`${spec.table}\` تنظیمِ اضافه دارد — هر کلیدی که رفتار را عوض نکند ممنوع است`
    );
    assert.ok(
      Number.isFinite(spec.rule.freshWithinMinutes) && spec.rule.freshWithinMinutes > 0,
      `آستانهٔ \`${spec.table}\` عددِ معتبر نیست`
    );
  }
});

test("the retired two-threshold vocabulary is gone from the desk contract", () => {
  const contracts = readFileSync(join(process.cwd(), "lib", "desk", "contracts.ts"), "utf8");
  const registry = readFileSync(join(process.cwd(), "lib", "desk", "sources.ts"), "utf8");
  // کامنتِ توضیحیِ خودِ contracts نامِ قدیمی را برای ثبتِ تاریخچه دارد؛ پس
  // فقط کدِ اجراشونده سنجیده می‌شود.
  const code = (src: string) =>
    src.split("\n").filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    }).join("\n");
  for (const [name, src] of Object.entries({ contracts, registry })) {
    assert.doesNotMatch(code(src), /staleWithinMinutes|okWithinMinutes/,
      `${name} هنوز واژگانِ دو-آستانه‌ای را دارد`);
  }
});

/**
 * مرز باید **رفتاری** اثبات شود، نه فقط تایپی: دقیقاً روی آستانه `ready`
 * است و یک دقیقه بعدش `stale`. اگر روزی آستانهٔ دومی برگردد، این تست
 * همچنان می‌گوید کدام عدد واقعاً مرز است.
 */
test("the single threshold is the only boundary that exists", async () => {
  const { classifySource } = await import("@/lib/desk/contracts");
  const now = new Date("2026-08-01T12:00:00Z");
  const at = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const spec = { table: "t", label: "l", rule: { freshWithinMinutes: 100 } };

  assert.equal(classifySource(spec, { available: true, count: 1, lastAt: at(99) }, now).state, "ready");
  assert.equal(classifySource(spec, { available: true, count: 1, lastAt: at(100) }, now).state, "ready");
  assert.equal(classifySource(spec, { available: true, count: 1, lastAt: at(101) }, now).state, "stale");
  // و هرچه کهنه‌تر، همچنان `stale` — هیچ مرزِ سومی در کار نیست.
  assert.equal(classifySource(spec, { available: true, count: 1, lastAt: at(100000) }, now).state, "stale");
});

test("every source states the evidence for its freshness threshold", () => {
  for (const spec of ALL_DESK_SOURCES) {
    assert.ok(
      spec.basis && spec.basis.trim().length > 20,
      `منبعِ \`${spec.table}\` شاهدی برای آستانه‌اش ندارد — عددِ بی‌شاهد ممنوع است`
    );
  }
});

/**
 * هر ادعای زمان‌بندی باید با `vercel.json` بخواند. ادعای «هر ۳۰ دقیقه» در
 * نسخهٔ اول با هیچ زمان‌بندی‌ای پشتیبانی نمی‌شد.
 */
test("no source claims a cron cadence that vercel.json does not contain", () => {
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const schedules = [...vercel.matchAll(/"schedule"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(schedules.length > 0, "`vercel.json` هیچ زمان‌بندی‌ای ندارد");

  for (const spec of ALL_DESK_SOURCES) {
    const claimed = [...spec.basis.matchAll(/`([\d*\/ ,-]+\*[\d*\/ ,-]*)`/g)].map((m) => m[1].trim());
    for (const c of claimed) {
      assert.ok(
        schedules.includes(c),
        `منبعِ \`${spec.table}\` زمان‌بندیِ \`${c}\` را ادعا می‌کند که در vercel.json نیست`
      );
    }
  }
});

test("sources are grouped into exactly the six approved desk areas", () => {
  assert.deepEqual(Object.keys(DESK_SOURCES), [
    "today",
    "intelligence",
    "decisions",
    "reference",
    "clients",
    "operations",
  ]);
  for (const group of Object.values(DESK_SOURCES)) {
    assert.ok(group.length > 0, "هر ناحیه باید دستِ‌کم یک منبع داشته باشد");
  }
});

/**
 * `/api/admin/health` یک **مقصد** است، نه یک منبع. نسخهٔ اول آن را در فهرستِ
 * منابعِ ناحیهٔ عملیات نوشته بود در حالی که هرگز صدایش نمی‌زد — یعنی یک
 * ادعای منبعِ نادرست. حالا فقط `cron_runs` منبع است و Health لینک است.
 */
test("no desk source is an API route — sources are tables only", () => {
  for (const spec of ALL_DESK_SOURCES) {
    assert.doesNotMatch(
      spec.table,
      /^\/|api\//,
      `\`${spec.table}\` یک مسیرِ API است، نه جدول — منبع باید جدولِ واقعی باشد`
    );
  }
});
