import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rollup } from "@/lib/health/status";
import {
  CONSUMED_IR_SECTIONS,
  UNREAD_IR_SECTIONS,
  RETENTION_POLICIES,
  classifyRetention,
  retentionHealthState,
  rollupRetention,
  type RetentionPolicy,
} from "@/lib/ops/retention";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const policy = (t: string): RetentionPolicy => {
  const p = RETENTION_POLICIES.find((x) => x.table === t);
  assert.ok(p, `سیاستِ ${t} تعریف نشده`);
  return p!;
};

const IR = policy("ir_market_history");
const SH = policy("symbol_history");

/* ── تلهٔ اصلی ─────────────────────────────────────────────────────────── */

test("a table that shrank because the feed died is never reported healthy", () => {
  // ۲ MB، خیلی زیرِ بودجهٔ ۴۰ — ولی آخرین ردیف سه روز پیش است.
  const v = classifyRetention(IR, { table: IR.table, sizeMb: 2, ageMinutes: 3 * 24 * 60, oldestDays: 3 });
  assert.equal(v.state, "feed_stalled");
  assert.notEqual(v.state, "ok");
  assert.match(v.detail, /نشانهٔ سلامت نیست/);
});

test("freshness is judged before size, so a dead feed outranks a fat table", () => {
  const stalledAndFat = classifyRetention(IR, {
    table: IR.table, sizeMb: 900, ageMinutes: 10 * 24 * 60, oldestDays: 400,
  });
  // هر سه ایراد هم‌زمان‌اند؛ آنکه گزارش می‌شود باید بدترین باشد.
  assert.equal(stalledAndFat.state, "feed_stalled");
});

/* ── حالت‌های عادی ─────────────────────────────────────────────────────── */

test("fresh data under budget is ok", () => {
  const v = classifyRetention(IR, { table: IR.table, sizeMb: 20, ageMinutes: 31, oldestDays: 170 });
  assert.equal(v.state, "ok");
});

test("fresh data over budget says retention exists but is not enough", () => {
  const v = classifyRetention(IR, { table: IR.table, sizeMb: 348, ageMinutes: 31, oldestDays: 45 });
  assert.equal(v.state, "over_budget");
  assert.match(v.detail, /۳۴۸|348/);
});

test("data older than the window means prune never ran", () => {
  // ۱۸۰ روز پنجره؛ ۴۰۰ روز یعنی prune ایستاده.
  const v = classifyRetention(IR, { table: IR.table, sizeMb: 30, ageMinutes: 31, oldestDays: 400 });
  assert.equal(v.state, "retention_stalled");
});

test("a table with no automatic retention is never called retention_stalled", () => {
  // `symbol_history` عمداً `hotDays: null` است — ۲۵ سال داده تخلف نیست.
  assert.equal(SH.hotDays, null);
  const v = classifyRetention(SH, {
    table: SH.table, sizeMb: 300, ageMinutes: 60, oldestDays: 9285,
  });
  assert.equal(v.state, "ok");
});

/* ── «نمی‌دانیم» هرگز «سالم» نیست ──────────────────────────────────────── */

test("a probe that could not read the table at all is unknown, never ok", () => {
  // تازگی سنجهٔ پایه است؛ بدونِ آن هیچ چیزی دربارهٔ جدول نمی‌دانیم.
  for (const obs of [
    { sizeMb: null, ageMinutes: null, oldestDays: null },
    { sizeMb: 10, ageMinutes: null, oldestDays: 1 },
  ]) {
    const v = classifyRetention(IR, { table: IR.table, ...obs });
    assert.equal(v.state, "unknown", JSON.stringify(obs));
    assert.equal(v.budgetChecked, false);
  }
});

/* ── نقصی که این موج بست ───────────────────────────────────────────────── */

test("an unmeasurable size does not blind the verdict, and never claims the budget was checked", () => {
  // حجمِ بایتی از سمتِ سایت خواندنی نیست. نسخهٔ اول برای همین `unknown`
  // برمی‌گرداند؛ حکم فقط باید دربارهٔ ابعادِ سنجیده‌شده باشد.
  const v = classifyRetention(IR, { table: IR.table, sizeMb: null, ageMinutes: 31, oldestDays: 100 });
  assert.equal(v.state, "ok");
  assert.equal(v.budgetChecked, false, "بودجه سنجیده نشده ولی ادعا شده که شده");
  assert.match(v.detail, /حجم سنجیده نشد/);
  assert.match(v.detail, /ادعایی نمی‌شود/);
});

test("an unmeasurable size never rescues a stalled feed or a stalled prune", () => {
  // نباید اصلاحِ بالا به یک درِ پشتی برای سبزشدن تبدیل شود.
  const stalled = classifyRetention(IR, {
    table: IR.table, sizeMb: null, ageMinutes: 5 * 24 * 60, oldestDays: 5,
  });
  assert.equal(stalled.state, "feed_stalled");

  const noPrune = classifyRetention(IR, {
    table: IR.table, sizeMb: null, ageMinutes: 31, oldestDays: 400,
  });
  assert.equal(noPrune.state, "retention_stalled");
});

