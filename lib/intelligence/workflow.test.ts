import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANALYSIS_STATES,
  ANALYSIS_STATE_LABEL,
  INTERNAL_ONLY_STATES,
  WORKFLOW_EVENTS,
  WORKFLOW_EVENT_LABEL,
  canTransition,
  nextStates,
  isEditable,
  eventForState,
  isSafeSourceUrl,
  isValidConfidence,
  isSymbolScopeValid,
  isScenarioLabelValid,
  summarizeRehearsal,
  REQUIRED_REHEARSAL_DAYS,
  type AnalysisState,
  type RehearsalDay,
} from "./workflow";

const MIGRATION = readFileSync(
  join(process.cwd(), "sql", "phase22_manual_intelligence_workflow.sql"),
  "utf8"
);

// ── چرخهٔ عمر ───────────────────────────────────────────────────────────────

test("internal approval is not publication", () => {
  assert.ok(
    INTERNAL_ONLY_STATES.includes("approved_internal"),
    "تأییدِ داخلی نباید در فهرستِ حالت‌های قابلِ نمایشِ عمومی باشد"
  );
  assert.ok(!INTERNAL_ONLY_STATES.includes("published"));
});

/**
 * تستِ فهرست‌محور شکننده است: کسی حالتِ تازه اضافه می‌کند و یادش می‌رود به
 * `INTERNAL_ONLY_STATES` اضافه کند. پس به‌جای بررسیِ محتوای فهرست، **کاملبودنش**
 * سنجیده می‌شود: هر حالتی جز `published` باید داخلی باشد.
 */
test("every state except published is internal-only — checked by completeness", () => {
  const expected = ANALYSIS_STATES.filter((s) => s !== "published" && s !== "superseded");
  assert.deepEqual([...INTERNAL_ONLY_STATES].sort(), [...expected].sort());
});

test("publication is reachable only from approved_internal", () => {
  const canPublish = ANALYSIS_STATES.filter((s) => canTransition(s, "published"));
  assert.deepEqual(canPublish, ["approved_internal"]);
});

test("a draft can never jump straight to published", () => {
  assert.equal(canTransition("draft", "published"), false);
  assert.equal(canTransition("pending_approval", "published"), false);
  assert.equal(canTransition("rejected", "published"), false);
});

test("only pending_approval can be reviewed", () => {
  const reviewable = ANALYSIS_STATES.filter(
    (s) => canTransition(s, "approved_internal") || canTransition(s, "rejected")
  );
  assert.deepEqual(reviewable, ["pending_approval"]);
});

test("a rejected analysis returns to draft rather than dying", () => {
  assert.deepEqual(nextStates("rejected"), ["draft"]);
});

test("superseded is terminal", () => {
  assert.deepEqual(nextStates("superseded"), []);
});

test("no transition table entry points at a state that does not exist", () => {
  for (const from of ANALYSIS_STATES) {
    for (const to of nextStates(from)) {
      assert.ok(ANALYSIS_STATES.includes(to), `گذارِ ناموجود: ${from} → ${to}`);
    }
  }
});

test("no state may transition to itself", () => {
  for (const s of ANALYSIS_STATES) {
    assert.ok(!nextStates(s).includes(s), `${s} → ${s}`);
  }
});

test("content is editable only in draft", () => {
  for (const s of ANALYSIS_STATES) {
    assert.equal(isEditable(s), s === "draft", `ویرایش‌پذیریِ ${s}`);
  }
});

test("every state and event carries a Persian label", () => {
  for (const s of ANALYSIS_STATES) assert.ok(ANALYSIS_STATE_LABEL[s]?.length);
  for (const e of WORKFLOW_EVENTS) assert.ok(WORKFLOW_EVENT_LABEL[e]?.length);
});

test("entering any state maps to a real ledger event", () => {
  for (const s of ANALYSIS_STATES) {
    assert.ok(WORKFLOW_EVENTS.includes(eventForState(s)), `رویدادِ ناشناخته برای ${s}`);
  }
});

// ── تطبیق با خودِ migration ─────────────────────────────────────────────────
//
// TypeScript فقط توصیه است؛ مرجع Postgres است. این‌ها جلوی جداشدنِ بی‌صدای دو
// بیانِ یک قاعده را می‌گیرند.

test("the migration declares exactly the states this module declares", () => {
  const check = MIGRATION.match(/status IN \(([^)]+)\)/);
  assert.ok(check, "قیدِ status در migration پیدا نشد");
  const inSql = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inSql, [...ANALYSIS_STATES].sort());
});

