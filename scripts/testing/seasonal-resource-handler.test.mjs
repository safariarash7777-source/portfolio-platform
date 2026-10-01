import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AuthSessionMissingError} from '@supabase/supabase-js';
import {resourceHandlers} from './seasonal-resource-handler.mjs';
const cohort='synthetic-cohort',resource='synthetic-resource';
const row={id:resource,title:'Synthetic file',module_key:'resources',created_at:'2026-10-01T00:00:00Z',storage_bucket:'course-private',storage_path:'PRIVATE-PATH',webinar_id:null};
const request=new Request('http://localhost/resource'),params={params:Promise.resolve({id:cohort,resourceId:resource})};
function fixture({authError=null,user={id:'synthetic'},rows=[row],allowed=true,rpcError=null,storageError=null}={}){
 const calls={rpc:0,storage:0};
 const db={auth:{getUser:async()=>({data:{user},error:authError})},from:()=>{const q={select:()=>q,eq:()=>q,order:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:rows[0]??null,error:null})};return q;},rpc:async(_name,args)=>{calls.rpc++;assert.equal(args.p_cohort,cohort);assert.equal(args.p_module,'resources');return {data:{allowed},error:rpcError};},storage:{from:()=>({createSignedUrl:async()=>{calls.storage++;return {data:{signedUrl:'https://example.invalid/synthetic-signed'},error:storageError};}})}};
 return {...resourceHandlers(db),calls};
}
test('missing real SDK session and empty session return401 for both routes, never query private data',async()=>{
 for(const authError of [new AuthSessionMissingError(),null]){const h=fixture({authError,user:null});for(const fn of [h.list,h.download]){const r=await fn(request,params);assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);}assert.equal(h.calls.rpc,0);assert.equal(h.calls.storage,0);}
});
test('Auth transport error remains503 without exposing upstream details',async()=>{
 const h=fixture({authError:Error('PRIVATE upstream secret')});for(const fn of [h.list,h.download]){const r=await fn(request,params);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE|secret/);}
});
test('admin metadata read never substitutes for a course/module grant',async()=>{
 const h=fixture({allowed:false});const list=await h.list(request,params);assert.equal(list.status,200);assert.deepEqual((await list.json()).data,[]);const d=await h.download(request,params);assert.equal(d.status,403);assert.doesNotMatch(await d.text(),/PRIVATE|signedUrl|url/);assert.equal(h.calls.storage,0);
});
test('authorized member gets exact scope and bounded URL; repeated module checked only once per list',async()=>{
 const h=fixture({rows:[row,{...row,id:'second'}]});const l=await h.list(request,params);const text=await l.text();assert.equal(JSON.parse(text).data.length,2);assert.doesNotMatch(text,/PRIVATE|storage_bucket|storage_path/);assert.equal(h.calls.rpc,1);const d=await h.download(request,params);assert.equal(d.status,200);assert.equal((await d.json()).data.expiresInSeconds,60);assert.equal(h.calls.storage,1);
});
test('RLS invisible foreign/expired/revoked resource returns403 and no signer call',async()=>{
 const h=fixture({rows:[]});assert.equal((await h.list(request,params)).status,200);assert.equal((await h.download(request,params)).status,403);assert.equal(h.calls.storage,0);
});
test('module evaluator unavailable is503, not an empty authorized list or private URL',async()=>{
 const h=fixture({rpcError:{code:'PGRST_UNKNOWN',message:'PRIVATE'}});for(const fn of [h.list,h.download]){const r=await fn(request,params);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE|url/);}assert.equal(h.calls.storage,0);
});
test('Storage permission denial is403; missing object/provider outage remains503',async()=>{
 for(const [statusCode,expected] of [['403',403],['401',403],['400',503],['500',503]]){const h=fixture({storageError:{statusCode,message:'PRIVATE'}});const r=await h.download(request,params);assert.equal(r.status,expected);assert.doesNotMatch(await r.text(),/PRIVATE|url/);}
});
