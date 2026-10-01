import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePublicationCursor,encodePublicationCursor,publicationFeedDto,isFeedPage } from './publication-feed';
import { getPublicationFeed,getScopedPublication,postPublicationRead } from './publication-feed-http';
import { publicationData } from '../member/publication';
import type { PublicationHttpAdapter } from './publication-http';
const C='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',V='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',B='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const cursor={cohortId:C,publishedAt:'2026-10-01T12:00:00.123456+00:00',versionId:V};
const item={versionId:V,version:1,title:'ساختگی',summary:'خلاصه',contentKind:'brief',sources:[{url:'https://example.invalid',asOf:'2026-10-01'}],publishedAt:cursor.publishedAt,detailHref:`/publications/${V}?cohort=${C}`,readAt:null,hasBeenRead:false};
const connect=(data:unknown,error:{code?:string}|null=null,status=200):(()=>Promise<PublicationHttpAdapter>)=>async()=>({status,rpc:async()=>({data,error})});
const get=(q='')=>new Request('http://localhost/api/cohorts/'+C+'/publications'+q);
const post=(body:unknown)=>new Request('http://localhost/api/publications/'+V+'/read',{method:'POST',body:JSON.stringify(body)});
test('cursor retains six-digit PostgreSQL precision and rejects wrong scope, oversized, extra and malformed fields',()=>{
 const encoded=encodePublicationCursor(cursor);assert.deepEqual(decodePublicationCursor(encoded,C),cursor);
 for(const raw of ['', '%%%','x'.repeat(1025),encodePublicationCursor({...cursor,cohortId:B}),btoa(JSON.stringify({...cursor,userId:B})),encodePublicationCursor({...cursor,publishedAt:'infinity'})])assert.throws(()=>decodePublicationCursor(raw,C));
});
test('feed DTO strips internal metadata from items/sources and binds canonical detail context',()=>{
 const result=publicationFeedDto({items:[{...item,privateNotes:'PRIVATE',createdBy:B,body:{secret:'PRIVATE'},sources:[{...item.sources[0],privateNote:'PRIVATE'}]}],nextCursor:cursor},C);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes(B),false);assert.equal(isFeedPage(result),true);
 assert.throws(()=>publicationFeedDto({items:[{...item,detailHref:`/publications/${V}?cohort=${B}`}],nextCursor:null},C));
 assert.throws(()=>publicationFeedDto({items:[{...item,hasBeenRead:true}],nextCursor:null},C));
});
test('HTTP keyset uses exact scoped cursor and bounded limit; malformed input never reaches RPC',async()=>{
 let args:unknown;const connection=async()=>({status:200,rpc:async(name:string,a:Record<string,unknown>)=>{assert.equal(name,'list_cohort_research_publications');args=a;return{data:{items:[item],nextCursor:null},error:null};}});
 const response=await getPublicationFeed(get('?limit=1&cursor='+encodePublicationCursor(cursor)),C,connection);
 assert.equal(response.status,200);assert.deepEqual(args,{p_cohort:C,p_before_at:cursor.publishedAt,p_before_id:V,p_limit:1});assert.match(response.headers.get('cache-control')!,/private, no-store/);
 args=null;for(const q of ['?limit=0','?limit=51','?limit=1.5','?cursor=bad','?limit=1&limit=2','?userId='+B])assert.equal((await getPublicationFeed(get(q),C,connection)).status,400);assert.equal(args,null);
});
test('HTTP separates session, deny, missing, empty and service outage, without raw errors',async()=>{
 for(const [code,status] of [['42501',403],['P0002',404],['22023',400],['PGRST202',503],['08006',503]] as const){const r=await getPublicationFeed(get(),C,connect(null,{code}));assert.equal(r.status,status);assert.equal((await r.text()).includes(code),false);}
 for(const status of [401,503])assert.equal((await getPublicationFeed(get(),C,connect(null,null,status))).status,status);
 const empty=await getPublicationFeed(get(),C,connect({items:[],nextCursor:null}));assert.equal(empty.status,200);assert.equal((await empty.json()).data.items.length,0);
 assert.equal((await getPublicationFeed(get(),C,connect(null))).status,503);
 assert.equal((await getPublicationFeed(get(),C,async()=>{throw Error('PRIVATE DATABASE URI');})).status,503);
});
test('mark read accepts only cohortId, never actor/time and only canonical validated receipt',async()=>{
 const receipt={versionId:V,readAt:cursor.publishedAt,hasBeenRead:true,privateNote:'PRIVATE'};
 const r=await postPublicationRead(post({cohortId:C}),V,connect(receipt));assert.equal(r.status,200);assert.equal((await r.text()).includes('PRIVATE'),false);
 for(const b of [{cohortId:C,userId:B},{cohortId:C,readAt:cursor.publishedAt},{cohortId:C,versionId:B},{},[]])assert.equal((await postPublicationRead(post(b),V,connect(receipt))).status,400);
 assert.equal((await postPublicationRead(post({cohortId:C}),V,connect({...receipt,versionId:B}))).status,503);
 assert.equal((await postPublicationRead(post({cohortId:C}),V,connect(null,{code:'42501'}))).status,403);
});
test('scoped detail handles hidden and stale versions and strips internal metadata',async()=>{
 const req=new Request('http://localhost/api/publications/'+V+'?cohort='+C);
 assert.equal((await getScopedPublication(req,V,connect(null))).status,404);
 const r=await getScopedPublication(req,V,connect({id:V,title:'نمونه',summary:'خلاصه',content:'متن',version:1,sources:item.sources,createdBy:B,workbookId:B,privateNotes:'PRIVATE'}));assert.equal(r.status,200);const text=await r.text();assert.equal(text.includes('PRIVATE'),false);assert.equal(text.includes(B),false);
});
test('client does not turn failed, malformed or wrong-contract responses into empty success; all requests no-store',async()=>{
 for(const request of [async()=>{throw Error();},async()=>Response.json({data:{items:[],nextCursor:null},contractVersion:'seasonal.v0.1'}),async()=>Response.json({}, {status:503})])await assert.rejects(publicationData('/api/test',isFeedPage,request));
 await publicationData('/api/test',isFeedPage,async(_path,init)=>{assert.equal(init?.cache,'no-store');assert.equal(init?.credentials,'same-origin');return Response.json({data:{items:[],nextCursor:null},contractVersion:'publication.v1'});});
});
