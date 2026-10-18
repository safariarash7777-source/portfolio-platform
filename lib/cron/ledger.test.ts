import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { AlertEvaluationResult, CryptoRow, MarketData } from "@/lib/market";
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

// Execute the actual alerts handler and ledger, with only external I/O replaced.
// No market provider, Supabase writer or Telegram dispatcher is loaded.
function alertsRoute(options: {
  marketOk?: boolean;
  throws?: "market" | "evaluation";
  ledgerFailure?: "start" | "finish";
  evaluation?: AlertEvaluationResult;
  market?: Pick<ReturnType<typeof alertEvaluator>, "getMarketData" | "evaluateAlerts">;
} = {}) {
  const calls: string[] = [];
  const finishes: Array<{ status: string; errorCode: string | null }> = [];
  const store = fakeStore({
    async startRun() {
      calls.push("start");
      if (options.ledgerFailure === "start") throw new Error("ledger unavailable");
      return { id: "alerts-test-run" };
    },
    async finishRun(_id, input) {
      finishes.push({ status: input.status, errorCode: input.errorCode });
      return options.ledgerFailure === "finish" ? { error: new Error("finish failed") } : {};
    },
  });
  const routeModule = { exports: {} as { GET: (req: { headers: Headers }) => Promise<Response> } };
  const source = readFileSync(join(process.cwd(), "app/api/cron/alerts/route.ts"), "utf8");
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/cron/ledger": { runWithLedger },
    "@/lib/cron/store": {
      createCronLedgerStore: () => { calls.push("store"); return store; },
      currentDeploymentSha: () => "test-sha",
    },
    "@/lib/market": options.market ?? {
      getMarketData: async () => {
        calls.push("market");
        if (options.throws === "market") throw new Error("sensitive upstream detail");
        return { ok: options.marketOk ?? true, crypto: [], fetchedAt: 1234 };
      },
      evaluateAlerts: async (crypto: unknown[]) => {
        calls.push("evaluate");
        assert.equal(crypto.length, 0); // no active alerts is still a valid evaluation
        if (options.throws === "evaluation") throw new Error("sensitive evaluation detail");
        return options.evaluation ?? { ok: true, evaluated: true };
      },
    },
  };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: routeModule, exports: routeModule.exports,
    require: (name: string) => {
      if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    process: { env: { CRON_SECRET: "example-cron-secret" } },
  });
  return {
    calls, finishes,
    get: (authorized = true) => routeModule.exports.GET({ headers: new Headers({
      authorization: authorized ? "Bearer example-cron-secret" : "wrong",
    }) }),
  };
}

test("alerts route rejects unauthorized calls before ledger or job I/O", async () => {
  const route = alertsRoute();
  const response = await route.get(false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false });
  assert.deepEqual(route.calls, []);
});

test("alerts route reports unavailable market data as failure without evaluation", async () => {
  const route = alertsRoute({ marketOk: false });
  const response = await route.get();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    ok: false, reason: "market_data_unavailable", evaluated: false, at: 1234,
    ledgerRecorded: true, runId: "alerts-test-run",
  });
  assert.deepEqual(route.calls, ["store", "start", "market"]);
  assert.deepEqual(route.finishes, [{ status: "failed", errorCode: "market_data_unavailable" }]);
});

for (const throws of ["market", "evaluation"] as const) {
  test(`alerts route returns valid bounded JSON when ${throws} throws`, async () => {
    const route = alertsRoute({ throws });
    const response = await route.get();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false, reason: "unhandled_exception", ledgerRecorded: true, runId: "alerts-test-run",
    });
    assert.deepEqual(route.finishes, [{ status: "failed", errorCode: "unhandled_exception" }]);
  });
}

test("alerts route preserves a successful evaluation and its ledger receipt", async () => {
  const route = alertsRoute();
  const response = await route.get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, evaluated: true, at: 1234, ledgerRecorded: true, runId: "alerts-test-run",
  });
  assert.deepEqual(route.calls, ["store", "start", "market", "evaluate"]);
  assert.deepEqual(route.finishes, [{ status: "succeeded", errorCode: null }]);
});

for (const ledgerFailure of ["start", "finish"] as const) {
  test(`alerts route keeps a successful job successful when ledger ${ledgerFailure} fails`, async () => {
    const route = alertsRoute({ ledgerFailure });
    const response = await route.get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true, evaluated: true, at: 1234, ledgerRecorded: false,
      runId: ledgerFailure === "start" ? null : "alerts-test-run",
    });
    assert.ok(route.calls.includes("evaluate"));
  });
}

test("alerts route records explicit evaluation failures instead of a successful no-op", async () => {
  for (const reason of ["alerts_backend_unavailable", "alerts_read_failed", "telegram_links_read_failed",
    "alert_claim_failed", "alert_delivery_failed", "alert_evaluation_failed"] as const) {
    const route = alertsRoute({ evaluation: { ok: false, evaluated: false, reason } });
    const response = await route.get();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false, evaluated: false, reason, at: 1234, ledgerRecorded: true, runId: "alerts-test-run",
    });
    assert.deepEqual(route.finishes, [{ status: "failed", errorCode: reason }]);
  }
});

