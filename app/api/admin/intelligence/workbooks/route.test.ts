import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { p07FixtureWorkbook } from '../../../../../lib/intelligence/p07-workflow-fixture';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const privateBody={...p07FixtureWorkbook(),privatePreparation:{contract:'p07.private-preparation.v1',intake:{kind:'text',text:'PRIVATE_ROUTE_ORIGINAL',transcriptConfirmed:false,claims:[],ambiguities:[]}}};
interface Options { user?: boolean; sessionError?: unknown; sessionThrows?: boolean; role?: string|null; roleError?: boolean; roleThrows?: boolean; clientThrows?: boolean; queryThrows?: boolean; insertError?: {code:string;message:string}; createdBy?: string; noRows?: boolean }
function route(options:Options={}) {
  let roleQueries=0,storeQueries=0,insertQueries=0;
  const client={auth:{getUser:async()=>{if(options.sessionThrows)throw new Error('RAW_PRIVATE_SESSION');return{data:{user:options.user===false?null:{id}},error:options.sessionError??null};}},
    from(table:string){
      if(table==='profiles'){
        roleQueries++;
        const profile={select:()=>profile,eq:()=>profile,maybeSingle:async()=>{if(options.roleThrows)throw new Error('RAW_PRIVATE_ROLE');return{data:options.role===null?null:{role:options.role??'admin'},error:options.roleError?{message:'RAW_PRIVATE_ROLE'}:null};}};
        return profile;
      }
      storeQueries++;if(options.queryThrows)throw new Error('RAW_PRIVATE_STORE');
      let rows:unknown=options.noRows?[]:[{id,workbook_id:id,version:1,title:'Private workbook',body:privateBody,created_by:options.createdBy??id,created_at:'2026-10-03T10:00:00Z'}];
      const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,
        in:()=>{rows=[];return chain;},insert:()=>{insertQueries++;return chain;},
        single:async()=>({data:options.insertError?null:(rows as unknown[])[0],error:options.insertError??null}),
        then:(success:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(success)};
      return chain;
    }};
  const filename=resolve('app/api/admin/intelligence/workbooks/route.ts'),localRequire=createRequire(filename);
  const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true},fileName:filename}).outputText;
  const taskModule={exports:{} as {GET:(r:Request)=>Promise<Response>;POST:(r:Request)=>Promise<Response>}};
  const load=(name:string)=>name==='@/lib/supabase/server'?{createClient:async()=>{if(options.clientThrows)throw new Error('RAW_PRIVATE_CLIENT');return client;}}:localRequire(name.startsWith('@/')?resolve(name.slice(2)):name);
  new Function('require','module','exports',compiled)(load,taskModule,taskModule.exports);
  return{...taskModule.exports,roleQueries:()=>roleQueries,storeQueries:()=>storeQueries,insertQueries:()=>insertQueries};
}
const request=(body:unknown)=>new Request('https://example.invalid/api/admin/intelligence/workbooks',{method:'POST',body:JSON.stringify(body)});
async function verify(response:Response,status:number){
  assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();assert.equal(JSON.stringify(body).includes('RAW_PRIVATE_'),false);return body;
}
test('actual route classifies returned SDK session errors without store access or shared caching',async()=>{
  const cases:Array<[Options,number]>=[
    [{user:false},401],[{sessionError:new AuthSessionMissingError()},401],
    [{sessionError:{status:401}},401],[{sessionError:{status:403}},401],
    ...['bad_jwt','no_authorization','session_expired','session_not_found','refresh_token_not_found','refresh_token_already_used','flow_state_expired','flow_state_not_found'].map(code=>[{sessionError:{status:400,code}},401] as [Options,number]),
    ...[400,404,429,500,503].map(status=>[{sessionError:{status,message:'RAW_PRIVATE_SESSION'}},503] as [Options,number]),
    [{sessionError:{message:'RAW_PRIVATE_SESSION'}},503],[{sessionThrows:true},503],[{clientThrows:true},503],
  ];
  for(const [options,status] of cases){
    const api=route(options);
    await verify(await api.GET(new Request(`https://example.invalid/workbooks?id=${id}`)),status);
    await verify(await api.POST(request({action:'save',baseVersion:0,workbook:p07FixtureWorkbook()})),status);
    assert.equal(api.roleQueries(),0);assert.equal(api.storeQueries(),0);
  }
});

