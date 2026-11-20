import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { approvedPreviewBuild, runFundamentalPreviewSmoke } from "./fundamental-preview-smoke.mjs";

const origin = "https://62.60.191.24/liara-preview";
function fixtureToken(claims = {}, header = {}) {
  return [
    { typ: "JWT", alg: "HS256", ...header },
    { role: "anon", iss: "supabase", exp: 4102444800, ...claims },
    "local synthetic test not a real credential",
  ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
}
function env(overrides = {}) {
  return {
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_PROVIDER: "github",
    VERCEL_GIT_COMMIT_REF: "codex/fundamental-read-reconnect-20261114",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), FUNDAMENTAL_READ_URL: origin,
    FUNDAMENTAL_READ_ANON_KEY: fixtureToken(), ...overrides,
  };
}
const healthy = Object.freeze({
  id: 13719, symbol: "فولاد", report_kind: "ن-۳۰", period_end: "2026-10-22",
  financial_symbol: "فولاد", financial_kind: "ن-۳۰", financial_period: "1405-07-30",
  financial_months: 1, unit: "میلیون ریال", amount: 662639489,
});
const allowed = ["status", "requests", "rows", "elapsedMs"];
const request = data => {
  let calls = 0;
  return {
    get calls() { return calls; },
    read: async (url, opts) => {
      calls++;
      assert.equal(url.origin + url.pathname, origin + "/rest/v1/codal_reports");
      assert.deepEqual([...url.searchParams.keys()].sort(), ["data", "id", "limit", "report_kind", "select", "symbol"]);
      assert.equal(url.searchParams.get("id"), "eq.13719");
      assert.equal(url.searchParams.get("symbol"), "eq.فولاد");
      assert.equal(url.searchParams.get("report_kind"), "eq.ن-۳۰");
      assert.equal(url.searchParams.get("data"), "not.is.null");
      assert.equal(url.searchParams.get("limit"), "1");
      const columns = url.searchParams.get("select").split(",");
      assert.equal(columns.length, 10);
      assert.ok(!columns.includes("data") && !columns.includes("raw"));
      assert.ok(columns.includes("amount:data->period_total_amount"));
      assert.ok(columns.includes("financial_period:data->>period_end"));
      assert.equal(opts.method, "GET");
      assert.equal(opts.redirect, "error");
      assert.equal(opts.credentials, "omit");
      assert.equal(opts.cache, "no-store");
      assert.equal(opts.headers.authorization, "Bearer " + fixtureToken());
      assert.equal(opts.headers.apikey, fixtureToken());
      assert.equal(opts.headers.prefer, undefined);
      assert.ok(opts.signal instanceof AbortSignal);
      return typeof data === "function" ? data(opts) : data;
    },
  };
};

