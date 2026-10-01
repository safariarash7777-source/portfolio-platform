import fs from 'node:fs/promises';
const endpoint = process.argv[2];
if (!endpoint?.startsWith('ws://127.0.0.1:')) throw Error('Only an observed local synthetic browser endpoint is allowed');
const ws = new WebSocket(endpoint);
await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
let id=0; const waiting=new Map();
ws.onmessage=({data}) => { const message=JSON.parse(data); const p=waiting.get(message.id); if(p){waiting.delete(message.id); message.error?p.reject(Error(message.error.message)):p.resolve(message.result);} };
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const request={id:++id,method,params,...(sessionId?{sessionId}:{})};waiting.set(id,{resolve,reject});ws.send(JSON.stringify(request));});
const targets=await send('Target.getTargets');
const page=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:15885/'));
if(!page)throw Error('Synthetic app tab absent');
const {sessionId}=await send('Target.attachToTarget',{targetId:page.targetId,flatten:true});
const initialOffset=Number(await fs.readFile(process.env.SYNTHETIC_CLOCK_FILE,'utf8'));
const source=(await fs.readFile('docs/ops/seasonal-program/followup02-evidence/browser-clock.js','utf8')).replace('offset: 0','offset: '+initialOffset);
await send('Page.enable',{},sessionId);
await send('Page.addScriptToEvaluateOnNewDocument',{source,runImmediately:true},sessionId);
await send('Page.reload',{ignoreCache:true},sessionId);
// Keep this test-only CDP session attached until browser verification finishes.
console.log('Synthetic controlled clock registered on observed local tab');