function alertEvaluator(options: {
  missingKey?: boolean;
  noAlerts?: boolean;
  alertsError?: boolean;
  linksError?: boolean;
  claimError?: boolean;
  claimThrows?: boolean;
  lostClaim?: boolean;
  sendFails?: boolean;
  emptyAfterClaim?: boolean;
  fetchGate?: Promise<void>;
  sendGate?: Promise<void>;
  onSendStarted?: () => void;
} = {}) {
  const calls: string[] = [];
  const claims: unknown[] = [];
  const marketModule = { exports: {} as {
    evaluateAlerts: (rows: CryptoRow[]) => Promise<AlertEvaluationResult>;
    getMarketData: (options?: { onAlertEvaluation?: (result: AlertEvaluationResult) => void }) => Promise<MarketData>;
  } };
  const client = {
    from: (table: string) => {
      calls.push(`read:${table}`);
      const query = {
        select: () => query, eq: () => query, in: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(table === "price_alerts" ? {
          data: options.alertsError ? null : options.noAlerts || (options.emptyAfterClaim && claims.length > 0) ? [] : [
            { id: "synthetic-alert", user_id: "synthetic-user", symbol: "bitcoin", condition: "above", target_price: 10 },
          ], error: options.alertsError ? { message: "private database detail" } : null,
        } : {
          data: options.linksError ? null : [{ user_id: "synthetic-user", telegram_user_id: 123 }],
          error: options.linksError ? { message: "private link detail" } : null,
        })),
      };
      return query;
    },
    rpc: async (name: string, args: unknown) => {
      assert.equal(name, "claim_alert");
      calls.push("claim"); claims.push(args);
      if (options.claimThrows) throw new Error("private claim detail");
      return { data: options.claimError || options.lostClaim ? null : true,
        error: options.claimError ? { message: "private claim detail" } : null };
    },
  };
  const imports: Record<string, unknown> = {
    "server-only": {},
    "./deadline": { withDeadline: (work: (signal: AbortSignal) => unknown) => work(new AbortController().signal) },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.push("admin"); return client; } },
    "@/lib/telegram": { sendMessage: async () => {
      calls.push("send");
      options.onSendStarted?.();
      await options.sendGate;
      return !options.sendFails;
    } },
    "@/lib/format": { toPersianDigits: (value: string) => value },
  };
  runInNewContext(ts.transpileModule(readFileSync(join(process.cwd(), "lib/market.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: marketModule, exports: marketModule.exports,
    require: (name: string) => {
      if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    process: { env: options.missingKey ? {} : { SUPABASE_SERVICE_ROLE_KEY: "example-service-key" } },
    console: { error: () => undefined },
    fetch: async () => {
      calls.push("market-fetch-stub");
      await options.fetchGate;
      return Response.json([{ id: "bitcoin", symbol: "btc", current_price: 11 }]);
    },
  });
  return { ...marketModule.exports, calls, claims };
}

const alertPrices: CryptoRow[] = [{ id: "bitcoin", symbol: "BTC", faName: "نمونه", price: 11, change24h: null, image: null }];

test("actual evaluator distinguishes missing access, failed reads and successful empty alerts", async () => {
  for (const [options, expected] of [
    [{ missingKey: true }, { ok: false, evaluated: false, reason: "alerts_backend_unavailable" }],
    [{ alertsError: true }, { ok: false, evaluated: false, reason: "alerts_read_failed" }],
    [{ noAlerts: true }, { ok: true, evaluated: true }],
  ] as const) {
    const evaluator = alertEvaluator(options);
    assert.deepEqual(JSON.parse(JSON.stringify(await evaluator.evaluateAlerts(alertPrices))), expected);
    assert.ok(!evaluator.calls.includes("claim"));
    assert.ok(!evaluator.calls.includes("send"));
    if ("missingKey" in options) assert.deepEqual(evaluator.calls, []);
  }
});

test("actual evaluator reports partial failures without changing channel, claim or dispatch order", async () => {
  for (const [options, reason, expectedCalls, channel] of [
    [{ linksError: true }, "telegram_links_read_failed", ["admin", "read:price_alerts", "read:telegram_links", "claim"], "in_app"],
    [{ claimError: true }, "alert_claim_failed", ["admin", "read:price_alerts", "read:telegram_links", "claim"], "telegram"],
    [{ claimThrows: true }, "alert_evaluation_failed", ["admin", "read:price_alerts", "read:telegram_links", "claim"], "telegram"],
    [{ sendFails: true }, "alert_delivery_failed", ["admin", "read:price_alerts", "read:telegram_links", "claim", "send"], "telegram"],
    [{}, undefined, ["admin", "read:price_alerts", "read:telegram_links", "claim", "send"], "telegram"],
    [{ lostClaim: true }, undefined, ["admin", "read:price_alerts", "read:telegram_links", "claim"], "telegram"],
  ] as const) {
    const evaluator = alertEvaluator(options);
    const result = await evaluator.evaluateAlerts(alertPrices);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), reason ? { ok: false, evaluated: false, reason } : { ok: true, evaluated: true });
    assert.deepEqual(evaluator.calls, expectedCalls);
    assert.deepEqual(JSON.parse(JSON.stringify(evaluator.claims)), [{ p_alert_id: "synthetic-alert", p_price: 11, p_channel: channel }]);
  }
});

