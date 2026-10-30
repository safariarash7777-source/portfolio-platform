import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {qaRequestAllowed,targets,compilerDiagnostics} from './product-leaf-browser-qa.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const sha256=text=>createHash('sha256').update(text).digest('hex');
const lineage=JSON.parse(readFileSync(new URL('../../docs/ops/product-leaf-browser-qa-20261030/owned-chrome-lineage.json',import.meta.url),'utf8'));

test('Every extracted owned Chrome function retains its accepted 67 body exactly; original P09 path unchanged',()=>{
  const original=execFileSync('git',['show',lineage.sourceSha+':'+lineage.sourcePath],{encoding:'utf8'});
  const extracted=readFileSync(new URL('./owned-chrome-qa.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
  const functions=text=>new Map(ts.createSourceFile('source.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText()]));
  const before=functions(original),after=functions(extracted);
  for(const name of Object.keys(lineage.functionSha256)){assert.equal(after.get(name),before.get(name),name);assert.equal(sha256(before.get(name)+'\n'),lineage.functionSha256[name],name);}
  assert.equal(readFileSync(new URL('./workbook-browser.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n'),original);
  assert.equal(lineage.bodyChanges,false);assert.equal(lineage.p09PathChanges,false);
});

test('Preview requests stay on exact deployment/page and bounded assets; other hosts, writes and auth are denied',()=>{
  const t=targets.public331;
  for(const path of [t.path,'/_next/static/chunks/app/page.js?dpl=dpl_abc','/api/codal-list?symbol='+encodeURIComponent('فولاد'),'/api/symbol-detail?l18='+encodeURIComponent('فولاد')])assert.equal(qaRequestAllowed(t.origin+path,'GET',t),true,path);
  for(const [url,method] of [[t.origin+t.path,'POST'],[t.origin+'/login','GET'],['https://vercel.com/sso-api','GET'],['https://codal.ir/ReportList.aspx','GET'],[t.origin+'/api/codal-list?symbol=other','GET'],[t.origin+'/api/codal-list?symbol='+encodeURIComponent('فولاد')+'&access_token=secret','GET'],[t.origin+'/_next/static/%2e%2e/a.js','GET'],[t.origin+'/_next/image?url=https://example.invalid&w=64&q=75','GET'],['https://branch-alias.vercel.app'+t.path,'GET']])assert.equal(qaRequestAllowed(url,method,t),false,url);
  assert.equal(qaRequestAllowed(targets.member357.origin+targets.member357.path,'GET',targets.member357),true);
  assert.equal(qaRequestAllowed(targets.member357.origin+'/api/codal-list?symbol='+encodeURIComponent('فولاد'),'GET',targets.member357),false);
});

test('Educational runtime exposes only its exact static files and explicit modes; no local APIs or credentials',()=>{
  const origin='http://127.0.0.1:32123';
  for(const path of ['/?mode=advisor','/?mode=revoked','/?mode=read-error','/style.css','/bundle.js','/fonts/Pelak-Bold.woff2'])assert.ok(qaRequestAllowed(origin+path,'GET',null,origin));
  for(const path of ['/api/consultation','/?mode=admin','/?mode=advisor&token=secret','/private.json','/style.css?x=secret'])assert.equal(qaRequestAllowed(origin+path,'GET',null,origin),false);
  assert.equal(qaRequestAllowed(origin+'/','POST',null,origin),false);
});

test('Compiler diagnostics retain only code and source coordinates, excluding bodies, URLs and credentials',()=>{
  assert.deepEqual(compilerDiagnostics({status:2,stdout:'qa-leaf.tsx(12,3): error TS2322: private body token=secret https://private.invalid\n'}),{exitCode:2,codes:['TS2322'],locations:[{file:'qa-leaf.tsx',line:12,column:3,code:'TS2322'}]});
});
