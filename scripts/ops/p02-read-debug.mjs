// Read-only debug route. Credential is loaded privately and never persisted.
import fs from 'node:fs';
const inventory=JSON.parse(fs.readFileSync('C:/Users/Asus/supabase-backups/migration-20260930/inventory-after.private.json','utf8'));
const token=inventory.relay.envs.find(e=>e.key==='RELAY_TOKEN')?.value;
if(!token||!process.argv[2]) throw new Error('Existing private access/output required');
const res=await fetch('https://arsadata.liara.run/debug',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(35000)});
if(!res.ok) throw new Error(`Debug HTTP ${res.status}`);
const d=await res.json();
const select=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o?.[k]??null]));
const numberMap=o=>o&&typeof o==='object'?Object.fromEntries(Object.entries(o).filter(([k,v])=>/^[a-z0-9-]{1,64}$/.test(k)&&Number.isSafeInteger(v)&&v>=0)):null;
const b=d.brsapiLegacy?.budget;
const safe={observedAt:new Date().toISOString(),httpStatus:res.status,
 ...select(d,['ageSec','lastRefresh','counts']),
 transport:select(d.brsapiTransport,['enabled','scope','spacingMs','pending','sent','minStartGapMs']),
 legacy:{enforced:d.brsapiLegacy?.enforced??null,
  used:numberMap(d.brsapiLegacy?.used),rejected:numberMap(d.brsapiLegacy?.rejected),
  overBudgetPassed:numberMap(d.brsapiLegacy?.overBudgetPassed),
  unmetered:Number.isSafeInteger(d.brsapiLegacy?.unmetered)?d.brsapiLegacy.unmetered:null,
  scope:'process_counters_not_verified_daily_prior_usage'},
 budget:select(b,['day','persistent','softBudget','hardCeiling','used','remaining','remainingKnown','usedByClass','rejectedByBudget']),
 budgetStore:select(b?.store,['healthy','errors','degradedCeiling','degradedUsed']),
 budgetLease:select(b?.lease,['granted','spent','remaining','calls']),
 budgetStop:select(d.brsapiBudgetStop,['active','servedAgeMs']),
 db:select(d.supabase,['ok','status','at']),
 clientEnabled:d.brsapiClient?.enabled??null,
 sources:Object.fromEntries(Object.entries(d.sources??{}).map(([k,v])=>[k,select(v,['ok','count','at'])]))};
fs.writeFileSync(process.argv[2],JSON.stringify(safe,null,2)+'\n');
console.log(JSON.stringify({observedAt:safe.observedAt,httpStatus:res.status,transport:safe.transport,budgetStore:safe.budgetStore,clientEnabled:safe.clientEnabled}));