test("actual traffic caller keeps valid market data when alert evaluation is unavailable", async () => {
  const market = alertEvaluator({ missingKey: true });
  const result = await market.getMarketData();
  assert.equal(result.ok, true);
  assert.equal(result.crypto[0].price, 11);
  assert.deepEqual(market.calls, ["market-fetch-stub"]);
  assert.deepEqual(Object.keys(result).sort(), ["crypto", "fetchedAt", "goldGlobal", "ok"]);
});

test("actual cron retains a refresh delivery failure when its explicit evaluation is then empty", async () => {
  const market = alertEvaluator({ sendFails: true, emptyAfterClaim: true });
  const route = alertsRoute({ market });
  const response = await route.get();
  assert.equal(response.status, 502);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "alert_delivery_failed");
  assert.equal(result.evaluated, false);
  assert.equal(result.ledgerRecorded, true);
  assert.deepEqual(route.finishes, [{ status: "failed", errorCode: "alert_delivery_failed" }]);
  assert.deepEqual(market.calls, ["market-fetch-stub", "admin", "read:price_alerts", "read:telegram_links",
    "claim", "send", "admin", "read:price_alerts"]);
});

test("refresh observers share an in-flight result but are not called on cache hits", async () => {
  const market = alertEvaluator({ noAlerts: true });
  const observed: AlertEvaluationResult[] = [];
  const options = { onAlertEvaluation: (result: AlertEvaluationResult) => { observed.push(result); } };
  await Promise.all([market.getMarketData(options), market.getMarketData(options)]);
  assert.equal(observed.length, 2);
  assert.ok(observed.every(result => result.ok));
  assert.deepEqual(market.calls, ["market-fetch-stub", "admin", "read:price_alerts"]);
  await market.getMarketData(options);
  assert.equal(observed.length, 2);
});

test("actual cron observes a failed refresh started by another reader before it joined", async () => {
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>(resolve => { releaseFetch = resolve; });
  const market = alertEvaluator({ sendFails: true, emptyAfterClaim: true, fetchGate });
  const trafficRead = market.getMarketData();
  const route = alertsRoute({ market });
  const cronResponse = route.get();
  // The authorized cron passes startRun and joins the still-blocked refresh.
  await Promise.resolve();
  releaseFetch();
  const [traffic, response] = await Promise.all([trafficRead, cronResponse]);
  assert.equal(traffic.ok, true);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).reason, "alert_delivery_failed");
  assert.deepEqual(route.finishes, [{ status: "failed", errorCode: "alert_delivery_failed" }]);
  assert.equal(market.calls.filter(call => call === "market-fetch-stub").length, 1);
  assert.equal(market.calls.filter(call => call === "send").length, 1);
  assert.equal(market.calls.filter(call => call === "read:price_alerts").length, 2);
});

test("cron observers join an active delivery after cache fill while ordinary readers keep cached data", async () => {
  let releaseSend!: () => void;
  let markSendStarted!: () => void;
  const sendGate = new Promise<void>(resolve => { releaseSend = resolve; });
  const sendStarted = new Promise<void>(resolve => { markSendStarted = resolve; });
  const market = alertEvaluator({ sendFails: true, emptyAfterClaim: true, sendGate, onSendStarted: markSendStarted });
  const refresh = market.getMarketData();
  await sendStarted; // source cache is populated, but its first delivery is pending
  const cached = await market.getMarketData();
  assert.equal(cached.ok, true); // normal readers are not delayed by notification I/O

  const route = alertsRoute({ market });
  const pendingResponse = route.get();
  await Promise.resolve(); // startRun completes and cron joins the pending refresh
  // Explicit evaluation must wait for the refresh receipt, despite the warm cache.
  assert.equal(market.calls.filter(call => call === "read:price_alerts").length, 1);
  releaseSend();
  const [, response] = await Promise.all([refresh, pendingResponse]);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).reason, "alert_delivery_failed");
  assert.deepEqual(route.finishes, [{ status: "failed", errorCode: "alert_delivery_failed" }]);
  assert.equal(market.calls.filter(call => call === "read:price_alerts").length, 2);
  assert.equal(market.calls.filter(call => call === "send").length, 1);
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
