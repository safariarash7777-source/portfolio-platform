import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {TARGETS,SOURCE_SETS,sameReport,sourceHoldGuard,collect,command,parse,failureReceipt} from './codal-sector-capture.mjs';
import vm from 'node:vm';
import * as zlib from 'node:zlib';
const pause=async()=>{};
const marker=p=>'SECTOR_CAPTURE='+deflateRawSync(Buffer.from(JSON.stringify(p))).toString('base64');

test('remaining monthly profile reads both existing holds and refuses unknown or active guards',async()=>{
 const env={SUPABASE_URL:'https://62.60.191.24/liara-preview',SUPABASE_SERVICE_ROLE_KEY:'dummy-capture-key'};
 const rows=['codal_engine_state','codal_archive_state'].map(key=>({key,payload:{sourceHoldUntil:0}}));
 const calls=[];await sourceHoldGuard(async(url,options)=>{calls.push({url,options});return Response.json(rows);},env,1000);
 assert.equal(calls.length,1);assert.match(calls[0].url,/ir_market_snapshots/);assert.equal(calls[0].options.method,undefined);
 for(const data of [[],rows.slice(0,1),[rows[0],rows[0]],rows.map(r=>({...r,payload:{}}))])
  await assert.rejects(sourceHoldGuard(async()=>Response.json(data),env,1000),/source_guard_unavailable/);
 await assert.rejects(sourceHoldGuard(async()=>Response.json([rows[0],{...rows[1],payload:{sourceHoldUntil:1001}}]),env,1000),/source_hold/);
 await assert.rejects(sourceHoldGuard(async()=>{throw Error('must not fetch');},{...env,SUPABASE_URL:'https://other.test'},1000),/source_guard_unavailable/);
});

test('guarded capture stops before sources on hold and after first challenge without saving challenge bytes',async()=>{
 const targets=SOURCE_SETS['monthly-remaining-20261117'];assert.equal(targets.length,2);
 let calls=0;
 const held=await collect(targets,sameReport,async()=>{calls++;throw Error('must not fetch');},pause,async()=>{throw Error('source_hold');});
 assert.equal(calls,0);assert.deepEqual(parse(marker(held),0,'monthly-remaining-20261117').map(d=>d.status),['source_hold','not_attempted']);
 const challenge=await collect(targets,sameReport,async()=>{calls++;return new Response('<input id="captchaCode"><img id="captchaImage">');},pause,async()=>{});
 assert.equal(calls,1);assert.deepEqual(parse(marker(challenge),0,'monthly-remaining-20261117').map(d=>d.status),['source_challenge','not_attempted']);
 assert.ok(challenge.documents.every(d=>!d.body));
});

