import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sanitizeErrorSummary,
  normalizeErrorCode,
  isValidTransition,
  runWithLedger,
  SAFE_ERROR_SUMMARY_MAX,
  ERROR_CODE_MAX,
  type CronLedgerStore,
} from "@/lib/cron/ledger";
import { classifyCronRun } from "@/lib/cron/health";

/**
 * تست‌های دفترِ اجرای cron — `P2-G2-012`.
 *
 * بدونِ شبکه و بدونِ دیتابیس. رفتارِ واقعیِ Postgres (RLS، گرنت، گذارها) در
 * `lib/cron/ledger.integration.test.ts` روی Postgresِ واقعی سنجیده می‌شود.
 */

const SQL = readFileSync(join(process.cwd(), "sql", "phase21_cron_runs.sql"), "utf8");
const STATEMENTS = SQL.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const NOW = new Date("2026-07-30T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

// ── پاک‌سازیِ خطا ───────────────────────────────────────────────────────────

test("URL از خلاصهٔ خطا حذف می‌شود — می‌تواند توکنِ مسیر داشته باشد", () => {
  const out = sanitizeErrorSummary("fetch failed for https://t.me/s/channel?token=abc123");
  assert.ok(out && !out.includes("t.me"), `URL نشت کرد: ${out}`);
  assert.match(out!, /\[url\]/);
});

test("رشتهٔ JWT‌شکل و توکن‌های شناخته‌شده حذف می‌شوند", () => {
  const jwt = sanitizeErrorSummary("bad key eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig");
  assert.match(jwt!, /\[jwt\]/);
  assert.ok(!jwt!.includes("eyJhbGci"));

  for (const t of ["sbp_0123456789abcdef0123", "vcp_0123456789abcdef0123", "ghp_0123456789abcdef0123456789"]) {
    const out = sanitizeErrorSummary(`auth failed with ${t}`);
    assert.match(out!, /\[token\]/, `توکن نشت کرد: ${out}`);
    assert.ok(!out!.includes(t));
  }
});

test("جفت‌های شبیهِ سکرت پاک می‌شوند", () => {
  const out = sanitizeErrorSummary("request rejected: authorization=Bearer xyz secret=hunter2");
  assert.ok(!out!.includes("hunter2"), `سکرت نشت کرد: ${out}`);
  assert.match(out!, /\[redacted\]/);
});

test("شمارهٔ موبایل — دادهٔ شخصی — حتی تصادفی هم نمی‌ماند", () => {
  const out = sanitizeErrorSummary("insert failed for row phone 09121234567");
  assert.ok(!out!.includes("09121234567"));
  assert.match(out!, /\[phone\]/);
});

test("اول پاک‌سازی، بعد کوتاه‌سازی — وگرنه نیمهٔ توکن باقی می‌ماند", () => {
  // اگر ترتیب برعکس بود، برش وسطِ URL می‌افتاد و بخشی از آن می‌ماند.
  const long = `failure at https://example.com/${"a".repeat(400)}`;
  const out = sanitizeErrorSummary(long)!;
  assert.ok(out.length <= SAFE_ERROR_SUMMARY_MAX, `طول ${out.length} از سقف گذشت`);
  assert.ok(!out.includes("example.com"));
});

test("سقفِ طول با CHECKِ migration یکی است", () => {
  assert.match(STATEMENTS, new RegExp(`char_length\\(safe_error_summary\\) <= ${SAFE_ERROR_SUMMARY_MAX}`));
  assert.match(STATEMENTS, new RegExp(`char_length\\(error_code\\) <= ${ERROR_CODE_MAX}`));
});

test("ورودیِ خالی خلاصه تولید نمی‌کند", () => {
  assert.equal(sanitizeErrorSummary(null), null);
  assert.equal(sanitizeErrorSummary(undefined), null);
  assert.equal(sanitizeErrorSummary("   "), null);
});

test("کدِ خطا ماشین‌خوان می‌ماند", () => {
  assert.equal(normalizeErrorCode("feed_unreachable"), "feed_unreachable");
  assert.equal(normalizeErrorCode("خطای فارسی"), "unknown");
  assert.equal(normalizeErrorCode("a".repeat(ERROR_CODE_MAX + 1)), "unknown");
  assert.equal(normalizeErrorCode(undefined), "unknown");
});

// ── گذارها ─────────────────────────────────────────────────────────────────

test("فقط running → succeeded|failed مجاز است", () => {
  assert.ok(isValidTransition("running", "succeeded"));
  assert.ok(isValidTransition("running", "failed"));
  assert.ok(!isValidTransition("running", "running"));
  assert.ok(!isValidTransition("succeeded", "failed"));
  assert.ok(!isValidTransition("failed", "succeeded"));
});

// ── runWithLedger ──────────────────────────────────────────────────────────

function fakeStore(overrides: Partial<CronLedgerStore> = {}): CronLedgerStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async startRun() {
      calls.push("start");
      return { id: "run-1" };
    },
    async finishRun(_id, input) {
      calls.push(`finish:${input.status}`);
      return {};
    },
    async countStaleRunning() {
      return { count: 0 };
    },
    ...overrides,
  } as CronLedgerStore & { calls: string[] };
}

