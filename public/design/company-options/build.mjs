// Isolated static preview builder. Uses installed lockfile dependencies only.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,"../../..");
const require=createRequire(import.meta.url);
const components=["components/symbol/MonthlySalesCharts.tsx","components/symbol/QuarterlyCharts.tsx","components/symbol/FundamentalCharts.tsx","components/terminal/HistoryChart.tsx"];
const result=await build({absWorkingDir:root,entryPoints:[path.join(here,"entry.tsx")],outfile:path.join(here,"prototype.js"),bundle:true,format:"esm",platform:"browser",target:["es2020"],jsx:"automatic",minify:true,metafile:true,legalComments:"eof",define:{"process.env.NODE_ENV":'"production"'},alias:{"@":root}});
const forbidden=Object.keys(result.metafile.inputs).filter(p=>/lib\/supabase|server-only|app\/api|\.env(?:\.|$)/.test(p.replaceAll("\\","/")));
if(forbidden.length)throw new Error(`Server input in browser preview: ${forbidden.join(",")}`);
const config={...require(path.join(root,"tailwind.config.js")),content:[path.join(here,"entry.tsx"),...components.map(p=>path.join(root,p))],corePlugins:{preflight:false}};
const css=await postcss([tailwind(config)]).process(await readFile(path.join(here,"charts.input.css"),"utf8"),{from:path.join(here,"charts.input.css"),to:path.join(here,"charts.css"),map:false});
await writeFile(path.join(here,"charts.css"),css.css);
const hashes={};
const seal=async p=>createHash("sha256").update((await readFile(p,"utf8")).replaceAll("\r\n","\n")).digest("hex");
for(const p of ["entry.tsx","chart-data.ts","query-state.ts","validate.ts","build.mjs","charts.input.css","prototype.js","charts.css","decision.html","dossier.html"])hashes[p]=await seal(path.join(here,p));
const reused={};for(const p of components)reused[p]=await seal(path.join(root,p));
const financialModules={};for(const p of ["lib/core/monthlyReport.ts","lib/core/quarterly.ts","lib/fundamental/calc.ts"])financialModules[p]=await seal(path.join(root,p));
const locked={};const lock=JSON.parse(await readFile(path.join(root,"package-lock.json"),"utf8"));
for(const p of ["react","react-dom","recharts","lightweight-charts","esbuild","tailwindcss","postcss"]){locked[p]=require(`${p}/package.json`).version;if(lock.packages[`node_modules/${p}`].version!==locked[p])throw new Error(`Installed version differs from lock: ${p}`);}
const manifest={dataset:"P14-EDU-02",baseSnapshot:"5edf1491ad5df8b800bc4a0718857ef4f14ad2dc",priorPreviewSnapshot:"5649582e7336608981614570048e2a4c54d4e4d1",status:"NOT_FOR_MERGE",dataKind:"authored_educational",financialEngineChanged:true,financialChangeScope:"PR361/23 monthly outputs retained; shared calendar used for Fundamental N30 rate/quantity null slots; annual/quarterly/TTM unchanged",rateCoreCandidate:"66765f75abf206a719b089cca6079d857f10b7c9",monthlyGapGuard:"MONTHLY_AND_FUNDAMENTAL_N30_CALENDAR_ENABLED",fundamentalN30Baseline:"23fffa5bb0ee9c7b16bffc7c341afc5d567d97df",quantityBaseline:"dfc07c7309cdbaa3fec3cca93e20ef35e9332b29",quantityUnitContract:"UNCHANGED; existing sanitizer owns unknown units; no unit inference",browserAudit:"PENDING_CURRENT_VERSION",interactionAcceptance:"NOT_RUN",visualAcceptance:"NOT_RUN",historicalEvidence:"P14-EDU-01 screenshots and root audit of snapshot5649582 are historical; neither is evidence for this build.",hashBasis:"SHA256 of UTF8 text with LF newlines (canonical Git text); not raw Windows CRLF bytes",hashes,reused,financialModules,locked,browserInputCount:Object.keys(result.metafile.inputs).length,bundleBytes:result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].bytes};
await writeFile(path.join(here,"build-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({built:true,dataset:manifest.dataset,bundleBytes:manifest.bundleBytes,locked,browserAudit:manifest.browserAudit}));
