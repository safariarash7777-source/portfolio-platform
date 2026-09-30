import { writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const token=process.env.LIARA_API_TOKEN;
if(!token) throw new Error('Liara credential missing');
async function get(url) {
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  if(!r.ok) return {status:r.status};
  return {status:r.status,data:await r.json()};
}
try {
  const details=await get('https://api.liara.ir/v1/projects/arsadata');
  if(details.status!==200) throw new Error(`Relay inventory HTTP ${details.status}`);
  const relay=details.data.project ?? details.data.data?.project;
  if(!relay || relay.project_id!=='arsadata') throw new Error('Unexpected relay inventory identity');
  const mail=await get('https://mail-service.liara.ir/api/v1/mails');
  const output={checkedAt:new Date().toISOString(),relay,mail};
  const privatePath='migration-inventory.private.json';
  try {
    writeFileSync(privatePath,JSON.stringify(output),{mode:0o600});
    const sealed=spawnSync('openssl',['cms','-encrypt','-aes-256-gcm','-binary','-outform','DER','-in',privatePath,'-out','migration-inventory.p7m','scripts/deploy/migration-recipient.pem'],{stdio:'ignore'});
    if(sealed.status!==0) throw new Error('Inventory encryption failed');
  } finally { try { unlinkSync(privatePath); } catch {} }
  console.log(JSON.stringify({result:'encrypted inventory prepared',relay:'arsadata',mailStatus:mail.status}));
} catch(e) {
  const safe=String(e?.message ?? 'failure').replaceAll(token,'[redacted]');
  console.error(safe); process.exitCode=1;
}