test("اجرای موفق، شروع و پایان را ثبت می‌کند", async () => {
  const store = fakeStore();
  const r = await runWithLedger({
    store, jobKey: "alerts", deploymentSha: "abc1234",
    job: async () => ({ outcome: { ok: true, processedCount: 3, errorCode: null, rawError: null }, value: "done" }),
  });
  assert.equal(r.result, "done");
  assert.equal(r.ledgerRecorded, true);
  assert.deepEqual(store.calls, ["start", "finish:succeeded"]);
});

test("اجرای ناموفق هم ثبت می‌شود — شکستِ خاموش همان چیزی است که می‌خواستیم ببینیم", async () => {
  const store = fakeStore();
  const r = await runWithLedger({
    store, jobKey: "telegram-sync", deploymentSha: null,
    job: async () => ({
      outcome: { ok: false, processedCount: 0, errorCode: "feed_unreachable", rawError: new Error("timeout at https://t.me/x") },
      value: null,
    }),
  });
  assert.equal(r.ledgerRecorded, true);
  assert.deepEqual(store.calls, ["start", "finish:failed"]);
});

test("استثنای مهارنشدهٔ job هم ثبت می‌شود، نه اینکه بی‌رد بماند", async () => {
  let recorded: { status: string; errorCode: string | null } | null = null;
  const store = fakeStore({
    async finishRun(_id, input) {
      recorded = { status: input.status, errorCode: input.errorCode };
      return {};
    },
  });
  await runWithLedger({
    store, jobKey: "alerts", deploymentSha: null,
    job: async () => { throw new Error("boom"); },
  });
  assert.deepEqual(recorded, { status: "failed", errorCode: "unhandled_exception" });
});

test("شکستِ خودِ دفتر، jobِ سالم را نمی‌شکند", async () => {
  // ابزارِ رصدی که بتواند کارِ اصلی را از کار بیندازد، از نبودنش بدتر است.
  const store = fakeStore({
    async startRun() { throw new Error("ledger down"); },
  });
  const r = await runWithLedger({
    store, jobKey: "alerts", deploymentSha: null,
    job: async () => ({ outcome: { ok: true, processedCount: 1, errorCode: null, rawError: null }, value: "still fine" }),
  });
  assert.equal(r.result, "still fine");
  assert.equal(r.ledgerRecorded, false);
  assert.equal(r.runId, null);
});

test("مدتِ اجرا اندازه گرفته می‌شود و منفی نمی‌شود", async () => {
  let t = 1000;
  const r = await runWithLedger({
    store: fakeStore(), jobKey: "alerts", deploymentSha: null,
    now: () => { const v = t; t += 250; return v; },
    job: async () => ({ outcome: { ok: true, processedCount: null, errorCode: null, rawError: null }, value: 1 }),
  });
  assert.ok(r.durationMs >= 0);
});

// ── شاخصِ سلامت ────────────────────────────────────────────────────────────

const base = { jobKey: "alerts", label: "cronِ هشدار", okWithinMinutes: 26 * 60, staleWithinMinutes: 72 * 60, stuckAfterMinutes: 60 };

