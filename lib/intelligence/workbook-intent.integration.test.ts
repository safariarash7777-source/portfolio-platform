/** Native PG durability/actor tests; explicitly registered in test:db. */
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { execFileSync as hostExec, type ExecFileSyncOptions } from 'node:child_process';
import { execFileSync as existingExec } from '../ops/test-postgres';
import { listWorkbooks, openWorkbook, saveWorkbook, decideWorkbook, StoreError, type StoredVersion, type StoredReview } from './workbook-store';
import { listWorkbookSaveIntents, prepareWorkbookSave, readWorkbookSaveIntent, savePreparedWorkbook, type StoredWorkbookIntent, type WorkbookIntentGateway } from './workbook-intent-store';
import { p07FixtureWorkbook } from './p07-workflow-fixture';
import { mountComponent } from '../../components/admin/p07-component-test-host';
import ResearchPreparationFields from '../../components/admin/ResearchPreparationFields';
import type { WorkbookTransport } from '../../components/admin/ResearchWorkbook';
import { hashIntentRequest, parseWorkbookSaveIntent } from './workbook-save-intent';
import ResearchHistoryPanel from '../../components/admin/ResearchHistoryPanel';
import { projectWorkbookHistory, type WorkbookHistoryRead, type WorkbookHistoryMetadata } from './research-history-metadata';

