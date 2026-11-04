const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const ts=require('typescript');
const bytes=fs.readFileSync(path.join(__dirname,'fixtures/validator-e0-source.json'));
assert.ok(bytes.length<=1048576);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'b3f545fe86f0f7150657809f3fdb2f2f1e602d750505a83dbc7bca85a8bfb048');
const fixture=JSON.parse(bytes.toString('utf8'));assert.equal(fixture.version,1);assert.equal(fixture.sourceCommit,'e0b930927563d7f9f6d79e848917c4ba0d77ed6f');
const roster=["lib/auth/session-error.ts", "lib/consultation/consultationWriteRelease.ts", "lib/consultation/contracts.ts", "lib/consultation/errors.ts", "lib/consultation/ticketAttemptStorageContracts.ts", "lib/consultation/ticketAttemptStorageServer.ts", "lib/consultation/ticketIntent.ts", "lib/consultation/ticketStorageContracts.ts", "lib/consultation/ticketStorageRequest.ts", "lib/consultation/tickets.ts", "lib/deadline.ts", "lib/format.ts", "lib/portfolio/cashFlow.ts", "lib/portfolio/cashFlowApiContract.ts", "lib/portfolio/financialInput.ts", "lib/portfolio/goals.ts", "lib/portfolio/goalsApiContract.ts"];assert.deepEqual(fixture.files.map(x=>x.path),roster);
const sources=new Map();for(const row of fixture.files){const data=Buffer.from(row.source,'utf8');assert.equal(data.length,row.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),row.sha256);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex'),row.gitBlob);sources.set(row.path,row.source);}
const cache=new Map();
function load(name){assert.ok(sources.has(name));if(cache.has(name))return cache.get(name).exports;
 const source=sources.get(name),loadedModule={exports:{}};cache.set(name,loadedModule);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=dep=>{if(dep==='@supabase/supabase-js')return require('@supabase/supabase-js');assert.ok(dep.startsWith('.'),'no external runtime import');return load(path.posix.normalize(path.posix.join(path.posix.dirname(name),dep+'.ts')));};
 const sandbox={module:loadedModule,exports:loadedModule.exports,require:req,TextEncoder,TextDecoder,URL,URLSearchParams,Request,Response,AbortController,AbortSignal,setTimeout,clearTimeout,console:{log(){},error(){}},process:{env:{CONSULTATION_P03_WRITES_RELEASE:'reader-compatible-v1'}},crypto:crypto.webcrypto};
 vm.runInNewContext(js,sandbox,{filename:name,timeout:2000});return loadedModule.exports;
}
const caseRoot=path.resolve(process.argv[2]);
const tickets=load('lib/consultation/tickets.ts'),contracts=load('lib/consultation/ticketAttemptStorageContracts.ts'),server=load('lib/consultation/ticketAttemptStorageServer.ts');
const actor='11111111-1111-4111-8111-111111111111',relation='22222222-2222-4222-8222-222222222222';
const line=fs.readFileSync(path.join(caseRoot,'base-case.mjs'),'utf8').split('\n').find(x=>x.includes('const denied='));assert.ok(line);
function denied(){return vm.runInNewContext('(function(){'+line+';return denied;})()', {users:{a:{id:actor}},relation,randomUUID:()=> '33333333-3333-4333-8333-333333333333'});}
test('exact capsule denied request is valid structure but fails actual canonical intent validation',()=>{
 const input=denied(),canonical=tickets.validateTicketRequest(input);
 assert.notEqual(JSON.stringify(input),JSON.stringify(canonical));
 assert.deepEqual(Object.keys(input.command),['kind','relationshipId','requestId','baseVersion','subject','text','recommendation']);
 assert.deepEqual(Object.keys(canonical.command),['relationshipId','requestId','baseVersion','kind','subject','text','recommendation']);
 assert.throws(()=>contracts.frozenTicketIntentBody(JSON.stringify(input)));
 assert.doesNotThrow(()=>contracts.frozenTicketIntentBody(JSON.stringify(canonical)));
 assert.equal(JSON.stringify(tickets.validateTicketRequest(canonical)),JSON.stringify(canonical));
});
test('actual postTicketAttemptStorage rejects original body400 before parent/prepare',async()=>{
 let auth=0,parent=0,prepare=0;
 const db={authenticate:async()=>{auth++;return {user:{id:actor},error:null};},parent:async()=>{parent++;throw Error('unexpected parent');},prepare:async()=>{prepare++;throw Error('unexpected prepare');}};
 const req=new Request('http://localhost:32189/api/consultation/ticket-attempts',{method:'POST',headers:{Origin:'http://localhost:32189','Content-Type':'application/json'},body:JSON.stringify(denied())});
 const response=await server.postTicketAttemptStorage(req,async()=>db);
 assert.equal(response.status,400);assert.equal(auth,1);assert.equal(parent,0);assert.equal(prepare,0);
 const body=await response.json();assert.equal(body.code,'INVALID_INPUT');
});

test('proposed exact capsule body canonicalizes before any admission or transport',()=>{
 const proposed=fs.readFileSync(path.join(caseRoot,'proposed-case.mjs'),'utf8');
 assert.ok(proposed.includes("import {validateTicketRequest} from '../../../lib/consultation/tickets.ts';"));
 const line=proposed.split('\n').find(x=>x.includes('const denied='));
 const input=vm.runInNewContext('(function(){'+line+';return denied;})()', {validateTicketRequest:tickets.validateTicketRequest,users:{a:{id:actor}},relation,randomUUID:()=> '33333333-3333-4333-8333-333333333333'});
 assert.doesNotThrow(()=>contracts.frozenTicketIntentBody(JSON.stringify(input)));
 assert.equal(JSON.stringify(input),JSON.stringify(tickets.validateTicketRequest(denied())));
 assert.ok(proposed.indexOf('const denied=')<proposed.indexOf("const response=await ctx.api('a','/api/consultation/ticket-attempts',denied)"));
});
