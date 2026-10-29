// Offline transfer artifact only. Does not connect, install, restore or authorize DDL.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE='b08687b233d5fe1317748b6adff61653d58dadd8';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const FILES=[
 ['sql/consultation_workflow.sql','4e389c57b98827a8297f8bc0cfa26a43e0570ab4b125ec92f9844f970b27e236','4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91','CRLF'],
 ['sql/consultation_roster.sql','03ccf7c622640ca508d8f60f6b1e8825de959ab038679c8cd798b87f331b5523'],
 ['sql/consultation_replies.sql','57702c0090d643fa3eacd765ac19aecb36acd7254a161524dbe6b9326da4f49a'],
 ['scripts/testing/consultation-next/install-native.py','5b5b082907609f8834fdc0f785579a00cda60f4b5ae8512875b5ea2935be6e5f'],
 ['supabase/migrations/20261029142010_consultation_feedback_states.sql','32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda'],
 ['docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql','aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa'],
];
export function releaseBytes(read){
 return FILES.map(([path,sourceSha256,expectedSha256=sourceSha256,lineEndings='LF'])=>{
  const source=read(path);
  if(sha256(source)!==sourceSha256)throw Error('source_hash_mismatch:'+path);
  const bytes=lineEndings==='CRLF'?Buffer.from(source.toString('utf8').replaceAll('\n','\r\n'),'utf8'):source;
  if(sha256(bytes)!==expectedSha256)throw Error('transfer_hash_mismatch:'+path);
  return {path,sourceSha256,sha256:expectedSha256,lineEndings,bytes};
 });
}
export function exportRelease(destination,read=path=>execFileSync('git',['show',SOURCE+':'+path],{cwd:ROOT,maxBuffer:1024*1024})){
 const target=resolve(destination);
 if(existsSync(target))throw Error('destination_exists_no_overwrite');
 const files=releaseBytes(read); // Check every source before creating any destination.
 mkdirSync(target,{recursive:false});
 for(const file of files){const path=resolve(target,file.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,file.bytes,{flag:'wx'});}
 const manifest={contract:'start-a-transfer.v1',sourceSha:SOURCE,prerequisiteSha:'2a8b50b0ce41f5fe15ba629cac4838314d8ce39c',
  status:'TRANSFER_ONLY_NOT_INSTALLED',automaticInstall:false,authorizationGranted:false,
  baseline:'Hash check only; never execute consultation_workflow.sql again',
  prerequisiteInstaller:'Installs PR314 only; does NOT install START-A feedback migration',
  files:files.map(({bytes,...file})=>({...file,size:bytes.length}))};
 writeFileSync(resolve(target,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const verifier=readFileSync(new URL('./verify-transfer.py',import.meta.url),'utf8').replaceAll('\r\n','\n');
 writeFileSync(resolve(target,'verify-transfer.py'),verifier,{flag:'wx'});
 return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('usage: node export-release.mjs NEW_EXISTING_PARENT_DESTINATION');
 const result=exportRelease(process.argv[2]);
 console.log(JSON.stringify({status:result.status,sourceSha:SOURCE,files:result.files.length,automaticInstall:false}));
}