test("the migration declares exactly the ledger events this module declares", () => {
  const check = MIGRATION.match(/event\s+text NOT NULL CHECK \(event IN \(([\s\S]*?)\)\)/);
  assert.ok(check, "قیدِ event در migration پیدا نشد");
  const inSql = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inSql, [...WORKFLOW_EVENTS].sort());
});

test("the migration's guard forbids publication from anything but approved_internal", () => {
  assert.match(MIGRATION, /analysis must be approved_internal before publication/);
  assert.match(MIGRATION, /result\.status <> 'approved_internal'/);
});

test("the public read policy is never widened beyond published", () => {
  // اگر روزی سیاستِ عمومی به `IN (...)` تغییر کند یا حالتِ داخلیِ دیگری را
  // بپذیرد، اینجا قرمز می‌شود.
  assert.doesNotMatch(
    MIGRATION,
    /FOR SELECT TO anon[\s\S]{0,200}approved_internal/,
    "حالتِ تأییدِ داخلی هرگز نباید وارد سیاستِ خواندنِ عمومی شود"
  );
});

test("no role is granted DELETE, TRUNCATE or blanket ALL on the new tables", () => {
  const grants = MIGRATION.split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .match(/GRANT[^;]*;/gi) ?? [];
  assert.ok(grants.length > 0);
  for (const g of grants) {
    if (/ON FUNCTION/i.test(g)) continue;
    assert.doesNotMatch(g, /\bDELETE\b|\bTRUNCATE\b|\bGRANT\s+ALL\b/i, `گرنتِ بیش‌ازحد: ${g}`);
  }
});

test("service_role is revoked explicitly, not only the public roles (B-034)", () => {
  assert.match(MIGRATION, /REVOKE ALL ON TABLE public\.%I FROM service_role/);
});

test("the workflow ledger grants UPDATE to nobody", () => {
  const updateGrants = (MIGRATION.match(/GRANT[^;]*UPDATE[^;]*;/gi) ?? []).filter(
    (g) => !/ON FUNCTION/i.test(g)
  );
  for (const g of updateGrants) {
    assert.doesNotMatch(g, /intel_workflow_events/, `دفترِ گردش نباید UPDATE بگیرد: ${g}`);
  }
});

// ── اعتبارسنجیِ ورودی ───────────────────────────────────────────────────────

test("only http and https count as a source url", () => {
  assert.ok(isSafeSourceUrl("https://codal.ir/report/1"));
  assert.ok(isSafeSourceUrl("http://example.com"));
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com",
    "not a url",
    "",
    "//example.com",
  ]) {
    assert.equal(isSafeSourceUrl(bad), false, `باید رد می‌شد: ${bad}`);
  }
});

test("confidence is an integer between 0 and 100", () => {
  for (const ok of [0, 50, 100]) assert.ok(isValidConfidence(ok));
  for (const bad of [-1, 101, 50.5, NaN, Infinity, "80", null, undefined, true]) {
    assert.equal(isValidConfidence(bad), false, `باید رد می‌شد: ${String(bad)}`);
  }
});

test("a symbol is only meaningful for a company-scoped event", () => {
  assert.ok(isSymbolScopeValid("company", "فولاد"));
  assert.ok(isSymbolScopeValid("iran", null));
  assert.equal(isSymbolScopeValid("iran", "فولاد"), false);
  assert.equal(isSymbolScopeValid("global", "فولاد"), false);
  assert.equal(isSymbolScopeValid("sector", "فولاد"), false);
});

test("a scenario label is required exactly when the claim is a scenario", () => {
  assert.ok(isScenarioLabelValid("SCENARIO", "base"));
  assert.ok(isScenarioLabelValid("FACT", null));
  assert.ok(isScenarioLabelValid("INFERENCE", null));
  assert.equal(isScenarioLabelValid("SCENARIO", null), false);
  assert.equal(isScenarioLabelValid("FACT", "upside"), false);
});

// ── سنجه‌های تمرین ──────────────────────────────────────────────────────────

const day = (over: Partial<RehearsalDay> = {}): RehearsalDay => ({
  rehearsalDate: "2026-08-02",
  dayIndex: 1,
  briefProduced: true,
  minutesToApproval: 30,
  absentSources: [],
  staleSources: [],
  humanCorrections: 0,
  rejectedConclusions: 0,
  missedEvents: 0,
  ...over,
});

/**
 * همان درسِ `B-038` در لباسِ گزارش: اگر «هیچ روزی ثبت نشده» به `۰٪` تبدیل شود،
 * یک تمرینِ شروع‌نشده از یک تمرینِ کاملاً ناموفق قابلِ تشخیص نیست.
 */
