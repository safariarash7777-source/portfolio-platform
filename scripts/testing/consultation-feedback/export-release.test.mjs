import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SOURCE,FILES,exportRelease,releaseBytes} from './export-release.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>execFileSync('git',['show',SOURCE+':'+path],{cwd:root});
test('transfer matches every reviewed byte pin including mixed baseline/extension endings',()=>{
 const parent=mkdtempSync(join(tmpdir(),'start-a-transfer-')),destination=join(parent,'artifact');
 try{
  const manifest=exportRelease(destination,read);
  assert.equal(manifest.automaticInstall,false);
  assert.equal(manifest.files.length,6);
  for(const file of manifest.files){const bytes=readFileSync(join(destination,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal(bytes.length,file.size);}
  const baseline=readFileSync(join(destination,FILES[0][0]),'utf8');assert.equal(baseline.split('\r\n').length-1,314);
  assert.throws(()=>exportRelease(destination,read),/destination_exists_no_overwrite/);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
test('altered source is rejected before a release can be constructed',()=>{
 assert.throws(()=>releaseBytes(path=>path===FILES[1][0]?Buffer.from('altered'):read(path)),/source_hash_mismatch/);
});