test('actual GET readback exposes only author-match and exact absence metadata, never creates a version', async () => {
  const api = route();
  const own = await verify(await api.GET(new Request(`https://example.invalid/workbooks?id=${id}&version=1`)), 200);
  assert.equal(own.workbookId, id); assert.equal(own.version, 1); assert.equal(own.authorMatchesSession, true);
  assert.equal(own.createdBy, undefined); assert.equal(own.created_by, undefined); assert.equal(api.insertQueries(), 0);
  const foreign = route({ createdBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  assert.equal((await verify(await foreign.GET(new Request(`https://example.invalid/workbooks?id=${id}&version=1`)), 200)).authorMatchesSession, false);
  const absent = route({ noRows: true });
  const missing = await verify(await absent.GET(new Request(`https://example.invalid/workbooks?id=${id}&version=1`)), 404);
  assert.equal(missing.absent, true); assert.equal(missing.workbookId, id); assert.equal(missing.requestedVersion, 1);
  assert.equal(absent.insertQueries(), 0);
});

test('native INSERT permission denial is explicit only after admin auth and cannot be forged by workbook content or raw messages', async () => {
  const denied = route({ insertError: { code: '42501', message: 'RAW_PRIVATE_PERMISSION' } });
  await verify(await denied.GET(new Request('https://example.invalid/workbooks')), 200);
  const result = await verify(await denied.POST(request({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() })), 503);
  assert.equal(result.writerUnavailable, true); assert.equal(result.unavailable, true); assert.equal(denied.insertQueries(), 1);
  const ordinary = route();
  const saved = await verify(await ordinary.POST(request({ action: 'save', baseVersion: 0, writerUnavailable: true, workbook: { ...p07FixtureWorkbook(), writerUnavailable: true } })), 201);
  assert.equal(saved.writerUnavailable, undefined);
  await verify(await route({ insertError: { code: 'XX000', message: '42501 writer unavailable' } }).POST(request({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() })), 500);
  for (const options of [{ user: false }, { role: 'member' }]) {
    const api = route({ ...options, insertError: { code: '42501', message: 'RAW_PRIVATE_PERMISSION' } });
    await verify(await api.POST(request({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() })), options.user === false ? 401 : 403);
    assert.equal(api.insertQueries(), 0);
  }
});
test('actual route separates role deny from lookup outage on reads and writes',async()=>{
  for(const [options,status] of [[{role:'user'},403],[{role:null},403],[{roleError:true},503],[{roleThrows:true},503]] as [Options,number][]){
    const api=route(options);
    await verify(await api.GET(new Request(`https://example.invalid/workbooks?id=${id}`)),status);
    await verify(await api.POST(request({action:'decide',workbookId:id,version:1,decision:'returned',note:'Synthetic'})),status);
    assert.equal(api.storeQueries(),0);
  }
});
test('actual private reads, save receipts, validation and infrastructure errors all carry no-store',async()=>{
  const api=route();
  const opened=await verify(await api.GET(new Request(`https://example.invalid/workbooks?id=${id}`)),200);
  assert.equal(opened.workbook.privatePreparation.intake.text,'PRIVATE_ROUTE_ORIGINAL');
  await verify(await api.GET(new Request('https://example.invalid/workbooks')),200);
  await verify(await api.POST(request({action:'save',baseVersion:0,workbook:p07FixtureWorkbook()})),201);
  await verify(await api.POST(request({action:'unknown'})),400);
  await verify(await api.POST(new Request('https://example.invalid/workbooks',{method:'POST',body:'{'})),400);
  await verify(await api.POST(new Request('https://example.invalid/workbooks',{method:'POST',headers:{'content-length':'2000001'},body:'{}'})),413);
  await verify(await api.GET(new Request('https://example.invalid/workbooks?id=invalid')),400);
  await verify(await route({queryThrows:true}).GET(new Request('https://example.invalid/workbooks')),500);
  await verify(await route({clientThrows:true}).POST(request({action:'save',baseVersion:0,workbook:p07FixtureWorkbook()})),503);
  const previous=process.env.P07_PRIVATE_PREPARATION_ENABLED;process.env.P07_PRIVATE_PREPARATION_ENABLED='false';
  try{await verify(await api.POST(request({action:'save',baseVersion:0,workbook:privateBody})),503);}
  finally{if(previous===undefined)delete process.env.P07_PRIVATE_PREPARATION_ENABLED;else process.env.P07_PRIVATE_PREPARATION_ENABLED=previous;}
});
