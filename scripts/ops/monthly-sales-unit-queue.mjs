import { mkdir, open, readFile, readdir, link, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { candidates, verifyCandidate } from "./monthly-sales-unit-review.mjs";
import { codalAccess } from "../../relay/codal-source-access.mjs";
import publicConfig from "../../lib/liara-public-env.js";

const limitMax = 3;
// OS owns this localhost-only lease. Killing the process releases it without
// deleting a stale file or replaying an item whose durable intent already exists.
async function localLease() {
  const socket = createServer(connection => connection.destroy());
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen({host:"127.0.0.1", port:43629, exclusive:true},resolve);
  });
  return () => new Promise((resolve,reject) => socket.close(error=>error?reject(error):resolve()));
}
const pinnedBackend = "https://62.60.191.24/liara-preview";
const jsonFile = async path => JSON.parse(await readFile(path, "utf8"));
async function save(path, value) {
  const temporary = path + "." + randomUUID() + ".tmp";
  const file = await open(temporary, "wx", 0o600);
  try {
    try { await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); }
    finally { await file.close(); }
    await link(temporary, path);
  } finally { await unlink(temporary); }
}
function readBinding(env) {
  const override = env.FUNDAMENTAL_READ_URL !== undefined || env.FUNDAMENTAL_READ_ANON_KEY !== undefined;
  const pair = publicConfig.liaraPublicEnv(override ? {
    NEXT_PUBLIC_LIARA_API_URL: env.FUNDAMENTAL_READ_URL, NEXT_PUBLIC_LIARA_ANON_KEY: env.FUNDAMENTAL_READ_ANON_KEY,
  } : env);
  if (pair.NEXT_PUBLIC_SUPABASE_URL !== pinnedBackend || !pair.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw Error("Expected the configured read-only Liara binding");
  return pair.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
async function get(url, headers={}) {
  const response=await fetch(url,{headers,method:"GET",credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error("Source read HTTP "+response.status);
  return response.json();
}
function productionReader(origin, env) {
  if (!/^https:\/\/portfolio-platform-(?:fawn|[a-z0-9]+-safariarash7777-4463s-projects)\.vercel\.app$/.test(origin)) throw Error("Expected the project's canonical or preview origin");
  const key = readBinding(env);
  const headers = {apikey:key,Authorization:"Bearer "+key};
  return {
    async current(screen) {
      return get(origin+"/api/screener/monthly-sales?"+new URLSearchParams({period:screen.period,minGrowth:"0"}));
    },
    async checkHold() {
      const state=await get(pinnedBackend+"/rest/v1/ir_market_snapshots?key=eq.codal_engine_state&select=hold:payload-%3EsourceHoldUntil",headers);
      if(!Array.isArray(state)||state.length!==1||!Number.isSafeInteger(state[0].hold)||state[0].hold<0) throw Error("Collector publisher hold unavailable");
      codalAccess.restore(state[0].hold);
      codalAccess.check();
    },
    async verify(item) {
      const rows=await get(pinnedBackend+"/rest/v1/codal_reports?"+new URLSearchParams({
        select:"id,symbol,title,source_url,report_kind,company_name,period_end,raw,data",id:"eq."+item.reportId,
      }),headers);
      if(!Array.isArray(rows)||rows.length!==1) throw Error("Stored immutable report unavailable");
      return verifyCandidate(item, rows[0]);
    },
  };
}

function sameItem(a,b) {
  return b && ["reportId","symbol","periodEnd","sourceUrl","amendment"].every(field=>a[field]===b[field]);
}
// Queue layout: the intent survives a crash, and a result can be created only
// once. A failed or uncertain report is visible to reconciliation on rerun.
async function inventoryAndVerify({screen,directory,limit=0,reader}) {
  const items=candidates(screen).sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd)||a.reportId-b.reportId);
  let files;
  try { files=new Set(await readdir(directory)); }
  catch(error) { if(error.code!=="ENOENT") throw error; files=new Set(); }
  const pending=items.filter(item=>!files.has(item.reportId+".intent.json"));
  const summary={candidates:items.length,pending:pending.length,verified:0,failed:0,uncertain:0,stale:0,attempted:0};
  let holdUntil=0;
  // Include failures from other periods in the same queue's publisher hold.
  for(const name of files) {
    if(!/^\d+\.result\.json$/.test(name)) continue;
    const r=await jsonFile(join(directory,name));
    holdUntil=Math.max(holdUntil,r.holdUntil ?? 0);
  }
  for(const item of items) {
    if(!files.has(item.reportId+".intent.json")) continue;
    if(!files.has(item.reportId+".result.json")) { summary.uncertain++; continue; }
    const existing=await jsonFile(join(directory,item.reportId+".result.json"));
    if(!sameItem(item,existing.item)) throw Error("Checkpoint identity conflict");
    if(!["verified","failed","stale"].includes(existing.outcome)) throw Error("Invalid checkpoint outcome");
    summary[existing.outcome]++;
  }
  if(!limit || !pending.length) return summary;
  if(holdUntil>Date.now()) throw Error("Queue's publisher hold is active");
  await mkdir(directory,{recursive:true});
  const latest=await reader.current(screen);
  if(latest.period!==screen.period || latest.previousPeriod!==screen.previousPeriod) throw Error("Screen period changed");
  const live=new Map(candidates(latest).map(item=>[item.reportId,item]));
  for(const item of pending) {
    if(summary.attempted>=limit) break;
    if(!sameItem(item,live.get(item.reportId))) {
      // Do not permanently suppress an item that could return in a later screen.
      summary.stale++;
      summary.pending--;
      continue;
    }
    await reader.checkHold();
    const stem=join(directory,String(item.reportId));
    try { await save(stem+".intent.json",{item,screenCheckedAt:latest.checkedAt,startedAt:new Date().toISOString()}); }
    catch(error) { if(error.code==="EEXIST") continue; throw error; }
    summary.attempted++;
    summary.pending--;
    let result;
    try {
      const evidence=await reader.verify(item);
      result={outcome:"verified",evidence};
    } catch(error) {
      const failure=String(error?.message ?? "");
      // Use bounded internal labels; request URLs, credentials and provider
      // response bodies must never be included in a receipt.
      const throttled=/429|403|codal_source_challenge/.test(failure);
      const hold=throttled ? Math.max(codalAccess.snapshot(),Date.now()+6*3600000) : 0;
      result={outcome:"failed",reason:throttled?"publisher_hold":failure==="Official document did not verify the stored period, amount and unit"?"document_mismatch":"verification_incomplete",holdUntil:hold};
    }
    await save(stem+".result.json",{item,checkedAt:new Date().toISOString(),...result});
    summary[result.outcome]++;
    if(result.outcome==="failed") break;
  }
  return summary;
}
export async function runQueue(options) {
  const limit = options.limit ?? 0;
  if(!Number.isInteger(limit)||limit<0||limit>limitMax) throw Error("Document budget must be 0–3");
  if(!limit) return inventoryAndVerify(options);
  const release = await localLease();
  try { return await inventoryAndVerify(options); } finally { await release(); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [screenPath,directory,n="0",origin,...extra]=process.argv.slice(2);
  try {
    if(!screenPath || !directory || !/^[0-3]$/.test(n) || extra.length || (Number(n)>0 && !origin)) throw Error("Usage: SCREEN.json CHECKPOINT_DIR [0–3 SITE_ORIGIN]");
    const summary=await runQueue({screen:await jsonFile(screenPath),directory,limit:Number(n),reader:Number(n)>0?productionReader(origin,process.env):null});
    console.log(JSON.stringify(summary));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
