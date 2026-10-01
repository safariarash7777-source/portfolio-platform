import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';import crypto from 'node:crypto';
const target='followup06-accept-db';
const meta=JSON.parse(cp.execFileSync('docker',['inspect',target],{encoding:'utf8'}))[0];
if(meta.Config.Labels['codex.task']!=='followup06-accept')throw Error('Wrong owned sandbox');
const query=q=>cp.execFileSync('docker',['exec',target,'psql','-U','postgres','-d','postgres','-X','-Atc',q],{encoding:'utf8'}).trim();
if(query('select count(*) from auth.users')!=='6')throw Error('Unexpected fixture user count; inspect first');
const sqlPath='supabase/migrations/20261001083215_auth_private_identity_versions.sql';const body=fs.readFileSync(sqlPath,'utf8');
if(query("select to_regnamespace('identity_private') is not null")==='t')throw Error('Already installed: do not replay non-idempotent migration');
cp.execFileSync('docker',['exec','-i',target,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],{input:body,encoding:'utf8'});
// Existing PostgREST may have booted before this additive migration.
// The catalog alone is not proof of API readiness; reload its owned cache.
query("notify pgrst, 'reload schema'");
const privateDir=path.join(os.homedir(),'.codex/private/followup06-auth-storage');const keyfile=path.join(privateDir,'limited-identity-keys.json');
if(!fs.existsSync(keyfile))fs.writeFileSync(keyfile,JSON.stringify({AUTH_IDENTITY_KEY_VERSION:'limited-v1',AUTH_IDENTITY_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),AUTH_IDENTITY_HMAC_KEY:crypto.randomBytes(32).toString('base64')}));
fs.mkdirSync('docs/ops/seasonal-program/followup-06-limited-evidence',{recursive:true});
const proof={environment:'followup06-limited-native-local',appliedAt:new Date().toISOString(),sourceSHA:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),path:sqlPath,sha256:crypto.createHash('sha256').update(body.replaceAll('\r\n','\n')).digest('hex'),database:target,syntheticOnly:true,priorChain:'16 native repository SQL files: see frozen followup-06-auth-storage-evidence/environment.json, phase32→34→35→36→37→38→04→08',recreated:false,rows:query('select (select count(*) from auth.users),(select count(*) from storage.objects),(select count(*) from identity_private.profile_versions)'),privateRLS:query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='identity_private' order by relname"),clientWriteDenied:query("select has_function_privilege('authenticated','public.auth_save_private_identity(uuid,integer,text,text,text,text)','execute'),has_schema_privilege('authenticated','identity_private','usage')"),clientOwnRead:query("select has_function_privilege('authenticated','public.auth_read_private_identity()','execute')"),privateKeyLocation:'existing ACL-protected private directory; values omitted'};
fs.writeFileSync('docs/ops/seasonal-program/followup-06-limited-evidence/migration.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
