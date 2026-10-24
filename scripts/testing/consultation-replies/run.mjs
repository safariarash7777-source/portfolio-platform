/** Derived from the existing desk-preferences owned-PG harness.
 * Cached PG17 only; no network/ports/host mounts, secrets, JWT minting or live DB.
 * SQL claims fixture proves DB ownership/RLS, not native Auth/PostgREST verification.
 * Run: node scripts/testing/consultation-replies/run.mjs [--ci-local]
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const migration=readFileSync(new URL('../../../sql/consultation_workflow.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../../sql/test/supabase_bootstrap.sql',import.meta.url),'utf8');
const replyMigration=readFileSync(new URL('../../../sql/consultation_replies.sql',import.meta.url),'utf8');
const token=randomUUID(), name=`consultation-replies-test-${token}`;
const ciLocal=process.argv.includes('--ci-local'), ownedDatabases=new Set();
assert.ok(process.argv.slice(2).every(arg=>arg==='--ci-local'),'unknown test transport option');
if(ciLocal){
 assert.ok(process.env.GITHUB_ACTIONS==='true','CI-local transport requires explicit GitHub disposable service');
 assert.ok(process.env.CI==='true'&&process.env.PGHOST==='127.0.0.1'&&process.env.PGPORT==='5433'&&process.env.PGUSER==='postgres','CI-local requires the fixed disposable loopback service');
 assert.ok(process.env.PGPASSWORD==='postgres','only the existing synthetic CI service credential is accepted');
 assert.ok(!process.env.PGSERVICE&&!process.env.PGSERVICEFILE&&!process.env.PGHOSTADDR,'indirect connection configuration forbidden');
}
const image='sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const results=[]; let created=false, database='postgres';
function docker(argv,input){const r=spawnSync('docker',argv,{input,encoding:'utf8',cwd:root,timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
function inspect(){return JSON.parse(docker(['inspect',name]))[0];}
function attest(c){
 assert.equal(c.Name,`/${name}`);assert.equal(c.Config.Labels['arash.test.owner'],token);assert.equal(c.Image,image);
 assert.equal(c.HostConfig.NetworkMode,'none');assert.equal(c.HostConfig.ReadonlyRootfs,true);
 assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);assert.equal(Object.keys(c.NetworkSettings.Ports||{}).length,0);
 assert.deepEqual(c.HostConfig.Binds||[],[]);assert.ok(c.Mounts.every(m=>m.Type==='tmpfs'));
 assert.ok(Object.keys(c.NetworkSettings.Networks||{}).every(n=>n==='none'));
}
const args=()=>['exec','-i',name,'psql','-XqAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const localArgs=db=>['-XqAt','-h','127.0.0.1','-p','5433','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
function localSql(db,query){const r=spawnSync('psql',localArgs(db),{input:query,encoding:'utf8',timeout:30000});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
function attestDatabase(){
 assert.ok(ownedDatabases.has(database),'unowned CI database forbidden');
 assert.equal(localSql('postgres',`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${database}'`),`pf3-test:${token}`,'CI test database ownership marker changed');
}
function sql(query){if(ciLocal){if(database!=='postgres')attestDatabase();return localSql(database,query);}attest(inspect());return docker(args(),query);}
function asyncSql(query){if(ciLocal)attestDatabase();else attest(inspect());return new Promise((resolve,reject)=>{
 const child=spawn(ciLocal?'psql':'docker',ciLocal?localArgs(database):args(),{cwd:root,stdio:['pipe','pipe','pipe']});let out='',err='';
 const timer=setTimeout(()=>child.kill(),30000);child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);resolve({code,out,err});});child.stdin.end(query);
});}
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',O='00000000-0000-4000-8000-000000000003',X='00000000-0000-4000-8000-000000000004',KEY='10000000-0000-4000-8000-000000000001',ACTION='20000000-0000-4000-8000-000000000001';
const quote=x=>`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
const as=(role,id,q)=>`BEGIN; SELECT set_config('request.jwt.claims',${quote(id?{sub:id,role}:{role})},true); SET LOCAL ROLE ${role}; ${q}; COMMIT;`;
let counter=0;
const req=(actor,command,token='synthetic-'+(++counter))=>({contractVersion:'consultation-request.v1',expectedActorId:actor,clientToken:token,command});
const call=p=>`SELECT public.command_consultation(${quote(p)}::jsonb)`;
const pick=(out,contract)=>out.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(x=>x?.contractVersion===contract);
const send=(actor,request)=>pick(sql(as('authenticated',actor,call(request))),'consultation-write.v1');
const read=(actor,relation=null)=>pick(sql(as('authenticated',actor,`SELECT public.load_consultation(${relation?quote(relation)+'::uuid':'null'},'2026-10-01','2026-10-31')`)),'consultation-read.v1');
const body=basis=>({topic:'نمونه ساختگی',goal:'هدف ساختگی',clientSummary:'خلاصه عضو مصنوعی',rationale:'دلیل ساختگی',limitations:'فقط پذیرش مصنوعی؛ مقادیر نامعلوم‌اند',reviewOn:'2099-12-31',basis,researchVersionIds:[],evidence:[{label:'سند مصنوعی',url:null,asOf:'2026-10-23'}],actions:[{actionKey:ACTION,title:'اقدام صرفاً ساختگی',dueOn:'2099-12-31',responsible:'member'}]});
function denied(query,state){assert.throws(()=>sql(query),e=>String(e).includes(state));}
function check(label,fn){fn();results.push({profile:database,name:label,status:'PASS'});console.log(`PASS ${database}: ${label}`);}
function count(){return Number(sql('SELECT count(*) FROM public.consultation_sessions'));}
// Existing schemas/functions/ACL must return byte-for-byte after lab-only rollback.
const inventory=`SELECT jsonb_build_object('relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.proacl::text,md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname,p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth')))::text`;
try{
 if(!ciLocal){
 assert.equal(docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}']),image,'cached image drift');
 docker(['create','--pull','never','--name',name,'--label',`arash.test.owner=${token}`,'--network','none','--read-only',
  '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=16777216','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;attest(inspect());docker(['start',name]);
 let ready=false;for(let i=0;i<60;i++){
  const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});
  const pid=spawnSync('docker',['exec',name,'cat','/proc/1/comm'],{encoding:'utf8'});
  if(r.status===0&&pid.stdout.trim()==='postgres'){ready=true;break;}await new Promise(r=>setTimeout(r,200));
 }
 assert.ok(ready,'owned PG readiness failed');attest(inspect());
 console.log(JSON.stringify({attestation:{container:name,image,network:'none',ports:[],persistentMounts:[],readOnlyRoot:true,migrationSha256:createHash('sha256').update(migration).digest('hex'),replyMigrationSha256:createHash('sha256').update(replyMigration).digest('hex'),server:sql('SELECT version()')}}));
 }else{
  assert.equal(localSql('postgres','SELECT current_database()'),'postgres');
  console.log(JSON.stringify({attestation:{transport:'explicit-GitHub-disposable-PG',host:'127.0.0.1',port:5433,migrationSha256:createHash('sha256').update(migration).digest('hex'),replyMigrationSha256:createHash('sha256').update(replyMigration).digest('hex'),server:localSql('postgres','SELECT version()')}}));
 }
 for(const profile of ['explicit','legacy']){
  database='postgres';sql(`CREATE DATABASE consultation_replies_${profile}`);
  if(ciLocal){ownedDatabases.add(`consultation_replies_${profile}`);localSql('postgres',`COMMENT ON DATABASE consultation_replies_${profile} IS 'pf3-test:${token}'`);}
  database=`consultation_replies_${profile}`;
  sql(bootstrap);sql(readFileSync(new URL(`../../../sql/test/profile_${profile==='legacy'?'legacy_default_privileges':'explicit_grants'}.sql`,import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../../sql/test/portfolio_precondition.sql',import.meta.url),'utf8'));
  for(const file of ['sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql','sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql'])sql(readFileSync(new URL('../../../'+file,import.meta.url),'utf8'));
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${O}'),('${X}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${O}','admin'),('${X}','admin')`);

  sql(migration);const before=sql(inventory);sql(replyMigration);
  sql(`INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('${O}','Synthetic owner',true),('${X}','Unrelated admin',false)`);
  const relation=send(A,req(A,{kind:'grant',advisorId:O,clientLabel:'Synthetic A'})).id;
  const other=send(B,req(B,{kind:'grant',advisorId:O,clientLabel:'Synthetic B'})).id;
  const createSession=(relationshipId=relation,sessionKey=randomUUID(),baseVersion=0,overrides={})=>{
   const saved=send(O,req(O,{kind:'save',relationshipId,sessionKey,baseVersion,body:{...body(read(O,relationshipId).dossier.basis),...overrides},privateNote:'PRIVATE_CANARY'}));
   return read(O,relationshipId).sessions.find(s=>s.id===saved.id);
  };
  const transition=(session,kind)=>send(O,req(O,{kind,relationshipId:session.relationshipId,sessionId:session.id,contentHash:session.contentHash,note:'PRIVATE_TRANSITION'}));
  const publish=session=>{for(const kind of ['submit','approve','publish'])transition(session,kind);return session;};
  const question=(session,actor=A,status='question',baseVersion=0)=>send(actor,req(actor,{kind:'feedback',relationshipId:session.relationshipId,sessionId:session.id,actionKey:null,baseVersion,status,text:'Synthetic member question'})).id;
  const requestReply=(session,questionId,baseVersion=0,text='Synthetic clarification',actor=O)=>({contractVersion:'consultation-reply-request.v1',expectedActorId:actor,clientToken:randomUUID(),command:{kind:'publish_reply',purpose:'clarification',relationshipId:session.relationshipId,sessionId:session.id,questionId,baseVersion,text}});
  const replyCall=p=>`SELECT public.command_consultation_reply(${quote(p)}::jsonb)`;
  const reply=(p,actor=p.expectedActorId)=>pick(sql(as('authenticated',actor,replyCall(p))),'consultation-reply-write.v1');
  const readCall=s=>`SELECT public.load_consultation_replies('${s.relationshipId}','${s.id}')`;
  const replies=(s,actor=O)=>pick(sql(as('authenticated',actor,readCall(s))),'consultation-reply-read.v1');
  const session=publish(createSession()),q=question(session),input=requestReply(session,q);
  let receipt;
  check('forced RLS, direct ACL denial, narrow RPC and no baseline function modification',()=>{
   assert.equal(sql("SELECT count(*)=2 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relname IN ('consultation_reply_versions','consultation_reply_receipts')"),'t');
   assert.equal(sql("SELECT bool_and(NOT has_table_privilege(r,'public.'||t,o)) FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['consultation_reply_versions','consultation_reply_receipts']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) o"),'t');
   assert.equal(sql("SELECT bool_and(NOT has_function_privilege(r,'public.'||f,'EXECUTE')) FROM unnest(ARRAY['anon','service_role']) r CROSS JOIN unnest(ARRAY['command_consultation_reply(jsonb)','load_consultation_replies(uuid,uuid)']) f"),'t');
   const old=JSON.parse(before),current=JSON.parse(sql(inventory));for(const f of old.functions)assert.ok(current.functions.some(g=>JSON.stringify(f)===JSON.stringify(g)),'baseline function changed');
   denied(as('authenticated',null,replyCall(input)),'42501');
  });
  check('owner publishes exact version; normalized retry receipt; member history no private notes',()=>{
   input.command.text=' \tSynthetic clarification\u00a0';receipt=reply(input);assert.equal(receipt.command.text,'Synthetic clarification');assert.equal(receipt.version,1);
   assert.equal(reply(input).id,receipt.id);assert.equal(reply(input).reused,true);
   assert.equal(replies(session).canReply,true);const member=replies(session,A);assert.equal(member.canReply,false);assert.equal(member.replies[0].text,'Synthetic clarification');
   assert.ok(!JSON.stringify(member).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(member).includes('PRIVATE_TRANSITION'));
   console.log(JSON.stringify({replyFixture:{request:input,receipt,read:replies(session)}}));
  });
  check('CAS correction appends; altered token and stale edit do not overwrite',()=>{
   denied(as('authenticated',O,replyCall({...input,command:{...input.command,text:'Changed token'}})),'PT409');
   denied(as('authenticated',O,replyCall(requestReply(session,q))),'PT409');
   const corrected=reply(requestReply(session,q,1,'Corrected clarification'));assert.equal(corrected.version,2);
   assert.deepEqual(replies(session).replies.map(x=>x.version).sort(),[1,2]);assert.equal(reply(input).version,1);
  });
  check('strict direct RPC; question session relationship actor and admin isolation',()=>{
   for(const actor of [A,B,X])denied(as('authenticated',actor,replyCall(requestReply(session,q,2,'forbidden',actor))),'42501');
   denied(as('authenticated',B,readCall(session)),'42501');denied(as('authenticated',X,readCall(session)),'42501');
   denied(as('authenticated',A,replyCall(input)),'42501');
   const second=publish(createSession(other)),otherQ=question(second,B),viewed=question(session,A,'viewed',1);
   for(const invalid of [requestReply(session,otherQ,2),requestReply(second,q,2),requestReply(session,viewed,2)])denied(as('authenticated',O,replyCall(invalid)),'42501');
   for(const change of [p=>p.extra=1,p=>p.command.extra=1,p=>p.command.text='\u00a0',p=>p.command.text='x'.repeat(2001),p=>p.command.baseVersion=1.5,p=>p.command.purpose='advice',p=>p.command.baseVersion=2147483647]){const p=requestReply(session,q,2);change(p);denied(as('authenticated',O,replyCall(p)),'22023');}
  });
  check('disabled or demoted owner cannot write/replay; exact authorized retry preserved',()=>{
   sql(`UPDATE public.consultation_advisors SET enabled=false WHERE user_id='${O}'`);denied(as('authenticated',O,replyCall(input)),'42501');denied(as('authenticated',O,readCall(session)),'42501');
   assert.equal(replies(session,A).replies.length,2);sql(`UPDATE public.consultation_advisors SET enabled=true,is_owner=false WHERE user_id='${O}'`);
   denied(as('authenticated',O,replyCall(input)),'42501');assert.equal(replies(session).readOnlyReason,'not_owner');
   sql(`UPDATE public.consultation_advisors SET is_owner=true WHERE user_id='${O}'`);assert.equal(reply(input).reused,true);
  });
  const disable=asyncSql(`BEGIN;UPDATE public.consultation_advisors SET enabled=false WHERE user_id='${O}';SELECT pg_sleep(2);COMMIT;`);
  let registryHeld=false;for(let i=0;i<30;i++){if(Number(sql("SELECT count(*) FROM pg_locks WHERE relation='public.consultation_advisors'::regclass AND mode='RowExclusiveLock' AND granted"))>0){registryHeld=true;break;}await new Promise(r=>setTimeout(r,25));}assert.ok(registryHeld);
  const disabledWriter=await asyncSql(as('authenticated',O,replyCall(requestReply(session,q,2))));const disabledResult=await disable;
  check('in-flight owner disable serializes and blocks publication without appending',()=>{assert.equal(disabledResult.code,0,disabledResult.err);assert.ok(disabledWriter.err.includes('42501'),disabledWriter.err);assert.equal(replies(session,A).replies.length,2);});
  sql(`UPDATE public.consultation_advisors SET enabled=true WHERE user_id='${O}'`);
  const raceQ=question(session,A,'question',2),raceInput=requestReply(session,raceQ);
  const race=await Promise.all([asyncSql(as('authenticated',O,replyCall(raceInput))),asyncSql(as('authenticated',O,replyCall({...raceInput,clientToken:randomUUID()})))]);
  check('concurrent first publish has one winner and one CAS rejection',()=>{assert.equal(race.filter(x=>x.code===0).length,1);assert.equal(race.filter(x=>x.err.includes('PT409')).length,1);assert.equal(replies(session).replies.filter(x=>x.questionId===raceQ).length,1);});
  const retrySession=publish(createSession()),retryQuestion=question(retrySession),retryInput=requestReply(retrySession,retryQuestion);
  const sameToken=await Promise.all([asyncSql(as('authenticated',O,replyCall(retryInput))),asyncSql(as('authenticated',O,replyCall(retryInput)))]);
  check('concurrent identical token produces one immutable reply and reused receipt',()=>{
   assert.ok(sameToken.every(x=>x.code===0),JSON.stringify(sameToken));const receipts=sameToken.map(x=>pick(x.out,'consultation-reply-write.v1'));
   assert.equal(receipts[0].id,receipts[1].id);assert.deepEqual(receipts.map(x=>x.reused).sort(),[false,true]);assert.equal(replies(retrySession).replies.length,1);
  });
  const withdrawRun=asyncSql(`BEGIN;SELECT pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext('${O}'));SELECT pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext('${relation}'));SELECT pg_sleep(2);SELECT set_config('request.jwt.claims',${quote({sub:O,role:'authenticated'})},true);SET LOCAL ROLE authenticated;${call(req(O,{kind:'withdraw',relationshipId:relation,sessionId:retrySession.id,contentHash:retrySession.contentHash,note:null}))};COMMIT;`);
  let withdrawHeld=false;for(let i=0;i<20;i++){if(sql(`SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND granted AND classid=hashtext('consultation_relation')::oid AND objid=hashtext('${relation}')::oid)`)==='t'){withdrawHeld=true;break;}await new Promise(r=>setTimeout(r,50));}assert.ok(withdrawHeld);
  const afterWithdraw=await asyncSql(as('authenticated',O,replyCall(requestReply(retrySession,retryQuestion,1))));const withdrawal=await withdrawRun;
  check('withdraw and reply serialize; new write blocked while exact historical receipt survives',()=>{assert.equal(withdrawal.code,0,withdrawal.err);assert.ok(afterWithdraw.err.includes('PT409'),afterWithdraw.err);assert.equal(replies(retrySession,A).readOnlyReason,'withdrawn');assert.equal(reply(retryInput).reused,true);});
  check('new draft makes old published session read only; replay is receipt not a fresh write',()=>{
   createSession(relation,session.sessionKey,1);assert.equal(replies(session).readOnlyReason,'superseded');assert.equal(replies(session,A).readOnlyReason,'superseded');
   denied(as('authenticated',O,replyCall(requestReply(session,q,2))),'PT409');assert.equal(reply(input).id,receipt.id);
   transition(session,'withdraw');assert.equal(replies(session,A).readOnlyReason,'withdrawn');assert.equal(replies(session,A).replies.length,3);
  });
  check('unpublished session cannot be read by member',()=>{const draft=createSession();assert.equal(replies(draft).readOnlyReason,'unpublished');denied(as('authenticated',A,readCall(draft)),'42501');});
  check('elapsed review deadline preserves history but refuses new clarification',()=>{
   // Historical fixture: represents an already-published recommendation whose review date elapsed.
   const expired=createSession(relation,randomUUID(),0,{reviewOn:'2000-01-01'}),approval=randomUUID();
   sql(`INSERT INTO public.consultation_events(id,session_id,kind,actor_id) VALUES('${approval}','${expired.id}','approve','${O}');INSERT INTO public.consultation_publications(session_id,approval_id,actor_id) VALUES('${expired.id}','${approval}','${O}');INSERT INTO public.consultation_events(session_id,kind,actor_id) VALUES('${expired.id}','publish','${O}')`);
   const expiredQ=question(expired);assert.equal(replies(expired).readOnlyReason,'expired');denied(as('authenticated',O,replyCall(requestReply(expired,expiredQ))),'PT409');
  });
  check('returned research makes existing publication read only',()=>{
   const researchId=randomUUID(),workbook=randomUUID();
   const researchBody={evidence:[{statement:'Synthetic evidence',sourceUrl:'https://example.com/source',observedOn:'2026-10-23',publishedOn:'2026-10-23'}]};
   sql(as('authenticated',O,`INSERT INTO public.research_workbook_versions(id,workbook_id,version,title,body) VALUES('${researchId}','${workbook}',1,'Synthetic',${quote(researchBody)}::jsonb);INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${researchId}','approved_internal')`));
   const sourced=publish(createSession(relation,randomUUID(),0,{researchVersionIds:[researchId]})),sourcedQ=question(sourced);
   sql(as('authenticated',O,`INSERT INTO public.research_workbook_reviews(version_id,decision) VALUES('${researchId}','returned')`));
   assert.equal(replies(sourced).readOnlyReason,'research_changed');denied(as('authenticated',O,replyCall(requestReply(sourced,sourcedQ))),'PT409');
  });
  const fresh=publish(createSession()),freshQ=question(fresh),freshInput=requestReply(fresh,freshQ);
  check('financial revision blocks clarification and gives explicit read-only reason',()=>{
   sql(as('authenticated',A,`SELECT public.record_member_goals('{"contractVersion":1,"goals":[]}'::jsonb,'reply-goals',0)`));
   assert.equal(replies(fresh).readOnlyReason,'basis_changed');denied(as('authenticated',O,replyCall(freshInput)),'PT409');
  });
  // Hold the same relationship lock as revoke; signal readiness from pg_locks before queuing the writer.
  const revokeInput=req(A,{kind:'revoke',relationshipId:relation});
  const revokeRun=asyncSql(`BEGIN;SELECT pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext('${relation}'));SELECT pg_sleep(2);SELECT set_config('request.jwt.claims',${quote({sub:A,role:'authenticated'})},true);SET LOCAL ROLE authenticated;${call(revokeInput)};COMMIT;`);
  let held=false;for(let i=0;i<20;i++){if(sql(`SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND granted AND classid=hashtext('consultation_relation')::oid AND objid=hashtext('${relation}')::oid)`)==='t'){held=true;break;}await new Promise(r=>setTimeout(r,50));}assert.ok(held);
  const afterRevoke=await asyncSql(as('authenticated',O,replyCall(input)));const revokeResult=await revokeRun;
  check('revoke/write serialize; even exact receipt retry denied after revoke, member keeps history',()=>{
   assert.equal(revokeResult.code,0,revokeResult.err);assert.ok(afterRevoke.err.includes('42501'),afterRevoke.err);
   denied(as('authenticated',O,readCall(session)),'42501');const history=replies(session,A);assert.equal(history.readOnlyReason,'revoked');assert.equal(history.replies.length,3);
  });
  check('immutable versions and receipts; installer collisions fail without partial change',()=>{
   for(const table of ['consultation_reply_versions','consultation_reply_receipts']){denied(`DELETE FROM public.${table}`,'42501');denied(`TRUNCATE public.${table}`,'42501');}
   denied('UPDATE public.consultation_reply_versions SET text=\'changed\'','42501');denied("UPDATE public.consultation_reply_receipts SET content_hash=repeat('a',64)",'42501');
   denied(replyMigration,'55000');assert.equal(replies(session,A).replies.length,3);
  });
 }
 console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:['Isolated SQL claims fixtures; native Auth/API/UI acceptance remains separate','No operational DB, member or deployment changes']}));
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(ciLocal)for(const db of ownedDatabases){database=db;attestDatabase();localSql('postgres',`DROP DATABASE ${db} WITH (FORCE)`);console.log(JSON.stringify({cleanup:{database:db,ownedMarkerVerified:true,removed:true}}));}
 if(created){attest(inspect());docker(['rm','-f',name]);console.log(JSON.stringify({cleanup:{container:name,removed:true}}));}
}