test("budgetChecked is true only when a size was actually supplied", () => {
  const measured = classifyRetention(IR, { table: IR.table, sizeMb: 5, ageMinutes: 31, oldestDays: 10 });
  assert.equal(measured.budgetChecked, true);
  const over = classifyRetention(IR, { table: IR.table, sizeMb: 999, ageMinutes: 31, oldestDays: 10 });
  assert.equal(over.budgetChecked, true);
});

/**
 * گاردِ اصلی. اینها سیگنالِ ظرفیت‌اند و در `/api/admin/health` وارد
 * `rollup(signals)` می‌شوند. اگر بعدِ نسنجیدنیِ حجم دوباره `unknown` بدهد،
 * وضعیتِ **کلِ سامانه** برای همیشه `unknown` می‌شود و هر خرابیِ واقعیِ
 * دیگری پشتش گم می‌شود.
 */
test("with size unmeasurable on every table, overall health is not dragged to unknown", () => {
  const signals = RETENTION_POLICIES.map((p) => ({
    key: `retention:${p.table}`,
    label: p.label,
    state: retentionHealthState(
      classifyRetention(p, {
        table: p.table,
        sizeMb: null, // دقیقاً همان چیزی که مسیرِ Health پاس می‌دهد
        ageMinutes: 30,
        oldestDays: p.hotDays === null ? 9285 : 100,
      }).state
    ),
    detail: "",
  }));
  assert.deepEqual([...new Set(signals.map((s) => s.state))], ["ok"]);
  assert.equal(rollup(signals), "ok");
  assert.notEqual(rollup(signals), "unknown");
});

test("a real retention failure still reaches the overall state", () => {
  // اصلاح نباید سیگنال را بی‌اثر کند: فیدِ مرده باید همچنان کلِ نما را قرمز کند.
  const dead = classifyRetention(IR, {
    table: IR.table, sizeMb: null, ageMinutes: 9999, oldestDays: 10,
  });
  const signals = [
    { key: "x", label: "x", state: "ok" as const, detail: "" },
    { key: "retention", label: "r", state: retentionHealthState(dead.state), detail: "" },
  ];
  assert.equal(rollup(signals), "failed");
});

test("the rollup reports the worst state, and an empty list is unknown", () => {
  assert.equal(rollupRetention([]), "unknown");
  const mk = (s: string) => classifyRetention(IR, {
    table: IR.table,
    sizeMb: s === "over" ? 900 : 10,
    ageMinutes: s === "stalled" ? 99999 : 30,
    oldestDays: 10,
  });
  assert.equal(rollupRetention([mk("ok"), mk("over")]), "over_budget");
  assert.equal(rollupRetention([mk("ok"), mk("over"), mk("stalled")]), "feed_stalled");
});

/* ── قید‌های دامنه ─────────────────────────────────────────────────────── */

test("the consumed section list matches what the only reader actually queries", () => {
  // اگر `trend.ts` روزی بخشِ دیگری بخواند و اینجا به‌روز نشود، رله آن را
  // نمی‌نویسد و نمودار بی‌صدا خالی می‌ماند.
  const trend = read("lib", "core", "trend.ts");
  for (const s of CONSUMED_IR_SECTIONS) {
    assert.ok(trend.includes(s), `trend.ts بخشِ ${s} را نمی‌خواند`);
  }
  assert.match(trend, /section:\s*"in\.\((gold|currency)[,)]/);
});

test("no consumed section is also listed as unread", () => {
  const overlap = CONSUMED_IR_SECTIONS.filter((s) =>
    (UNREAD_IR_SECTIONS as readonly string[]).includes(s)
  );
  assert.deepEqual(overlap, [], `بخشِ متناقض: ${overlap.join(", ")}`);
});

test("no repo code reads a section marked unread", () => {
  // اگر روزی کسی `stocks` را بخواند، این گارد قرمز می‌شود و فهرست باید
  // اصلاح شود — نه اینکه داده بی‌صدا غایب بماند.
  const sources = [
    read("lib", "core", "trend.ts"),
    read("components", "market", "TrendChart.tsx"),
    read("components", "market", "GoldUsdTrend.tsx"),
  ].join("\n");
  for (const s of UNREAD_IR_SECTIONS) {
    assert.doesNotMatch(
      sources,
      new RegExp(`ir_market_history[^\\n]*${s}|section[^\\n]*${s}`),
      `بخشِ ${s} خوانده می‌شود ولی «بی‌خواننده» علامت خورده`
    );
  }
});

test("symbol_history has no automatic retention, because a trigger forbids deletion", () => {
  // قاعدهٔ D1: کوتاه‌سازیِ این جدول فقط با migrationِ مصوب. اگر روزی کسی
  // اینجا عددی بگذارد، یعنی حذفِ خودکار روی جدولِ append-only فعال شده.
  assert.equal(SH.hotDays, null, "برای symbol_history نگهداشتِ خودکار تعریف شده");
});

test("every policy carries the evidence for its numbers", () => {
  for (const p of RETENTION_POLICIES) {
    assert.ok(p.basis.length > 40, `${p.table} شاهدِ عددهایش را ندارد`);
    assert.ok(p.budgetMb > 0);
    assert.ok(p.freshWithinMinutes > 0);
  }
});
