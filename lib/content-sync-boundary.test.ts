import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(source: string, imports: Record<string, unknown>, env: Record<string, string>) {
  const taskModule = { exports: {} as Record<string, (...args: never[]) => unknown> };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: taskModule, exports: taskModule.exports,
    require: (name: string) => {
      if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
    process: { env },
  });
  return taskModule.exports;
}

test("content sync cannot silently use the shared service-role key", () => {
  const source = readFileSync(new URL("./supabase/content-sync.ts", import.meta.url), "utf8");
  const calls: Array<{ url: string; key: string; options: unknown }> = [];
  const imports = {
    "server-only": {},
    "@supabase/supabase-js": {
      createClient: (url: string, key: string, options: unknown) => {
        calls.push({ url, key, options });
        return { marker: "content-client" };
      },
    },
  };
  const sharedOnly = load(source, imports, {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-shared-key",
  });
  assert.equal(sharedOnly.tryCreateContentSyncClient(), null);
  assert.equal(calls.length, 0);

  const dedicated = load(source, imports, {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.invalid",
    CONTENT_SYNC_SERVICE_ROLE_KEY: "synthetic-content-key",
  });
  assert.deepEqual(dedicated.tryCreateContentSyncClient(), { marker: "content-client" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://database.example.invalid");
  assert.equal(calls[0].key, "synthetic-content-key");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options)), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

type JsonResult = { status: number; body: Record<string, unknown> };

function cronRoute(options: { ledgerRecorded: boolean; runId: string | null; syncOk: boolean; unexpectedFailure?: boolean }) {
  const source = readFileSync(new URL("../app/api/cron/telegram-sync/route.ts", import.meta.url), "utf8");
  const dedicatedClient = { marker: "dedicated" };
  let clientCalls = 0;
  let jobCalls = 0;
  let ledgerArgs: unknown[] | null = null;
  const exports = load(source, {
    "next/server": { NextResponse: { json: (body: Record<string, unknown>, init?: { status: number }): JsonResult =>
      ({ status: init?.status ?? 200, body }) } },
    "@/lib/telegram-sync": { runTelegramFeedSync: async () => {
      jobCalls++;
      return { ok: options.syncOk, found: 2, inserted: options.syncOk ? 1 : 0,
        ...(!options.syncOk ? { reason: "feed_unreachable" } : {}) };
    } },
    "@/lib/cron/store": { createCronLedgerStore: (...args: unknown[]) => {
      ledgerArgs = args;
      return { marker: "ledger" };
    }, currentDeploymentSha: () => "synthetic-sha" },
    "@/lib/supabase/content-sync": { tryCreateContentSyncClient: () => {
      clientCalls++;
      return dedicatedClient;
    } },
    "@/lib/cron/ledger": { runWithLedger: async (args: {
      job: () => Promise<{ value: unknown }>;
    }) => {
      if (options.unexpectedFailure) {
        return { result: undefined, ledgerRecorded: options.ledgerRecorded, runId: options.runId };
      }
      const { value } = await args.job();
      return { result: value, ledgerRecorded: options.ledgerRecorded, runId: options.runId };
    } },
  }, { CRON_SECRET: "synthetic-cron-secret" });
  return {
    get: exports.GET as (request: { headers: { get: () => string | null } }) => Promise<JsonResult>,
    get clientCalls() { return clientCalls; },
    get jobCalls() { return jobCalls; },
    get ledgerArgs() { return ledgerArgs; },
    dedicatedClient,
  };
}

test("cron authenticates before client creation and reports whether its ledger was recorded", async () => {
  const route = cronRoute({ ledgerRecorded: true, runId: "synthetic-run", syncOk: true });
  assert.equal((await route.get({ headers: { get: () => "wrong" } })).status, 401);
  assert.equal(route.clientCalls, 0);
  assert.equal(route.jobCalls, 0);

  const success = await route.get({ headers: { get: () => "Bearer synthetic-cron-secret" } });
  assert.equal(success.status, 200);
  assert.equal(success.body.ok, true);
  assert.equal(success.body.ledgerRecorded, true);
  assert.equal(success.body.runId, "synthetic-run");
  assert.equal(route.clientCalls, 1);
  assert.equal(route.jobCalls, 1);
  assert.equal(route.ledgerArgs?.[0], route.dedicatedClient);
  assert.equal(route.ledgerArgs?.[1], "CONTENT_SYNC_SERVICE_ROLE_KEY");
});

test("a successful sync does not pretend an unrecorded ledger is healthy", async () => {
  const route = cronRoute({ ledgerRecorded: false, runId: null, syncOk: true });
  const response = await route.get({ headers: { get: () => "Bearer synthetic-cron-secret" } });
  assert.equal(response.status, 200);
  assert.equal(response.body.ledgerRecorded, false);
  assert.equal(response.body.runId, null);
});

test("a failed sync reports its failure and ledger receipt separately", async () => {
  const route = cronRoute({ ledgerRecorded: true, runId: "synthetic-failed-run", syncOk: false });
  const response = await route.get({ headers: { get: () => "Bearer synthetic-cron-secret" } });
  assert.equal(response.status, 502);
  assert.equal(response.body.reason, "feed_unreachable");
  assert.equal(response.body.ledgerRecorded, true);
  assert.equal(response.body.runId, "synthetic-failed-run");
});

test("an unexpected job exception stays a bounded failure with its ledger receipt", async () => {
  const route = cronRoute({ ledgerRecorded: true, runId: "synthetic-exception-run",
    syncOk: false, unexpectedFailure: true });
  const response = await route.get({ headers: { get: () => "Bearer synthetic-cron-secret" } });
  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.reason, "unhandled_exception");
  assert.equal(response.body.ledgerRecorded, true);
  assert.equal(response.body.runId, "synthetic-exception-run");
});
