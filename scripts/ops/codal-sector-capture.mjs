// Fixed public publisher documents only. No database, credentials or BRSAPI calls.
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const TARGETS = Object.freeze([
  ['23022','GaX5WVcrooFnBEWMQQQaQQQ2ja8g%3d%3d',6],
  ['22271','qQ7fKiLEAxkBOevIPSiQFw%3d%3d',8],
  ['29700','HnQQQaQQQBLakgis593HbgHAuolw%3d%3d',1],
  ['29399','XWpcCloAeodXnF946XztEQ%3d%3d',2],
  ['29245','HYQQQaQQQcEzJdrkARLoU7MAsyKA%3d%3d',0],
].map(([id,serial,rt])=>Object.freeze({id,url:`https://codal.ir/Reports/Decision.aspx?LetterSerial=${serial}&rt=${rt}&let=6&ct=0&ft=-1`})));
export function sameReport(url, source) {
  try {
    const u=new URL(url), original=new URL(source);
    const serial=x=>{const p=x.search.slice(1).split('&').filter(s=>s.startsWith('LetterSerial='));return p.length===1?decodeURIComponent(p[0].slice(13)):null;};
    return u.protocol==='https:' && ['codal.ir','www.codal.ir'].includes(u.hostname) && !u.username && !u.password && !u.port && !u.hash &&
      ['/Reports/Decision.aspx','/Reports/InterimStatement.aspx'].includes(u.pathname) && serial(u)!==null && serial(u)===serial(original);
  } catch { return false; }
}
export async function collect(targets, allowed, fetchImpl=fetch, delay=ms=>new Promise(r=>setTimeout(r,ms))) {
  const documents=[];
  for(const target of targets){
    const entry={id:target.id,sourceUrl:target.url,status:'unknown',capturedAt:new Date().toISOString()};
    documents.push(entry);
    let response;
    try {
      if(!allowed(target.url,target.url))throw Error('identity');
      response=await fetchImpl(target.url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html'}});
      let finalUrl=target.url;
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');
        await response.body?.cancel();
        if(!location)throw Error('identity');
        finalUrl=new URL(location,target.url).href;
        if(!allowed(finalUrl,target.url))throw Error('identity');
        await delay(2100);
        response=await fetchImpl(finalUrl,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html'}});
      }
      if(!response.ok){entry.status='http_error';entry.httpStatus=response.status;continue;}
      if(response.url && !allowed(response.url,target.url))throw Error('identity');
      const reader=response.body?.getReader();if(!reader)throw Error('body_missing');
      const chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw Error('body_limit');chunks.push(Buffer.from(value));}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(!size)throw Error('body_missing');
      Object.assign(entry,{status:'retrieved',responseUrl:response.url||finalUrl,body:Buffer.concat(chunks).toString('base64')});
    }catch(error){entry.status=['identity','body_limit','body_missing'].includes(error.message)?error.message:error.name==='TimeoutError'?'timeout':'transport_failed';}
    finally{if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});await delay(2100);}
  }
  return {schemaVersion:1,documents};
}
export function command(){
  const code=`(${collect.toString()})(${JSON.stringify(TARGETS)},${sameReport.toString()}).then(p=>{const text=require('node:zlib').deflateRawSync(Buffer.from(JSON.stringify(p))).toString('base64');const parts=text.match(/.{1,2000}/g);for(let i=0;i<parts.length;i++)console.log('SECTOR_PART='+i+'/'+parts.length+':'+parts[i]);console.log('SECTOR_DONE='+parts.length)}).catch(()=>{console.log('sector_capture_failed');process.exitCode=1})`;
  const cmd=encodeURIComponent(`node -e eval(require(/node:zlib/.source).inflateRawSync(Buffer.from(/${deflateRawSync(code).toString('base64url')}/.source,/base64url/.source)).toString())`);
  if(cmd.length>6000)throw Error('command_limit');return cmd;
}
export function parse(raw,exitCode){
  if(exitCode!==0||typeof raw!=='string'||Buffer.byteLength(raw)>4*1024*1024)throw Error('capture_failed');
  const lines=raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split(/[\r\n]+/).map(x=>x.trim());
  const chunks=lines.filter(x=>x.startsWith('SECTOR_PART=')),done=lines.filter(x=>x.startsWith('SECTOR_DONE='));
  const old=lines.filter(x=>x.startsWith('SECTOR_CAPTURE='));let encoded;
  if(chunks.length||done.length){
    if(old.length||done.length!==1||done[0]!==`SECTOR_DONE=${chunks.length}`||chunks.length>1500)throw Error('capture_failed');
    encoded=chunks.map((line,i)=>{const prefix=`SECTOR_PART=${i}/${chunks.length}:`;if(!line.startsWith(prefix)||! /^[A-Za-z0-9+/]+={0,2}$/.test(line.slice(prefix.length)))throw Error('capture_failed');return line.slice(prefix.length);}).join('');
  }else{
    if(old.length!==1||!/^SECTOR_CAPTURE=[A-Za-z0-9+/]+={0,2}$/.test(old[0]))throw Error('capture_failed');encoded=old[0].slice(15);
  }
  const packet=JSON.parse(inflateRawSync(Buffer.from(encoded,'base64'),{maxOutputLength:15*1024*1024}).toString('utf8'));
  if(packet.schemaVersion!==1||!Array.isArray(packet.documents)||packet.documents.length!==TARGETS.length)throw Error('capture_failed');
  return packet.documents.map((d,i)=>{
    const expected=TARGETS[i];
    if(d.id!==expected.id||d.sourceUrl!==expected.url||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d.capturedAt))throw Error('capture_failed');
    const result={id:expected.id,sourceUrl:expected.url,capturedAt:d.capturedAt,status:d.status};
    if(d.status==='retrieved'){
      if(!sameReport(d.responseUrl,expected.url)||typeof d.body!=='string'||! /^[A-Za-z0-9+/]+={0,2}$/.test(d.body))throw Error('capture_failed');
      const bytes=Buffer.from(d.body,'base64');if(!bytes.length||bytes.length>2*1024*1024)throw Error('capture_failed');
      return {...result,responseUrl:d.responseUrl,sha256:createHash('sha256').update(bytes).digest('hex'),bytes};
    }
    if(!['http_error','identity','body_limit','body_missing','timeout','transport_failed'].includes(d.status))throw Error('capture_failed');
    return {...result,httpStatus:d.status==='http_error'&&Number.isInteger(d.httpStatus)?d.httpStatus:null};
  });
}
export function failureReceipt(raw,exitCode){
  const bounded=typeof raw==='string'&&Buffer.byteLength(raw)<=4*1024*1024?raw:'';
  return {status:'capture_failed',exitCode:Number.isInteger(exitCode)?exitCode:null,bytes:typeof raw==='string'?Buffer.byteLength(raw):null,
    partMarkers:(bounded.match(/SECTOR_PART=/g)||[]).length,doneMarkers:(bounded.match(/SECTOR_DONE=/g)||[]).length,
    legacyMarkers:(bounded.match(/SECTOR_CAPTURE=/g)||[]).length,
    signals:{syntax:/SyntaxError/.test(bounded),notFound:/not found|Cannot find module/.test(bounded),authentication:/Unauthorized|unauthorized|invalid.*token/i.test(bounded),transport:/ETIMEDOUT|ECONNRESET|timeout|timed out/i.test(bounded),remoteFailure:/^sector_capture_failed\s*$/m.test(bounded)}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let privateRaw,exitCode;
  try{
    if(process.argv[2]==='command'&&process.argv.length===3)console.log(command());
    else if(process.argv[2]==='parse'&&process.argv.length===5){
      privateRaw=await readFile(process.argv[3],'utf8');exitCode=Number(process.argv[4]);
      const docs=parse(privateRaw,exitCode);
      await mkdir('sector-primary-sources',{recursive:true});
      const receipt=[];
      for(const {bytes,...d} of docs){if(bytes){d.filename=d.id+'.html';await writeFile('sector-primary-sources/'+d.filename,bytes,{flag:'wx'});d.bytes=bytes.length;}receipt.push(d);}
      await writeFile('sector-primary-sources/receipt.json',JSON.stringify(receipt,null,2));
      console.log(JSON.stringify(receipt));if(receipt.some(d=>d.status!=='retrieved'))process.exitCode=1;
    }else throw Error('mode');
  }catch{
    const receipt=failureReceipt(privateRaw,exitCode);
    if(process.argv[2]==='parse'){await mkdir('sector-primary-sources',{recursive:true});await writeFile('sector-primary-sources/failure.json',JSON.stringify(receipt,null,2));}
    console.error(JSON.stringify(receipt));process.exitCode=1;
  }
}