const ROOT = process.cwd(), A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', U = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ownContainer = process.env.TEST_RESEARCH_INTENT_CONTAINER;
if (ownContainer && ownContainer !== 'portfolio-research-intent-synthetic-db') throw new Error('Refusing unknown intent DB container');
function execFileSync(binary: string, args: string[], options: ExecFileSyncOptions & {encoding:'utf8'}): string {
  if (!ownContainer) return existingExec(binary,args,options);
  const translated=[...args],fileIndex=translated.indexOf('-f');
  if(fileIndex>=0)translated[fileIndex+1]='/workspace/'+relative(ROOT,translated[fileIndex+1]).replaceAll('\\','/');
  return hostExec('docker',['exec',ownContainer,'psql',...translated],options) as string;
}
const ENV = { ...process.env, PGHOST: process.env.PGHOST ?? '127.0.0.1', PGPORT: process.env.PGPORT ?? '5433', PGUSER: process.env.PGUSER ?? 'postgres', PGPASSWORD: process.env.PGPASSWORD ?? 'postgres' };
const isolated = !!ownContainer || process.env.CI === 'true' && ['127.0.0.1','localhost'].includes(ENV.PGHOST);
if (process.env.CI === 'true' && !isolated) throw new Error('Refusing non-isolated intent DB target');
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
function sql(db: string, query: string) { return execFileSync('psql', ['-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-c',query], { env: ENV, encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim(); }
function file(db: string, path: string) { execFileSync('psql', ['-X','-q','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-f',join(ROOT,path)], { env: ENV, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
function as(db: string, actor: string, query: string) { return sql(db, `BEGIN; SET LOCAL request.jwt.claims = ${literal(JSON.stringify({sub:actor,role:'authenticated'}))}; SET LOCAL ROLE authenticated; ${query}; COMMIT;`); }
function nativeError(error: unknown): never {
  const text = String((error as {stderr?:unknown}).stderr ?? '');
  throw new StoreError(/duplicate key|version gap/.test(text) ? 'conflict' : /permission denied|row-level security/.test(text) ? 'writer_unavailable' : 'unavailable');
}
const version = (r: Record<string, unknown>): StoredVersion => ({ id:String(r.id),workbookId:String(r.workbook_id),version:Number(r.version),title:String(r.title),body:r.body,createdAt:String(r.created_at),createdBy:String(r.created_by) });
const review = (r: Record<string, unknown>): StoredReview => ({ id:String(r.id),versionId:String(r.version_id),decision:r.decision as StoredReview['decision'],note:r.note as string|null,reviewedAt:String(r.reviewed_at) });
const intent = (r: Record<string, unknown>): StoredWorkbookIntent => ({ intentId:String(r.intent_id),workbookId:String(r.workbook_id),baseVersion:Number(r.base_version),targetVersion:Number(r.target_version),requestBody:String(r.request_body),requestHash:String(r.request_hash),title:String(r.title),createdBy:String(r.created_by),createdAt:String(r.created_at) });
function nativeGateway(db: string) {
  const identity: { id: string | null; unavailable?: boolean } = { id:A };
  const read = (query: string) => JSON.parse(as(db,identity.id!,query));
  const insert = (table: string, columns: string, values: string) => {
    try { return read(`INSERT INTO public.${table} (${columns}) VALUES (${values}) RETURNING row_to_json(${table})`); } catch(error) { return nativeError(error); }
  };
  const gateway: WorkbookIntentGateway = {
    privatePreparationWritable:true,
    async getUser() { if(identity.unavailable)throw new Error('synthetic_session_unavailable');return identity.id?{id:identity.id}:null; },
    async getRole(id) { return as(db,id,`SELECT role FROM public.profiles WHERE id=${literal(id)}`); },
    newId:()=>crypto.randomUUID(),
    createStore:()=>({
      recent:async limit=>(read(`SELECT coalesce(json_agg(t),'[]') FROM (SELECT * FROM public.research_workbook_versions ORDER BY created_at DESC LIMIT ${limit})t`) as Record<string,unknown>[]).map(version),
      versions:async id=>(read(`SELECT coalesce(json_agg(t),'[]') FROM (SELECT * FROM public.research_workbook_versions WHERE workbook_id=${literal(id)} ORDER BY version)t`) as Record<string,unknown>[]).map(version),
      reviews:async ids=>ids.length?(read(`SELECT coalesce(json_agg(t),'[]') FROM (SELECT * FROM public.research_workbook_reviews WHERE version_id IN (${ids.map(literal).join(',')}))t`) as Record<string,unknown>[]).map(review):[],
      insertVersion:async row=>version(insert('research_workbook_versions','workbook_id,version,title,body',`${literal(row.workbookId)},${row.version},${literal(row.title)},${literal(JSON.stringify(row.body))}::jsonb`)),
      insertReview:async row=>review(insert('research_workbook_reviews','version_id,decision,note',`${literal(row.versionId)},${literal(row.decision)},${row.note===null?'NULL':literal(row.note)}`)),
    }),
    createIntentStore:()=>({
      get:async id=>{const row=read(`SELECT coalesce((SELECT row_to_json(t)::text FROM public.research_workbook_save_intents t WHERE intent_id=${literal(id)}),'null')`);return row?intent(row):null;},
      recent:async(limit,offset)=>(read(`SELECT coalesce(json_agg(t),'[]') FROM (SELECT intent_id,workbook_id,base_version,target_version,request_hash,title,created_by,created_at FROM public.research_workbook_save_intents ORDER BY created_at DESC,intent_id DESC LIMIT ${limit} OFFSET ${offset})t`) as Record<string,unknown>[]).map(raw=>{const{requestBody:_body,...row}=intent(raw);void _body;return row;}),
      insert:async row=>intent(insert('research_workbook_save_intents','intent_id,request_body',`${literal(row.intentId)},${literal(row.requestBody)}`)),
    }),
  };
  return { gateway,identity };
}

for (const profile of ['legacy','explicit']) describe(`durable workbook intents — native PG / ${profile}`, { skip:!isolated },()=>{
  const db=`wb_intents_${profile}`;
  before(()=>{
    if(ownContainer){const info=JSON.parse(hostExec('docker',['inspect',ownContainer],{encoding:'utf8'}))[0];assert.equal(info.Config.Labels['portfolio.research.intent-test'],'20261029');assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings??{}).length,0);assert.ok(info.Mounts.every((mount:{RW:boolean})=>!mount.RW),'only readonly selected SQL is mounted');}
    sql('postgres',`DROP DATABASE IF EXISTS ${db}`); sql('postgres',`CREATE DATABASE ${db}`);
    file(db,'sql/test/supabase_bootstrap.sql');
    file(db,`sql/test/${profile==='legacy'?'profile_legacy_default_privileges.sql':'profile_explicit_grants.sql'}`);
    sql(db,`INSERT INTO auth.users(id) VALUES ('${A}'),('${B}'),('${U}'); INSERT INTO public.profiles(id,role) VALUES ('${A}','admin'),('${B}','admin'),('${U}','user')`);
    file(db,'sql/phase34_research_workbook_versions.sql');
    file(db,'docs/ops/research-workbook-recovery-20261029/intent-store.candidate.sql');
  });
  test('raw native insert derives actor/hash/base from exact body; other admin/member/anon cannot read it, history cannot mutate',async()=>{
    const requestId=crypto.randomUUID(),wb=crypto.randomUUID();
    const body=JSON.stringify({action:'save',workbookId:wb,creationId:wb,baseVersion:0,workbook:p07FixtureWorkbook()},null,2);
    as(db,A,`INSERT INTO public.research_workbook_save_intents(intent_id,request_body,created_by,request_hash,workbook_id,base_version,target_version,title,created_at) VALUES (${literal(requestId)},${literal(body)},'${B}','forged','${B}',9,10,'forged','2000-01-01')`);
    const native=nativeGateway(db);const opened=await readWorkbookSaveIntent(native.gateway,requestId);
    assert.equal(opened.status,200);assert.equal(opened.body.requestBody,body);assert.equal(opened.body.baseVersion,0);assert.equal(opened.body.targetVersion,1);assert.equal(opened.body.authorMatchesSession,true);
    assert.equal(sql(db,`SELECT created_by FROM public.research_workbook_save_intents WHERE intent_id=${literal(requestId)}`),A);
    assert.equal((await prepareWorkbookSave(native.gateway,requestId,body)).status,200);
    assert.equal((await prepareWorkbookSave(native.gateway,requestId,body+' ')).status,409,'exact body is immutable, including whitespace');
    const originalUser=native.gateway.getUser;let authReads=0;
    native.gateway.getUser=async()=>++authReads===2?{id:B}:originalUser();
    assert.equal((await savePreparedWorkbook(native.gateway,requestId,body)).status,403,'actor change between journal read and version write is denied');
    native.gateway.getUser=originalUser;
    assert.equal(sql(db,`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id=${literal(wb)}`),'0');
    for(const other of [B,U])assert.equal(as(db,other,`SELECT count(*) FROM public.research_workbook_save_intents WHERE intent_id=${literal(requestId)}`),'0');
    assert.throws(()=>sql(db,`SET ROLE anon; SELECT * FROM public.research_workbook_save_intents`));
    assert.equal(sql(db,"SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'"),'t','native service role really bypasses row policies');
    assert.equal(sql(db,"SELECT has_table_privilege('service_role','public.research_workbook_save_intents','SELECT')"),'f');
    assert.throws(()=>sql(db,`SET ROLE service_role; SELECT request_body FROM public.research_workbook_save_intents WHERE intent_id=${literal(requestId)}`),'BYPASSRLS cannot bypass revoked table SELECT');
    assert.throws(()=>as(db,U,`INSERT INTO public.research_workbook_save_intents(intent_id,request_body) VALUES (${literal(crypto.randomUUID())},${literal(body)})`));
    for(const query of [`UPDATE public.research_workbook_save_intents SET request_body='{}'`,`DELETE FROM public.research_workbook_save_intents`,`TRUNCATE public.research_workbook_save_intents`])assert.throws(()=>sql(db,query));
    native.identity.id=B;
    assert.equal((await readWorkbookSaveIntent(native.gateway,requestId)).status,404);
    assert.equal((await prepareWorkbookSave(native.gateway,requestId,body)).status,503,'global UUID cannot be re-scoped to another actor');
    native.identity.id=U;assert.equal((await listWorkbookSaveIntents(native.gateway)).status,403);
  });

  test('actual component closes after v2 commit-before-receipt; a fresh instance discovers native intent and GETs exact v2 without POST',async()=>{
    const native=nativeGateway(db),gw=native.gateway;
    const first=await saveWorkbook(gw,{baseVersion:0,workbook:p07FixtureWorkbook()});assert.equal(first.status,201);
    const wb=String(first.body.workbookId),original=await openWorkbook(gw,wb,1);
    await decideWorkbook(gw,{workbookId:wb,version:1,decision:'approved_internal'});
    const calls:Array<{action?:string;url:string}>=[];let lose=true;
    const transport:WorkbookTransport=async(url,init)=>{
      const u=new URL(url,'https://native.invalid');const p=init?.method==='POST'?JSON.parse(String(init.body)):null;calls.push({action:p?.action,url});
      if(p?.action==='prepare_save')return prepareWorkbookSave(gw,p.intentId,p.requestBody);
      if(p?.action==='save'){
        const result=await savePreparedWorkbook(gw,new Headers(init?.headers).get('x-workbook-save-intent'),String(init?.body));
        if(lose&&result.status===201){lose=false;throw new Error('Synthetic receipt cut after native commit');}return result;
      }
      if(u.searchParams.has('intent'))return readWorkbookSaveIntent(gw,u.searchParams.get('intent'));
      if(u.searchParams.has('id'))return openWorkbook(gw,u.searchParams.get('id')!,Number(u.searchParams.get('version'))||null);
      const list=await listWorkbooks(gw),journal=await listWorkbookSaveIntents(gw);
      return{...list,body:{...list.body,durableRecoveryAvailable:journal.status===200,saveIntents:journal.body.items,intentNextOffset:journal.body.nextOffset}};
    };
    const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){},get localStorage(){throw new Error('Private browser storage forbidden');},get sessionStorage(){throw new Error('Private browser storage forbidden');}}});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
    try{
      const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport,initialWorkbookId:wb});await ui.settle();await ui.settle();
      await ui.waitFor(()=>ui.find('input',e=>e.props.id==='title').props.value===p07FixtureWorkbook().title);
      (ui.find('input',e=>e.props.id==='title').props.onChange as (e:unknown)=>void)({target:{value:'Synthetic native durable v2'}});
      (ui.find(ResearchPreparationFields,()=>true).props.onChange as (value:unknown)=>void)({kind:'text',text:'  PRIVATE_SYNTHETIC_NATIVE\n exact  ',transcriptConfirmed:false,claims:[],ambiguities:[]});await ui.settle();
      await ui.click('ذخیره به‌عنوان');await ui.waitFor(()=>!lose);assert.equal(ui.button('تازه').props.disabled,true);ui.unmount();
      const metadata=await gw.createIntentStore().recent(50,0);assert.ok(Array.isArray(metadata));
      for(const row of metadata){assert.equal(row.createdBy,A);assert.ok(Number.isFinite(Date.parse(row.createdAt)));assert.equal(row.targetVersion,row.baseVersion+1);}
      const journal=await listWorkbookSaveIntents(gw);assert.equal(journal.status,200,JSON.stringify(metadata.map(r=>({id:r.intentId,wb:r.workbookId,base:r.baseVersion,target:r.targetVersion,hash:r.requestHash,at:r.createdAt,actor:r.createdBy}))));
      const latest=(journal.body.items as Array<{intentId:string}>)[0];assert.ok(latest);
      const raw=await gw.createIntentStore().get(latest.intentId);assert.ok(raw);
      const parsed=parseWorkbookSaveIntent(raw.requestBody);
      assert.equal(parsed.workbookId,raw.workbookId);assert.equal(parsed.baseVersion,raw.baseVersion);assert.equal(parsed.targetVersion,raw.targetVersion);
      assert.equal(parsed.workbook.title.trim(),raw.title);assert.equal(await hashIntentRequest(raw.requestBody),raw.requestHash);assert.equal(raw.createdBy,A);
      assert.equal((await readWorkbookSaveIntent(gw,latest.intentId)).status,200);
      const posts=calls.filter(c=>c.action).length;
      const reopened=mountComponent('components/admin/ResearchWorkbook.tsx',{transport});await reopened.settle();await reopened.settle();
      await reopened.waitFor(()=>reopened.find('input',e=>e.props.id==='title').props.value==='Synthetic native durable v2');
      assert.equal(calls.filter(c=>c.action).length,posts,'reopen performs no prepare/save POST');
      assert.equal(reopened.find('input',e=>e.props.id==='title').props.value,'Synthetic native durable v2',JSON.stringify(calls));assert.equal(reopened.badge(),false);
      assert.equal((reopened.find(ResearchPreparationFields,()=>true).props.value as {text:string}).text,'  PRIVATE_SYNTHETIC_NATIVE\n exact  ');
      // Reuse metadata from the native GET that has already resolved the existing intent.
      await reopened.waitFor(() => (reopened.find(ResearchHistoryPanel,()=>true).props.read as WorkbookHistoryRead).state === 'read');
      const beforeHistoryInspection = calls.length;
      const historyRead = reopened.find(ResearchHistoryPanel,()=>true).props.read as WorkbookHistoryRead;
      const historyView = projectWorkbookHistory(historyRead);
      assert.equal(historyView.state,'read'); assert.equal(historyView.history.events.length,3);
      const firstVersionId = (original.body.historyMetadata as WorkbookHistoryMetadata).versions[0].id;
      const historyReview = historyView.history.events.find(event=>event.kind==='workbook_review_recorded')!;
      assert.equal(historyReview.versionId,firstVersionId); assert.equal(historyReview.version,1);
      assert.equal(historyView.history.events.filter(event=>event.kind==='workbook_version_recorded').length,2);
      assert.ok(historyView.history.events.every(event=>event.actorId===null && event.times.readAt===null));
      assert.ok(historyView.history.sources.filter(source=>source.source.startsWith('worker_')).every(source=>source.state==='not_supplied'));
      assert.doesNotMatch(JSON.stringify(historyRead),/PRIVATE_SYNTHETIC_NATIVE|interpretation|scenarios/);
      assert.equal(calls.length,beforeHistoryInspection,'history inspection adds no request or write');
      console.log('P10_NATIVE_METADATA_READ_CHECK '+JSON.stringify({profile,versions:2,reviews:1,reviewVersion:1,actorsDisclosed:false,extraRequests:0,source:'existing_native_open_read'}));
      assert.deepEqual((await openWorkbook(gw,wb,1)).body.workbook,original.body.workbook);
      assert.equal(sql(db,`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id=${literal(wb)}`),'2');
      assert.equal(sql(db,`SELECT count(*) FROM public.research_workbook_reviews r JOIN public.research_workbook_versions v ON v.id=r.version_id WHERE v.workbook_id=${literal(wb)}`),'1');
      assert.equal((await savePreparedWorkbook(gw,latest.intentId,raw.requestBody)).status,200,'an explicit same-intent replay cannot duplicate native v2');
      assert.equal(sql(db,`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id=${literal(wb)}`),'2');
      reopened.unmount();
    }finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
  });

  test('candidate rerun preserves existing workbook/review writer freeze and stored intents remain readable',async()=>{
    file(db,'sql/P07-ROLLBACK-FREEZE.sql');file(db,'docs/ops/research-workbook-recovery-20261029/intent-store.candidate.sql');
    assert.equal(sql(db,"SELECT has_table_privilege('authenticated','public.research_workbook_versions','INSERT') OR has_table_privilege('authenticated','public.research_workbook_reviews','INSERT')"),'f');
    assert.equal(sql(db,"SELECT has_table_privilege('service_role','public.research_workbook_save_intents','SELECT')"),'f','candidate rerun never reopens service-role access');
    const native=nativeGateway(db);const listed=await listWorkbookSaveIntents(native.gateway);assert.equal(listed.status,200);
    const item=(listed.body.items as Array<{intentId:string}>)[0];const stored=await readWorkbookSaveIntent(native.gateway,item.intentId);
    assert.equal(stored.status,200);
    const frozen=await savePreparedWorkbook(native.gateway,item.intentId,stored.body.requestBody);assert.equal(frozen.status,503);assert.equal(frozen.body.writerUnavailable,true);
    native.identity.id=null;assert.equal((await readWorkbookSaveIntent(native.gateway,item.intentId)).status,401);
    native.identity.id=A;native.identity.unavailable=true;assert.equal((await readWorkbookSaveIntent(native.gateway,item.intentId)).status,503);
  });
});
