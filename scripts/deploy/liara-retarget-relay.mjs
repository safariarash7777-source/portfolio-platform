import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function envFingerprint(envs) {
  return createHash('sha256').update(JSON.stringify(envs.map(({key,value})=>({key,value})).sort((a,b)=>a.key.localeCompare(b.key,'en')))).digest('hex');
}
export function unrelatedFingerprint(envs) {
  return envFingerprint(envs.filter(x=>!['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].includes(x.key)));
}
export function retargetPlan(project,target) {
  if(project?.project_id!=='arsadata' || project.scale!==1 || project.status!=='ACTIVE') throw new Error('Expected active single arsadata relay');
  if(!Array.isArray(project.envs) || new Set(project.envs.map(x=>x.key)).size!==project.envs.length) throw new Error('Invalid relay variables');
  if(envFingerprint(project.envs)!==target.expectedSourceHash) {
    const current=Object.fromEntries(project.envs.map(x=>[x.key,x.value]));
    if(current.SUPABASE_URL===target.url && current.SUPABASE_SERVICE_ROLE_KEY===target.serviceKey && target.expectedUnrelatedHash===unrelatedFingerprint(project.envs)) return null;
    throw new Error('Relay configuration changed since inventory; refusing overwrite');
  }
  if(target.url!=='https://62.60.191.24/liara-preview') throw new Error('Unexpected database destination');
  const parts=String(target.serviceKey).split('.');
  const claims=parts.length===3 ? JSON.parse(Buffer.from(parts[1],'base64url').toString()) : {};
  if(claims.role!=='service_role' || claims.exp<Date.now()/1000 || claims.iss!=='supabase') throw new Error('Invalid target server credential');
  for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BRSAPI_KEY','RELAY_TOKEN']) {
    if(!project.envs.some(x=>x.key===key && x.value)) throw new Error('Required existing variable missing: '+key);
  }
  return project.envs.map(({key,value})=>({key,value:key==='SUPABASE_URL'?target.url:key==='SUPABASE_SERVICE_ROLE_KEY'?target.serviceKey:value}));
}

let stage='load-target';
async function run() {
  const token=process.env.LIARA_API_TOKEN;
  if(!token || !process.env.LIARA_MIGRATION_TARGET) throw new Error('Migration credential missing');
  const target=JSON.parse(process.env.LIARA_MIGRATION_TARGET);
  async function api(path,method='GET',body) {
    const r=await fetch('https://api.liara.ir'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(40000)});
    if(!r.ok) throw new Error(`Liara ${method} ${path} HTTP ${r.status}`);
    return r.status===204 ? {} : r.json();
  }
  stage='read-existing-relay';
  const before=await api('/v1/projects/arsadata');
  stage='validate-migration-plan';
  const variables=retargetPlan(before.project ?? before.data?.project,target);
  if(variables===null) {
    console.log(JSON.stringify({result:'existing relay already has verified destination; no mutation or restart',relay:'arsadata',scale:1,destination:target.url}));
    return;
  }
  // All unrelated values, including transport/budget flags and provider keys,
  // remain exactly as observed. No second relay or provider request is created.
  stage='update-database-destination';
  await api('/v1/projects/update-envs','POST',{project:'arsadata',variables});
  stage='verify-destination';
  let verified=false;
  for(let attempt=0;attempt<5;attempt++) {
    const after=await api('/v1/projects/arsadata');
    const observed=after.project ?? after.data?.project;
    if(observed.scale===1 && envFingerprint(observed.envs)===envFingerprint(variables)){verified=true;break;}
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  if(!verified) throw new Error('Updated relay configuration did not verify');
  stage='restart-existing-relay';
  await api('/v1/projects/arsadata/actions/restart','POST');
  console.log(JSON.stringify({result:'relay destination verified; existing app restart requested',relay:'arsadata',scale:1,destination:target.url}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  run().catch((error)=>{
    const known=[
      'Migration credential missing','Expected active single arsadata relay',
      'Invalid relay variables','Relay configuration changed since inventory; refusing overwrite',
      'Unexpected database destination','Invalid target server credential',
      'Updated relay configuration did not verify',
    ];
    const message=known.includes(error.message) || /^Liara (GET|POST) \/v1\/projects(?:\/arsadata(?:\/actions\/restart)?|\/update-envs) HTTP \d{3}$/.test(error.message) ? error.message : 'Details withheld to protect credentials';
    console.error(JSON.stringify({result:'migration failed',stage,reason:message}));
    process.exitCode=1;
  });
}