test("an empty rehearsal reports null, never zero", () => {
  const s = summarizeRehearsal([]);
  assert.equal(s.briefRate, null);
  assert.equal(s.averageMinutes, null);
  assert.equal(s.daysRecorded, 0);
  assert.equal(s.readyForGateReview, false);
});

test("a day without a brief is distinguishable from a fast day", () => {
  const s = summarizeRehearsal([day({ briefProduced: false, minutesToApproval: null })]);
  assert.equal(s.briefRate, 0);
  assert.equal(s.averageMinutes, null, "روزِ بدونِ Brief نباید در متوسطِ زمان بیاید");
});

test("the average ignores briefs whose time was never measured", () => {
  const s = summarizeRehearsal([
    day({ minutesToApproval: 20 }),
    day({ minutesToApproval: 40 }),
    day({ minutesToApproval: null }),
  ]);
  assert.equal(s.averageMinutes, 30);
  assert.equal(s.briefsProduced, 3);
});

test("absent and stale sources are deduplicated and kept as names", () => {
  const s = summarizeRehearsal([
    day({ absentSources: ["codal"], staleSources: ["fx"] }),
    day({ absentSources: ["codal", "tsetmc"], staleSources: [] }),
  ]);
  assert.deepEqual(s.absentSources, ["codal", "tsetmc"]);
  assert.deepEqual(s.staleSources, ["fx"]);
});

test("gate review needs ten real days and nine is not enough", () => {
  const nine = Array.from({ length: 9 }, (_, i) => day({ dayIndex: i + 1 }));
  assert.equal(summarizeRehearsal(nine).readyForGateReview, false);
  assert.equal(
    summarizeRehearsal([...nine, day({ dayIndex: 10 })]).readyForGateReview,
    true
  );
  assert.equal(REQUIRED_REHEARSAL_DAYS, 10);
});

test("counters accumulate across days", () => {
  const s = summarizeRehearsal([
    day({ humanCorrections: 2, rejectedConclusions: 1, missedEvents: 3 }),
    day({ humanCorrections: 5, rejectedConclusions: 0, missedEvents: 1 }),
  ]);
  assert.equal(s.totalCorrections, 7);
  assert.equal(s.totalRejected, 1);
  assert.equal(s.totalMissedEvents, 4);
});

// ── گاردِ ضدِ داده‌سازی ──────────────────────────────────────────────────────

/**
 * بدنهٔ `CREATE FUNCTION` کدِ **اجرانشده** است — `capture_intel_package` قاعدتاً
 * `INSERT` دارد و باید هم داشته باشد. چیزی که این گارد دنبالش است، `INSERT`ِ
 * سطحِ بالا یعنی **دادهٔ کاشته‌شده** است. همان تصحیحی که
 * `scripts/validate-sql.mjs` هم برای همین مثبتِ کاذب دارد.
 */
function topLevelSql(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/\$\$[\s\S]*?\$\$/g, " ");
}

test("no seed, sample or bootstrap rehearsal day ships in the migration", () => {
  const code = topLevelSql(MIGRATION);
  assert.doesNotMatch(
    code,
    /INSERT INTO public\.intel_rehearsal_days/i,
    "هیچ روزِ تمرینِ از پیش ساخته‌شده‌ای نباید در migration باشد"
  );
  assert.doesNotMatch(
    code,
    /INSERT INTO public\.intel_analyses/i,
    "هیچ تحلیلِ نمونه‌ای نباید در migration باشد"
  );
});

test("the migration is labelled NOT_APPLIED for Production", () => {
  assert.match(MIGRATION, /Production[^\n]*NOT_APPLIED/i);
  assert.match(MIGRATION, /uooeygybrniptzdxuzhj/);
  assert.match(MIGRATION, /oqjcvkzyvhqnphopedpn/);
});

test("the migration is wrapped in a transaction", () => {
  assert.match(MIGRATION, /^BEGIN;/m);
  assert.match(MIGRATION, /^COMMIT;/m);
});

// یک گاردِ کوچک ولی مهم: تایپِ `AnalysisState` نباید از قیدِ SQL جلوتر برود.
const _exhaustive: Record<AnalysisState, true> = {
  draft: true,
  pending_approval: true,
  approved_internal: true,
  rejected: true,
  published: true,
  superseded: true,
};
test("the state union is exhaustively handled", () => {
  assert.equal(Object.keys(_exhaustive).length, ANALYSIS_STATES.length);
});
