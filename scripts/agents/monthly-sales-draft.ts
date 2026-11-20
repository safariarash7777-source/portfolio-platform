/** Private on-demand review of a saved result from GET /api/screener/monthly-sales.
 * tsx scripts/agents/monthly-sales-draft.ts <screen.json> <symbol> [--draft]
 * Reuses the installed worker lock and hourly/day allowance. No public writes.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { monthlyResearchEvidence } from "../../lib/intelligence/monthly-sales-evidence";
import { inferenceAdmission, requestIdentityAdmission } from "../../lib/intelligence/research-policy";
import { inferResearch, RESEARCH_MODEL } from "./hermes-inference";
import { withResearchLock } from "./research-lock";

async function main() {
  const [filename, symbol, mode] = process.argv.slice(2);
  if (!filename || !symbol || (mode !== undefined && mode !== "--draft")) throw new Error("invalid_arguments");
  const {packet, context, provenance} = monthlyResearchEvidence(JSON.parse(await readFile(filename,"utf8")), symbol);
  if (!mode) { console.log(JSON.stringify({packet, provenance})); return; }
  const root = process.env.PORTFOLIO_RESEARCH_HOME || join(process.env.LOCALAPPDATA || "", "PortfolioResearch");
  const digest = createHash("sha256").update(JSON.stringify([RESEARCH_MODEL, context, provenance])).digest("hex");
  const dir = join(root, "monthly-sales-review");
  const output = join(dir,digest+".json");
  const ran = await withResearchLock(join(root,"worker.lock"), async () => {
    await mkdir(dir,{recursive:true});
    try {
      console.log(await readFile(output,"utf8")); return;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const stateFile = join(root,"state.json");
    const state = JSON.parse(await readFile(stateFile,"utf8"));
    if (requestIdentityAdmission(state) !== "allowed") throw new Error("worker_identity_unverified");
    const admission = inferenceAdmission(state.attempts, Date.now());
    if (admission !== "allowed") throw new Error(admission);
    const at = new Date().toISOString();
    await writeFile(join(dir,digest+".intent"), at, {flag:"wx", mode:0o600});
    state.attempts.push({at});
    await writeFile(stateFile+".monthly-tmp", JSON.stringify(state), {mode:0o600});
    await rename(stateFile+".monthly-tmp",stateFile);
    const draft = await inferResearch(packet,context);
    const receipt = JSON.stringify({model:RESEARCH_MODEL, at, draft, provenance});
    await writeFile(output+".tmp",receipt,{flag:"wx",mode:0o600});
    await rename(output+".tmp",output);
    console.log(receipt);
  });
  if (!ran) throw new Error("worker_busy");
}
main().catch(error => {console.error(error.code === "EEXIST" ? "attempt_needs_review" : error.message); process.exitCode=1;});
