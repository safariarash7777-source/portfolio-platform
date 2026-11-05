'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{webcrypto,createHash}=require('node:crypto');
const runtimeRequire=createRequire(__filename),root=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(root,'capsule-manifest.json')));
assert.equal(globalThis[Symbol.for('p03.pure.guard.v1')]?.version,1,'R5 must be loaded in this same process');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixtureRaw=fs.readFileSync(path.join(root,'canonical-validator-fixture.json'));
assert.equal(sha(fixtureRaw),manifest.validatorFixtureSha256);
const frozenFixture=JSON.parse(fixtureRaw);assert.equal(frozenFixture.appCommit,manifest.app);
const sourceRecords=new Map(frozenFixture.modules.map(record=>[record.path,record]));
assert.equal(sourceRecords.size,14);
const compilerArgument=process.argv.find(value=>value.startsWith('--typescript-module='))?.slice('--typescript-module='.length);
const compilerFile=compilerArgument?path.resolve(compilerArgument):runtimeRequire.resolve('typescript');
assert.equal(sha(fs.readFileSync(compilerFile)),manifest.compilerSha256,'explicit compiler must match the reviewed compiler bytes');
const ts=runtimeRequire(compilerFile);
assert.equal(sha(fs.readFileSync(path.join(root,'pure-node-guard.cjs'))),'4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028');
assert.equal(sha(fs.readFileSync(path.join(root,'pure-node-guard.test.mjs'))),'a6bc1a6c3e54ae71b853674761415b03761555a8e3e3bd33f473ecfe25158d72');
const moduleCache=new Map();
function actual(file){
 if(moduleCache.has(file))return moduleCache.get(file).exports;
 const record=sourceRecords.get(file);assert(record,'source must exist in pinned inert fixture');
 const raw=Buffer.from(record.text,'utf8');assert.equal(sha(raw),record.sha256);assert.equal(raw.length,record.bytes);
 assert.equal(record.sha256,manifest.sources[file].sha256);assert.equal(record.bytes,manifest.sources[file].bytes);
 assert.equal(createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex'),record.gitBlob);
 assert.equal(record.gitBlob,manifest.sources[file].gitBlob);
 const mod={exports:{}};moduleCache.set(file,mod);
 const code=ts.transpileModule(raw.toString(),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,TextEncoder,TextDecoder,crypto:webcrypto,URLSearchParams,Buffer,console,
  require(spec){if(spec==='node:crypto')return require(spec);const rel=spec.startsWith('@/')?spec.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));assert(!rel.startsWith('../'));return actual(rel.endsWith('.ts')?rel:rel+'.ts');},
 },{filename:'frozen-e0-json/'+file});
 return mod.exports;
}
function tarMembers(bytes){
 const entries=new Map();let offset=0;
 while(offset+512<=bytes.length){let name=bytes.subarray(offset,offset+100).toString().replace(/\0.*$/s,'');if(!name)break;const prefix=bytes.subarray(offset+345,offset+500).toString().replace(/\0.*$/s,'');if(prefix)name=prefix+'/'+name;const size=parseInt(bytes.subarray(offset+124,offset+136).toString().replace(/\0/g,'').trim(),8);assert(Number.isSafeInteger(size)&&size>=0&&offset+512+size<=bytes.length);assert(!entries.has(name));entries.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;}
 return entries;
}
const prefix='overlay/scripts/testing/consultation-tickets/';
function phase(candidate){
 const bytes=fs.readFileSync(path.join(root,candidate?'sealed-p03-composition-e0-await-v1.tar':'base-capsule54.tar'));
 assert.equal(sha(bytes),candidate?manifest.capsuleSha256:'54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255');
 const members=tarMembers(bytes),driver=members.get(prefix+'assembled-overlay.json');
 assert.equal(sha(driver),candidate?manifest.driverSha256:'e8b12e8f44e80e6fc41719028769ea126a16a4250f0a6b0e2433d8481b643850');
 const pins=JSON.parse(driver).files.filter(row=>row.path==='scripts/testing/consultation-tickets/composition-member-phase.mjs');assert.equal(pins.length,1);
 const source=members.get(prefix+'composition-member-phase.mjs');assert.equal(sha(source),pins[0].sha256);assert.equal(source.length,pins[0].bytes);
 return source.toString();
}
const tickets=actual('lib/consultation/tickets.ts'),preparation=actual('lib/consultation/ticketAttemptStorageContracts.ts');
const fixture=actual('scripts/testing/consultation-tickets/unit-fixture.ts'),preparedFixture=actual('scripts/testing/consultation-tickets/prepared-unit-fixture.ts');
function block(source){const start=source.indexOf(' const input=tickets.validateTicketRequest('),end=source.indexOf(" check(direct.status===403,'foreign_rpc_denial');",start);assert(start>=0&&end>start);return source.slice(start,end+" check(direct.status===403,'foreign_rpc_denial');".length);}
function exercise(source,badHash=false){
 const calls=[];let rpcBody;
 const ctx={users:{owner:{id:fixture.O},b:{session:{token:'synthetic-other-jwt'}}},anon:'synthetic-anon',post:async(route,body)=>{
  calls.push('foreignRPC');assert.equal(route,'/rest/v1/rpc/lookup_consultation_ticket_attempt');rpcBody=body;
  return {status:body.p_preparation===fixture.uid(50)?403:422};
 }};
 const done=vm.runInNewContext('(async()=>{'+block(source)+';return {prepared,linked};})()',{
  tickets,preparation,ctx,relation:fixture.R,resourceId:fixture.Q,published:{id:fixture.uid(60),version:1,contentHash:'a'.repeat(64)},
  randomUUID:()=>fixture.uid(70),JSON,
  read:async()=>fixture.parent(true),
  expect:async(actor,route,input)=>{
   assert.equal(actor,'owner');
   if(route==='/api/consultation/ticket-attempts'){
    calls.push('prepare');const p=await preparedFixture.prepared(input),receipt=preparedFixture.preparationReceipt(p);
    return badHash?{...receipt,bodyHash:'0'.repeat(64)}:receipt;
   }
   assert.equal(route,'/api/consultation/tickets');calls.push('link');
   return {contractVersion:'consultation-ticket-write.v1',actorId:fixture.O,clientToken:input.clientToken,command:input.command,id:fixture.uid(51),version:3,reused:false,canonicalContentHash:'a'.repeat(64)};
  },
  check(value,code){if(!value)throw Error('p03_composition_'+code);},
 },{filename:'pinned-capsule-summary-66-72'});
 return {done,calls,get rpcBody(){return rpcBody;}};
}
test('sealed source delta is one await; actual e0 validators and all other capsule members stay pinned',()=>{
 const before=phase(false),after=phase(true);
 assert.equal(after.replace('const prepared=await preparation.validateTicketPreparationReceipt(','const prepared=preparation.validateTicketPreparationReceipt('),before);
 assert.equal((after.match(/const prepared=await preparation.validateTicketPreparationReceipt\(/g)||[]).length,1);
 const base=tarMembers(fs.readFileSync(path.join(root,'base-capsule54.tar'))),next=tarMembers(fs.readFileSync(path.join(root,'sealed-p03-composition-e0-await-v1.tar')));
 assert.equal(base.size,next.size);assert.deepEqual([...base.keys()],[...next.keys()]);
 const changed=[...base.keys()].filter(name=>!base.get(name).equals(next.get(name))).sort();
 assert.deepEqual(changed,[prefix+'assembled-overlay.json',prefix+'composition-member-phase.mjs'].sort());
 for(const [name,data] of next){assert.equal(sha(data),manifest.members[name].sha256);assert.equal(data.length,manifest.members[name].bytes);}
});
test('frozen old summary source demonstrates the Promise/receipt defect using the real async validator',async()=>{
 const run=exercise(phase(false));
 await assert.rejects(run.done,/p03_composition_foreign_rpc_denial/);
 assert.equal(run.rpcBody.p_preparation,undefined);
 assert.deepEqual(run.calls,['prepare','link','foreignRPC']);
});
test('candidate awaits real preparation validation and forwards the identical resolved preparationId to foreign RPC',async()=>{
 const run=exercise(phase(true)),result=await run.done;
 assert.equal(result.prepared.preparationId,fixture.uid(50));assert.equal(result.linked.version,3);
 assert.equal(run.rpcBody.p_preparation,result.prepared.preparationId);
 assert.equal(JSON.parse(JSON.stringify(run.rpcBody)).p_preparation,fixture.uid(50));
 assert.deepEqual(run.calls,['prepare','link','foreignRPC']);
});
test('a real async body-hash rejection stops the candidate before link or foreign RPC with no replay',async()=>{
 const run=exercise(phase(true),true);
 await assert.rejects(run.done,/رسید حفظ با bytes اصلی مطابق نیست/);
 assert.deepEqual(run.calls,['prepare']);assert.equal(run.rpcBody,undefined);
});