test("هرگز اجرا نشده → نامعلوم، نه سالم و نه خراب", () => {
  const s = classifyCronRun({ ...base, lastRun: null }, NOW);
  assert.equal(s.state, "unknown");
  assert.match(s.detail!, /هیچ اجرایی ثبت نشده/);
});

test("موفقِ تازه → سالم", () => {
  const s = classifyCronRun({
    ...base,
    lastRun: { status: "succeeded", startedAt: minutesAgo(65), finishedAt: minutesAgo(60), processedCount: 4, errorCode: null, durationMs: 900 },
  }, NOW);
  assert.equal(s.state, "ok");
});

test("موفقِ قدیمی → بیات؛ موفق‌بودن کهنگی را جبران نمی‌کند", () => {
  const s = classifyCronRun({
    ...base,
    lastRun: { status: "succeeded", startedAt: minutesAgo(40 * 60), finishedAt: minutesAgo(40 * 60), processedCount: 0, errorCode: null, durationMs: 10 },
  }, NOW);
  assert.equal(s.state, "stale");
});

test("شکستِ تازه → خراب؛ تازگی شکست را جبران نمی‌کند", () => {
  const s = classifyCronRun({
    ...base,
    lastRun: { status: "failed", startedAt: minutesAgo(2), finishedAt: minutesAgo(1), processedCount: 0, errorCode: "feed_unreachable", durationMs: 5000 },
  }, NOW);
  assert.equal(s.state, "failed");
  assert.match(s.detail!, /ناموفق/);
  assert.match(s.detail!, /feed_unreachable/);
});

test("اجرای گیرکرده در running پنهان نمی‌شود", () => {
  const stuck = classifyCronRun({
    ...base,
    lastRun: { status: "running", startedAt: minutesAgo(120), finishedAt: null, processedCount: null, errorCode: null, durationMs: null },
  }, NOW);
  assert.equal(stuck.state, "failed");
  assert.match(stuck.detail!, /running مانده/);

  const inFlight = classifyCronRun({
    ...base,
    lastRun: { status: "running", startedAt: minutesAgo(2), finishedAt: null, processedCount: null, errorCode: null, durationMs: null },
  }, NOW);
  assert.equal(inFlight.state, "unknown");
});

test("اجرای ناتمامِ موازی در کنارِ موفقیت هم دیده می‌شود", () => {
  const s = classifyCronRun({
    ...base,
    staleRunningCount: 1,
    lastRun: { status: "succeeded", startedAt: minutesAgo(30), finishedAt: minutesAgo(29), processedCount: 2, errorCode: null, durationMs: 500 },
  }, NOW);
  assert.equal(s.state, "ok");
  assert.match(s.detail!, /اجرای ناتمامِ قبلی/);
});

// ── قواعدِ migration ───────────────────────────────────────────────────────

test("migration وضعیتش NOT_APPLIED است", () => {
  assert.match(SQL, /وضعیت:\s*\*\*NOT_APPLIED\*\*/);
});

test("درسِ G2-006 اینجا هم از ابتدا اعمال شده", () => {
  assert.match(STATEMENTS, /REVOKE ALL ON public\.cron_runs FROM PUBLIC/);
  assert.match(STATEMENTS, /REVOKE ALL ON public\.cron_runs FROM anon/);
  assert.match(STATEMENTS, /REVOKE ALL ON public\.cron_runs FROM authenticated/);

  const grants = STATEMENTS.match(/GRANT[^;]*TO authenticated/gi) ?? [];
  for (const g of grants) {
    for (const forbidden of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALL"]) {
      assert.doesNotMatch(g, new RegExp(`\\b${forbidden}\\b`, "i"), `authenticated نباید ${forbidden} بگیرد: ${g}`);
    }
  }
});

test("قیدهای سازگاری در migration هستند", () => {
  assert.match(STATEMENTS, /cron_runs_finished_consistent/);
  assert.match(STATEMENTS, /cron_runs_failure_has_reason/);
  assert.match(STATEMENTS, /trg_cron_runs_guard/);
});
