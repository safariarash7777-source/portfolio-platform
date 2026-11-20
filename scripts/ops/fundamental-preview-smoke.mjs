import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { fundamentalReadPair } from "../../lib/fundamental/read-config.node.mjs";

const BRANCH = "codex/fundamental-read-reconnect-20261114";
const ISSUER = "فولاد";
const KIND = "ن-۳۰";
const ID = 13719;
const MAX_BYTES = 4096;
const DEADLINE_MS = 4000;
const fields = [
  "id", "symbol", "report_kind", "period_end",
  "financial_symbol:data->>symbol", "financial_kind:data->>report_kind",
  "financial_period:data->>period_end", "financial_months:data->period_months",
  "unit:data->>unit", "amount:data->period_total_amount",
];

export function approvedPreviewBuild(env) {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_PROVIDER === "github" && env.VERCEL_GIT_COMMIT_REF === BRANCH &&
    typeof env.VERCEL_GIT_COMMIT_SHA === "string" && /^[0-9a-f]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA);
}

function matchesReviewedReport(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    value.id === ID && value.symbol === ISSUER && value.report_kind === KIND &&
    value.period_end === "2026-10-22" && value.financial_symbol === ISSUER &&
    value.financial_kind === KIND && value.financial_period === "1405-07-30" &&
    value.financial_months === 1 && value.unit === "میلیون ریال" && value.amount === 662639489;
}

function cancel(target) {
  if (target) void target.cancel().catch(() => {});
}

/** Added preflight only. No customer route or repeat/retry from this code. */
export async function runFundamentalPreviewSmoke(env, read = fetch) {
  if (!approvedPreviewBuild(env)) return null;
  const start = performance.now();
  let rows = 0;
  let requests = 0;
  function done(status) { return { status, requests, rows, elapsedMs: Math.round(performance.now() - start) }; }

  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return done("unsafe_tls_configuration");
  const binding = fundamentalReadPair(env);
  if (!binding || binding.expiresAt <= Date.now() / 1000) return done("invalid_binding");

  const url = new URL(binding.url + "/rest/v1/codal_reports");
  url.search = new URLSearchParams({
    id: `eq.${ID}`, symbol: `eq.${ISSUER}`, report_kind: `eq.${KIND}`,
    data: "not.is.null", select: fields.join(","), limit: "1",
  }).toString();

  const signal = AbortSignal.timeout(DEADLINE_MS);
  let phase = "transport_failure";
  try {
    requests++;
    const response = await read(url, {
      method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal,
      headers: { apikey: binding.anon, authorization: `Bearer ${binding.anon}`, accept: "application/json" },
    });
    if (response.status !== 200) { cancel(response.body); return done("http_not_complete"); }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
      cancel(response.body); return done("unexpected_media_type");
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      cancel(response.body); return done("body_limit");
    }
    const reader = response.body?.getReader();
    if (!reader) return done("unexpected_body");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let body = "";
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES) return done("body_limit");
        phase = "unexpected_body";
        body += decoder.decode(part.value, { stream: true });
        phase = "transport_failure";
      }
      phase = "unexpected_body";
      body += decoder.decode();
    } finally { cancel(reader); }

    const decoded = JSON.parse(body);
    if (!Array.isArray(decoded) || decoded.length > 1) return done("unexpected_body");
    if (decoded.length === 0) return done("row_not_visible");
    rows = 1;
    if (!matchesReviewedReport(decoded[0])) return done("projection_mismatch");
    if (signal.aborted) return done("deadline");
    return done("matched_reviewed_row");
  } catch {
    // Never log stringified URL, raw exception/headers/body or binding.
    return done(signal.aborted ? "deadline" : phase);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await runFundamentalPreviewSmoke(process.env);
    if (receipt) {
      console.info("fundamental_preview_smoke", JSON.stringify(receipt));
      if (receipt.status !== "matched_reviewed_row") process.exitCode = 1;
    }
  } catch {
    console.info("fundamental_preview_smoke", JSON.stringify({ status: "unexpected_failure" }));
    process.exitCode = 1;
  }
}
