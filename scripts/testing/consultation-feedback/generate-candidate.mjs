/** Deterministic candidate generation only. Never connects to a database. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const base = readFileSync(new URL('../../../sql/consultation_workflow.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
assert.equal(createHash('sha256').update(base).digest('hex'), '4e389c57b98827a8297f8bc0cfa26a43e0570ab4b125ec92f9844f970b27e236', 'Review a changed baseline before generating another candidate');
const md5 = text => createHash('md5').update(text).digest('hex');
const extract = name => {
  const start = base.indexOf(`CREATE FUNCTION consultation_private.${name}(p jsonb)`);
  assert(start >= 0);
  const end = base.indexOf('$$;', start);
  assert(end > start);
  return base.slice(start, end + 3).replace('CREATE FUNCTION ', 'CREATE OR REPLACE FUNCTION ');
};
const body = def => def.slice(def.indexOf('AS $$') + 5, def.lastIndexOf('$$;'));
const replaceOne = (text, before, after) => { assert.equal(text.split(before).length, 2); return text.replace(before, after); };
const original = { command: extract('command'), execute: extract('execute') };
const extended = {
  command: replaceOne(replaceOne(original.command,
    "status NOT IN ('viewed','acknowledged','doing','done','question')",
    "status NOT IN ('viewed','acknowledged','doing','done','question','partial','not_done')"),
    "OR (status='question' AND message IS NULL)",
    "OR (status IN ('question','partial','not_done') AND message IS NULL) OR (status IN ('partial','not_done') AND p->>'actionKey' IS NULL)"),
  execute: replaceOne(original.execute,
    "IF c->>'status' IN ('doing','done') THEN",
    "IF c->>'status' IN ('doing','done','partial','not_done') THEN"),
};
const guard = (definitions, states, rollback = false) => `
DO $guard$
DECLARE allowed text[]; command_oid oid := to_regprocedure('consultation_private.command(jsonb)'); execute_oid oid := to_regprocedure('consultation_private.execute(jsonb)');
BEGIN
 IF command_oid IS NULL OR execute_oid IS NULL OR to_regclass('public.consultation_actions') IS NULL THEN RAISE EXCEPTION 'consultation prerequisite missing' USING ERRCODE='PT409'; END IF;
 IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=command_oid) <> '${md5(body(definitions.command))}'
 OR (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=execute_oid) <> '${md5(body(definitions.execute))}'
 OR EXISTS(SELECT FROM pg_proc WHERE oid IN(command_oid,execute_oid) AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""']))
 THEN RAISE EXCEPTION 'consultation kernel changed; stop and review compatible candidate' USING ERRCODE='PT409'; END IF;
 SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']*)''', 'g') m
 WHERE c.conrelid='public.consultation_actions'::regclass AND c.conname='consultation_actions_status_check' AND c.contype='c' AND c.convalidated;
 IF allowed IS DISTINCT FROM ARRAY[${states.toSorted().map(s => `'${s}'`).join(',')}]::text[] THEN RAISE EXCEPTION 'feedback status constraint changed' USING ERRCODE='PT409'; END IF;
 ${rollback ? "IF EXISTS(SELECT FROM public.consultation_actions WHERE status IN ('partial','not_done')) THEN RAISE EXCEPTION 'new feedback history exists; preserve compatible reader and history' USING ERRCODE='PT409'; END IF;" : ''}
END $guard$;
`;
const oldStates = ['viewed', 'acknowledged', 'doing', 'done', 'question'];
const newStates = [...oldStates, 'partial', 'not_done'];
const artifact = (definitions, before, after, states, rollback = false) => `-- START-A v0.4 CANDIDATE ONLY. Not installed on any operational database.
-- Generated from the unchanged consultation baseline; only two private bodies and a status constraint differ.
-- No financial writes, role/grant/policy changes, or history updates. Review deployment compatibility before installation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public.consultation_actions IN ACCESS EXCLUSIVE MODE;
${guard(before, states, rollback)}
ALTER TABLE public.consultation_actions DROP CONSTRAINT consultation_actions_status_check;
ALTER TABLE public.consultation_actions ADD CONSTRAINT consultation_actions_status_check CHECK(status IN (${after.map(s => `'${s}'`).join(',')}));
${definitions.command}
${definitions.execute}
COMMIT;
`.replace(/[ \t]+$/gm, '');
writeFileSync(new URL('../../../supabase/migrations/20261029142010_consultation_feedback_states.sql', import.meta.url), artifact(extended, original, newStates, oldStates));
writeFileSync(new URL('../../../docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql', import.meta.url), artifact(original, extended, oldStates, newStates, true));
console.log(JSON.stringify({ changedPrivateFunctions: Object.keys(extended), baselineMd5: Object.fromEntries(Object.entries(original).map(([k,v]) => [k, md5(body(v))])), extendedMd5: Object.fromEntries(Object.entries(extended).map(([k,v]) => [k, md5(body(v))])) }));
