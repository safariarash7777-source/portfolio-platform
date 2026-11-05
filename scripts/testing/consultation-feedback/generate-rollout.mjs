/** Offline companion to the immutable r2 migration. Never enables a gate. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const sha=v=>createHash('sha256').update(v).digest('hex'),md5=v=>createHash('md5').update(v).digest('hex');
const base=readFileSync(new URL('../../../sql/consultation_workflow.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
const extension=readFileSync(new URL('../../../supabase/migrations/20261029142010_consultation_feedback_states.sql',import.meta.url),'utf8');
assert.equal(sha(base),'4e389c57b98827a8297f8bc0cfa26a43e0570ab4b125ec92f9844f970b27e236');
assert.equal(sha(extension),'32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda');
function extract(source,name){const expression=new RegExp(`CREATE(?: OR REPLACE)? FUNCTION consultation_private\\.${name}\\([\\s\\S]*?\\$\\$;`);const found=source.match(expression);assert(found);return found[0].replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');}
const body=fn=>fn.slice(fn.indexOf('$$')+2,fn.lastIndexOf('$$'));
function once(source,from,to){assert.equal(source.split(from).length,2);return source.replace(from,to);}
const oldExecute=extract(extension,'execute'),oldLoad=extract(base,'load');
const newExecute=once(oldExecute," PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));",` IF k='feedback' AND c->>'status' IN ('partial','not_done') THEN
  PERFORM 1 FROM consultation_private.feedback_rollout WHERE singleton AND enabled AND reader_sha IS NOT NULL AND reviewed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'extended feedback is not enabled' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));`);
const newLoad=once(oldLoad,"'actions',actions);","'actions',actions,'capabilities',jsonb_build_object('extendedFeedbackWrite',coalesce((SELECT enabled AND reader_sha IS NOT NULL AND reviewed_at IS NOT NULL FROM consultation_private.feedback_rollout WHERE singleton),false)));");
function guard(execute,load,rollback=false){return `DO $guard$
BEGIN
 IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.command(jsonb)')) IS DISTINCT FROM '20701b814f94276bc90f8cad51f16174'
 OR (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.execute(jsonb)')) IS DISTINCT FROM '${md5(body(execute))}'
 OR (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.load(uuid,date,date)')) IS DISTINCT FROM '${md5(body(load))}'
 THEN RAISE EXCEPTION 'rollout prerequisite drift' USING ERRCODE='PT409';END IF;
 ${rollback?"IF EXISTS(SELECT FROM consultation_private.feedback_rollout WHERE enabled) OR EXISTS(SELECT FROM public.consultation_actions WHERE status IN ('partial','not_done')) THEN RAISE EXCEPTION 'preserve compatible reader, gate and history' USING ERRCODE='PT409';END IF;":"IF to_regclass('consultation_private.feedback_rollout') IS NOT NULL THEN RAISE EXCEPTION 'rollout gate collision' USING ERRCODE='PT409';END IF;"}
END $guard$;`}
const header='-- Companion candidate only. Apply atomically with r2; no primary authorization.\nBEGIN;\nSET LOCAL lock_timeout=\'3s\';\nSET LOCAL statement_timeout=\'15s\';\nLOCK TABLE public.consultation_actions IN ACCESS EXCLUSIVE MODE;\n';
const create=`CREATE TABLE consultation_private.feedback_rollout(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 reader_sha text CHECK(reader_sha IS NULL OR reader_sha ~ '^[a-f0-9]{40}$'),
 reviewed_at timestamptz,
 CHECK(NOT enabled OR (reader_sha IS NOT NULL AND reviewed_at IS NOT NULL))
);
ALTER TABLE consultation_private.feedback_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_private.feedback_rollout FORCE ROW LEVEL SECURITY;
REVOKE ALL ON consultation_private.feedback_rollout FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO consultation_private.feedback_rollout(singleton) VALUES(true);`;
const apply=header+guard(oldExecute,oldLoad)+'\n'+create+'\n'+newExecute+'\n'+newLoad+'\nCOMMIT;\n';
const rollback=header+guard(newExecute,newLoad,true)+'\n'+oldExecute+'\n'+oldLoad+'\nDROP TABLE consultation_private.feedback_rollout;\nCOMMIT;\n';
writeFileSync(new URL('../../../supabase/migrations/20261029160723_consultation_feedback_rollout_guard.sql',import.meta.url),apply);
writeFileSync(new URL('../../../docs/ops/start-a-finance-v04-20261029/rollback-rollout.sql',import.meta.url),rollback);
console.log(JSON.stringify({applySha256:sha(apply),rollbackSha256:sha(rollback),oldLoadMd5:md5(body(oldLoad)),newLoadMd5:md5(body(newLoad)),newExecuteMd5:md5(body(newExecute))}));