test('embedded guarded command checks storage before each exact public document and emits no credential',async()=>{
 const cmd=decodeURIComponent(command('monthly-remaining-20261117'));
 const encoded=cmd.match(/Buffer.from\(\/([^/]+)\//)[1],source=inflateRawSync(Buffer.from(encoded,'base64url')).toString();
 const lines=[],calls=[];const env={SUPABASE_URL:'https://62.60.191.24/liara-preview',SUPABASE_SERVICE_ROLE_KEY:'dummy-capture-key'};
 const context={Buffer,URL,AbortSignal,Date,process:{exitCode:0,env},setTimeout:fn=>fn(),fetch:async(url,options)=>{
  calls.push(url);if(url.includes('/rest/v1/'))return Response.json(['codal_engine_state','codal_archive_state'].map(key=>({key,payload:{sourceHoldUntil:0}})));
  assert.equal(options.headers.Authorization,undefined);return new Response('<html>official document</html>');
 },require:()=>zlib,console:{log:line=>lines.push(line)}};
 await vm.runInNewContext(source,context);
 assert.equal(calls.length,4);assert.ok(calls[0].includes('/rest/v1/'));assert.ok(calls[2].includes('/rest/v1/'));
 assert.deepEqual([calls[1],calls[3]],SOURCE_SETS['monthly-remaining-20261117'].map(t=>t.url));
 assert.equal(parse(lines.join('\n'),0,'monthly-remaining-20261117').length,2);
 assert.doesNotMatch(JSON.stringify(lines),/dummy-capture-key|Authorization|apikey/);
});
test('supplemental profile requests only the three advertised official sheets',async()=>{
 const targets=SOURCE_SETS['industrial-20261114'];assert.equal(targets.length,3);
 assert.deepEqual(targets.map(t=>t.id),['29700-equity','29245-income','29245-equity']);
 const packet=await collect(targets,sameReport,async()=>new Response('<html>official sheet</html>'),pause);
 assert.equal(parse(marker(packet),0,'industrial-20261114').length,3);
 assert.throws(()=>parse(marker(packet),0));assert.throws(()=>command('arbitrary'));
 assert.ok(decodeURIComponent(command('industrial-20261114')).length<6000);
});
test('fixed command has no credential reads and exactly five public source identities',()=>{
  const cmd=decodeURIComponent(command());
  assert.ok(cmd.length<6000);assert.equal(TARGETS.length,5);
  const encoded=cmd.match(/Buffer.from\(\/([^/]+)\//)[1];
  const source=inflateRawSync(Buffer.from(encoded,'base64url')).toString();
  assert.doesNotMatch(source,/process\.env|SUPABASE|BRSAPI|Authorization|apikey/);
  for(const t of TARGETS)assert.ok(source.includes(t.url));
});
test('same report validates raw serial semantics and rejects foreign destinations',()=>{
  const u=TARGETS[0].url;
  assert.equal(sameReport(u,u),true);
  assert.equal(sameReport(u.replace('codal.ir','www.codal.ir').replace('Decision.aspx','InterimStatement.aspx'),u),true);
  for(const v of [u.replace('codal.ir','codal.ir.evil.test'),u.replace('https:','http:'),u+'&LetterSerial=x',u.replace('LetterSerial=','LetterSerial=x'),u+'#fragment',u.replace('codal.ir','user:pass@codal.ir')])assert.equal(sameReport(v,u),false);
});
test('successful captures retain exact bytes and only public projection survives parse',async()=>{
  const calls=[];
  const packet=await collect(TARGETS,sameReport,async(url,options)=>{calls.push({url,options});return new Response('<html>صورت مالی</html>');},pause);
  const docs=parse('private CLI preamble\n'+marker(packet)+'\n',0);
  assert.equal(calls.length,5);
  assert.ok(calls.every(c=>c.options.redirect==='manual'&&!c.options.headers.Authorization));
  assert.equal(docs[0].bytes.toString(),'<html>صورت مالی</html>');
  assert.match(docs[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal('body' in docs[0],false);
  assert.throws(()=>parse(marker(packet)+'\n'+marker(packet),0));
  assert.throws(()=>parse(marker(packet),1));
  packet.documents[0].sourceUrl=TARGETS[1].url;
  assert.throws(()=>parse(marker(packet),0));
});
test('foreign redirects, source errors and oversized streams never enter artifact bytes',async()=>{
  const responses=[new Response(null,{status:302,headers:{location:'https://other.test/'}}),new Response('secret error text',{status:500}),new Response('x'.repeat(2*1024*1024+1)),new Response(null),new Response('ok')];
  const packet=await collect(TARGETS,sameReport,async()=>responses.shift(),pause);
  const docs=parse(marker(packet),0);
  assert.deepEqual(docs.map(d=>d.status),['identity','http_error','body_limit','body_missing','retrieved']);
  assert.ok(docs.slice(0,4).every(d=>!d.bytes));
  assert.doesNotMatch(JSON.stringify(packet),/secret error text/);
});
test('only one bounded same-report redirect, without retry or credential forwarding',async()=>{
  const calls=[];const target=TARGETS[0];
  const packet=await collect([target],sameReport,async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(null,{status:302,headers:{location:target.url.replace('Decision.aspx','InterimStatement.aspx')}}):new Response('official');},pause);
  assert.equal(calls.length,2);assert.equal(calls[1].options.redirect,'error');
  assert.equal(packet.documents[0].status,'retrieved');
  const failed=await collect([target],sameReport,async()=>{throw new Error('private detail');},pause);
  assert.equal(failed.documents[0].status,'transport_failed');assert.doesNotMatch(JSON.stringify(failed),/private detail/);
});
test('exact embedded remote command emits bounded chunks that round-trip without loss',async()=>{
  const cmd=decodeURIComponent(command());const encoded=cmd.match(/Buffer.from\(\/([^/]+)\//)[1];
  const source=inflateRawSync(Buffer.from(encoded,'base64url')).toString();const lines=[];
  const context={Buffer,URL,AbortSignal,Date,process:{exitCode:0},setTimeout:fn=>{fn();},fetch:async()=>new Response('<html>official</html>'),require:name=>{assert.equal(name,'node:zlib');return zlib;},console:{log:line=>lines.push(line)}};
  await vm.runInNewContext(source,context);
  assert.equal(context.process.exitCode,0);assert.ok(lines.every(line=>line.length<2050));
  assert.equal(parse(lines.join('\n'),0).length,5);
  assert.equal(parse('✔ connected > '+lines.join('\r\n'),0).length,5);
  assert.throws(()=>parse(lines.slice(0,-1).join('\n'),0));
  assert.throws(()=>parse([lines[0],...lines].join('\n'),0));
  assert.throws(()=>parse(lines.map(x=>x.replace('SECTOR_PART=0/','SECTOR_PART=9/')).join('\n'),0));
});
test('failure receipt preserves bounded diagnostic classes without reflecting private text',()=>{
  const receipt=failureReceipt('private-key-here\nSyntaxError: unexpected token\nSECTOR_PART=0/2:abc\n',1);
  assert.equal(receipt.signals.syntax,true);assert.equal(receipt.partMarkers,1);assert.equal(receipt.exitCode,1);
  assert.doesNotMatch(JSON.stringify(receipt),/private-key|unexpected token|abc/);
  assert.equal(failureReceipt('',0,new Error('capture_decode')).stage,'capture_decode');
  assert.equal(failureReceipt('',0,new Error('secret text')).stage,'local_io_or_unknown');
});

test('guarded capture stops on single challenge markers and HTTP403/429 before a second notice',async()=>{
 for(const response of [new Response('<input id = "captchaCode">'),new Response('<div class="cf-chl-container">'),new Response('denied',{status:403}),new Response('limited',{status:429})]){
  let calls=0;
  const packet=await collect(SOURCE_SETS['monthly-remaining-20261117'],sameReport,async()=>{calls++;return response;},pause,async()=>{});
  assert.equal(calls,1);assert.equal(packet.documents[1].status,'not_attempted');assert.ok(packet.documents.every(d=>!d.body));
  assert.equal(parse(marker(packet),0,'monthly-remaining-20261117').length,2);
 }
});
test('hold reads prefer existing public credentials over privileged credentials',async()=>{
 await sourceHoldGuard(async(url,options)=>{
  assert.equal(options.headers.apikey,'public-only');assert.equal(options.headers.Authorization,'Bearer public-only');
  return Response.json(['codal_engine_state','codal_archive_state'].map(key=>({key,payload:{sourceHoldUntil:0}})));
 },{SUPABASE_URL:'https://62.60.191.24/liara-preview',SUPABASE_ANON_KEY:'public-only',SUPABASE_SERVICE_ROLE_KEY:'dummy-unused'},1000);
});

test('monthly capture allows only the corresponding monthly viewer and same report serial',()=>{
 const source='https://codal.ir/Reports/Decision.aspx?LetterSerial=testA&let=58';
 assert.equal(sameReport('https://codal.ir/Reports/MonthlyActivity.aspx?LetterSerial=testA',source),true);
 assert.equal(sameReport('https://codal.ir/Reports/MonthlyActivity.aspx?LetterSerial=testB',source),false);
 assert.equal(sameReport('https://codal.ir/Reports/InterimStatement.aspx?LetterSerial=testA',source),false);
});