test("off, main, production, absent, or untrusted provider do not read binding or network", async () => {
  const cases = [
    { VERCEL: undefined }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" },
    { VERCEL_GIT_PROVIDER: "gitlab" }, { VERCEL_GIT_PROVIDER: undefined }, { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "codex/fundamental-read-reconnect-20261114-extra" },
    { VERCEL_GIT_COMMIT_SHA: undefined }, { VERCEL_GIT_COMMIT_SHA: "a".repeat(39) },
  ];
  for (const overrides of cases) {
    const input = env(overrides);
    Object.defineProperty(input, "FUNDAMENTAL_READ_URL", { get() { assert.fail("read binding for off"); } });
    assert.equal(approvedPreviewBuild(input), false);
    assert.equal(await runFundamentalPreviewSmoke(input, assert.fail), null);
  }
});
test("invalid/privileged/expired/malformed pair and unsafe TLS cannot issue a request", async () => {
  const pairs = [
    { FUNDAMENTAL_READ_URL: "http://wrong.invalid" }, { FUNDAMENTAL_READ_URL: origin + "/" },
    { FUNDAMENTAL_READ_ANON_KEY: fixtureToken({ role: "service_role" }) },
    { FUNDAMENTAL_READ_ANON_KEY: fixtureToken({ exp: 1 }) },
    { FUNDAMENTAL_READ_ANON_KEY: fixtureToken({ iss: "outside" }) },
    { FUNDAMENTAL_READ_ANON_KEY: fixtureToken({}, { alg: "none" }) },
    { FUNDAMENTAL_READ_ANON_KEY: "unparseable" }, { FUNDAMENTAL_READ_ANON_KEY: undefined },
  ];
  for (const overrides of pairs) {
    const r = await runFundamentalPreviewSmoke(env(overrides), assert.fail);
    assert.equal(r.status, "invalid_binding");
    assert.equal(r.requests, 0);
  }
  assert.equal((await runFundamentalPreviewSmoke(env({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }), assert.fail)).status,
    "unsafe_tls_configuration");
});
test("one exact query returns a redacted fixed-format matched receipt", async () => {
  const transport = request(Response.json([healthy]));
  const r = await runFundamentalPreviewSmoke(env(), transport.read);
  assert.deepEqual(Object.keys(r), allowed);
  assert.deepEqual([r.status, r.requests, r.rows], ["matched_reviewed_row", 1, 1]);
  assert.equal(transport.calls, 1);
  assert.doesNotMatch(JSON.stringify(r), /13719|662639489|فولاد|62\.60|fixture|\.invalid/);
});
test("transport/TLS/redirect, noncomplete HTTP, body and projection failures never retry or leak details", async () => {
  const probes = [
    [() => { throw new Error("raw upstream URL, credential or redirect"); }, "transport_failure", 0],
    [new Response("private auth message", { status: 401 }), "http_not_complete", 0],
    [new Response("redirect", { status: 307 }), "http_not_complete", 0],
    [Response.json([healthy], { status: 206 }), "http_not_complete", 0],
    [new Response("private HTML"), "unexpected_media_type", 0],
    [new Response("[]", { headers: { "content-type": "application/json", "content-length": "4097" } }), "body_limit", 0],
    [new Response("x".repeat(4097), { headers: { "content-type": "application/json" } }), "body_limit", 0],
    [new Response("not JSON", { headers: { "content-type": "application/json" } }), "unexpected_body", 0],
    [new Response(Uint8Array.from([0xc3, 0x28]), { headers: { "content-type": "application/json" } }), "unexpected_body", 0],
    [Response.json([healthy, healthy]), "unexpected_body", 0],
    [Response.json([]), "row_not_visible", 0],
    [Response.json([{ ...healthy, id: 1 }]), "projection_mismatch", 1],
    [Response.json([{ ...healthy, amount: "662639489" }]), "projection_mismatch", 1],
    [Response.json([{ ...healthy, raw: "unexpected private field" }]), "projection_mismatch", 1],
  ];
  for (const [response, expectedStatus, rows] of probes) {
    const transport = request(response);
    const r = await runFundamentalPreviewSmoke(env(), transport.read);
    assert.deepEqual(Object.keys(r), allowed);
    assert.deepEqual([r.status, r.requests, r.rows], [expectedStatus, 1, rows]);
    assert.equal(transport.calls, 1);
    assert.doesNotMatch(JSON.stringify(r), /private|upstream|13719|662639489|62\.60/);
  }
});
test("one fixed total deadline aborts transport; no retry", async () => {
  const hold = setInterval(() => {}, 1000);
  try {
    const transport = request(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const r = await runFundamentalPreviewSmoke(env(), transport.read);
    assert.equal(r.status, "deadline");
    assert.equal(transport.calls, 1);
    assert.ok(r.elapsedMs >= 3900 && r.elapsedMs <= 5500);
  } finally { clearInterval(hold); }
});
test("actual npm lifecycle entrypoint stays silent off and exits nonzero only for enabled failed smoke", () => {
  const cli = fileURLToPath(new URL("./fundamental-preview-smoke.mjs", import.meta.url));
  const base = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_PROVIDER: "github",
    VERCEL_GIT_COMMIT_REF: "codex/fundamental-read-reconnect-20261114",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40) };
  const off = spawnSync(process.execPath, [cli], { env: { ...base, VERCEL_ENV: "production" }, encoding: "utf8" });
  assert.deepEqual([off.status, off.stderr, off.stdout], [0, "", ""]);
  const on = spawnSync(process.execPath, [cli], { env: base, encoding: "utf8" });
  assert.deepEqual([on.status, on.stderr], [1, ""]);
  assert.match(on.stdout, /^fundamental_preview_smoke \{"status":"invalid_binding","requests":0,"rows":0,"elapsedMs":\d+\}\n$/);
});
