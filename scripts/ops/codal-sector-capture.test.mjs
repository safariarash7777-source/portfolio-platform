import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {TARGETS,sameReport,collect,command,parse,failureReceipt} from './codal-sector-capture.mjs';
import vm from 'node:vm';
import * as zlib from 'node:zlib';
const pause=async()=>{};
const marker=p=>'SECTOR_CAPTURE='+deflateRawSync(Buffer.from(JSON.stringify(p))).toString('base64');
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
