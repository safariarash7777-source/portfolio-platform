import {rename, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {approvedPreviewBuild} from "../../lib/fundamental/approved-preview-build.mjs";
import {readFixedMonthlyCapture} from "../../lib/fundamental/monthly-capture.node";
import {toPilotSnapshot} from "../../lib/fundamental/monthly-preview-display";

const destination = new URL("../../lib/fundamental/monthly-preview-snapshot.json", import.meta.url);
const statuses = new Set(["binding", "deadline", "transport", "http", "body_cap", "invalid_shape", "partial", "row_cap"]);

async function replace(value: unknown) {
  const temporary = new URL(destination.href + ".tmp");
  await writeFile(temporary, JSON.stringify(value) + "\n", {mode: 0o600});
  await rename(temporary, destination);
}

async function main() {
  // Clear reused build working trees before evaluating any credentials.
  await replace(null);
  const env = process.env;
  if (!approvedPreviewBuild(env)) return;
  const start = performance.now();
  const result = env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? null
    : await readFixedMonthlyCapture({ environment: env, read: fetch });
  const snapshot = toPilotSnapshot(env.VERCEL_GIT_COMMIT_SHA!, result);
  await replace(snapshot);
  const reason = result?.failure;
  const status = snapshot.state === "complete" ? "complete" :
    typeof reason === "string" && statuses.has(reason) ? reason : "unavailable";
  console.log("[fundamental-preview-capture] " + JSON.stringify({
    status, requests: result?.usage.requests ?? 0, rows: result?.usage.rows ?? 0,
    elapsedMs: Math.round(performance.now() - start),
  }));
}

void main().catch(() => {
  console.error("[fundamental-preview-capture] artifact_failure");
  process.exitCode = 1;
});
