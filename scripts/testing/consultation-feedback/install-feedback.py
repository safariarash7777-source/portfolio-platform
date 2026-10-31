"""Code-only START-A adapter. No SSH, provisioning, automatic replay or rollback.

Linux execution requires external current authorization and an exact reviewed bundle.
Reuses PR314 identity, backup, isolation, durable-write and transport guards.
"""
import argparse
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
SAFETY_SHA = '5b5b082907609f8834fdc0f785579a00cda60f4b5ae8512875b5ea2935be6e5f'
SOURCE_SHA = 'b08687b233d5fe1317748b6adff61653d58dadd8'
MIN_FREE_BYTES = 10 * 1024 ** 3
ARTIFACTS = {
    'apply': [
        ('supabase/migrations/20261029142010_consultation_feedback_states.sql', '32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda'),
        ('supabase/migrations/20261029160723_consultation_feedback_rollout_guard.sql', '5b3538d2a4526c91ac0af092b86a81b3e7bb140dab88ad20aef30abff2ff03e2'),
    ],
    'rollback': [
        ('docs/ops/start-a-finance-v04-20261029/rollback-rollout.sql', 'bb8964f7d07df1575c8a70bf762987e4830600ccacfe72eac63e4af79e9377ba'),
        ('docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql', 'aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa'),
    ],
}
OLD = ('54dd2351f7ca5ac458e7feb52729c88d', 'da2199a556779a36286deb2f534404a9', 'ca3cf9c59e64d0bf8a442413635a3ac3')
NEW = ('20701b814f94276bc90f8cad51f16174', 'e65e1a32348c961f2b409a4f6593c05f', 'e3b2b74277cc66c024a772e48382cfb1')
OLD_STATES = ['acknowledged', 'doing', 'done', 'question', 'viewed']
NEW_STATES = sorted(OLD_STATES + ['partial', 'not_done'])


def check(condition, code):
    if not condition:
        raise RuntimeError(code)


def load_safety(path=None):
    import hashlib
    path = Path(path or ROOT / 'scripts/testing/consultation-next/install-native.py')
    check(hashlib.sha256(path.read_bytes()).hexdigest() == SAFETY_SHA, 'safety_helper_bytes_changed')
    spec = importlib.util.spec_from_file_location('start_a_reviewed_safety', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Preserve ALL preexisting objects including the PR314 extension. Exclude only the
# reviewed constraint tuple and the prosrc field of the two exact changed functions.
INVENTORY = r"""
WITH namespaces AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
), objects AS (SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace WHERE NOT(n.nspname='consultation_private' AND c.relname IN('feedback_rollout','feedback_rollout_pkey')))
SELECT jsonb_build_object(
 'namespaces',(SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM namespaces n),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) ORDER BY c.oid) FROM objects c),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN objects c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped),
 'functions',(SELECT jsonb_agg(CASE WHEN p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)'),to_regprocedure('consultation_private.load(uuid,date,date)')) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid) FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE p.prokind IN('f','p')),
 'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c JOIN objects o ON o.oid=c.conrelid WHERE NOT(c.conrelid=to_regclass('public.consultation_actions') AND c.conname='consultation_actions_status_check')),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN objects o ON o.oid=t.tgrelid WHERE NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN objects o ON o.oid=p.polrelid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(i.indexrelid,pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN objects o ON o.oid=i.indrelid),
 'defaultAcl',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace IN(SELECT oid FROM namespaces)));
"""
HISTORY_TABLES = [
    'consultation_advisors', 'consultation_relationships', 'consultation_revocations',
    'consultation_sessions', 'consultation_private_notes', 'consultation_events',
    'consultation_publications', 'consultation_actions', 'consultation_command_receipts',
    'consultation_reply_versions', 'consultation_reply_receipts',
    'member_holding_versions', 'member_holding_positions', 'member_cash_flow_versions',
    'member_cash_flow_entries', 'member_goals_versions',
]
HISTORY = 'SELECT jsonb_build_object(' + ','.join(
    "'%s',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(h, '' ORDER BY h),''),'UTF8')),'hex')) FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h FROM public.%s r) hashes)" % (name, name)
    for name in HISTORY_TABLES) + ');'
ROLLOUT_DEFAULT_OFF = "SELECT count(*)=1 AND bool_and(NOT enabled AND reader_sha IS NULL AND reviewed_at IS NULL) FROM consultation_private.feedback_rollout;"


def checks(safety, extended):
    """PR314 ACL/RLS checks without its installation-only empty-history demand."""
    prerequisite = safety.CHECKS.strip().rstrip(';')
    bodies, states = (NEW, NEW_STATES) if extended else (OLD, OLD_STATES)
    gate = """(SELECT count(*)=1 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres' AND NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege WHERE has_table_privilege(r,c.oid,privilege))) FROM pg_class c WHERE c.oid=to_regclass('consultation_private.feedback_rollout'))""" if extended else "to_regclass('consultation_private.feedback_rollout') IS NULL"
    return """SELECT (to_jsonb(t.v)-'emptyReplies'-'emptyReceipts') || jsonb_build_object(
 'kernelBodies', (SELECT count(*)=3 AND bool_and(md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=CASE p.proname WHEN 'command' THEN '%s' WHEN 'execute' THEN '%s' ELSE '%s' END) FROM pg_proc p WHERE p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)'),to_regprocedure('consultation_private.load(uuid,date,date)'))),
 'kernelClosed', (SELECT count(*)=3 AND bool_and(pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)'),to_regprocedure('consultation_private.load(uuid,date,date)'))) AND (%s),
 'feedbackConstraint', (SELECT array_agg(m[1] ORDER BY m[1])=ARRAY[%s]::text[] FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid),'''([^'']*)''','g') m WHERE c.conrelid=to_regclass('public.consultation_actions') AND c.conname='consultation_actions_status_check' AND c.contype='c' AND c.convalidated AND NOT c.connoinherit)) FROM (%s) t(v);""" % (bodies[0], bodies[1], bodies[2], gate, ','.join("'%s'" % s for s in states), prerequisite)


def payload(safety, operation, repo=ROOT):
    check(operation in ARTIFACTS, 'explicit_operation_required')
    bodies = []
    for path, expected in ARTIFACTS[operation]:
        raw = (repo / path).read_bytes()
        check(safety.digest(raw) == expected, 'feedback_sql_bytes_changed')
        text = raw.decode('utf-8')
        check(len(re.findall(r'^BEGIN;\s*$',text,re.M))==1 and len(re.findall(r'^COMMIT;\s*$',text,re.M))==1, 'feedback_transaction_boundary_changed')
        bodies.append(re.sub(r'^COMMIT;\s*$','',re.sub(r'^BEGIN;\s*$','',text,count=1,flags=re.M),count=1,flags=re.M))
    return 'BEGIN;\n'+'\n'.join(bodies)+'\nCOMMIT;\n'


def capacity(path):
    free = shutil.disk_usage(path).free
    check(free >= MIN_FREE_BYTES, 'capacity_below_10GiB')
    return free


def validate_rehearsal(safety, proof, binding):
    check(proof.get('status') == 'APPLIED' and proof.get('mode') == 'copy'
          and proof.get('binding') == binding and proof.get('targetStopped') is True
          and proof.get('sourceHealthyAfter') is True and proof.get('existingCatalogUnchanged') is True
          and proof.get('historyAndFinancialUnchanged') is True and proof.get('rolloutDefaultOff') is True, 'feedback_copy_rehearsal_missing')
    safety.all_passed(proof.get('checks'), 9)


def validate_reader(reader, attestation, payload_sha, now=None):
    check(isinstance(reader,dict) and set(reader)=={'contractVersion','sourceContainerId','readerSha','deploymentId','url','checkedAt','verificationReceiptSha256','payloadSha256','authority','checks'}, 'reader_attestation_shape')
    check(reader['contractVersion']=='consultation-feedback-reader.v1' and reader['authority']=='VERIFIED_BY_COORDINATOR', 'reader_attestation_authority')
    check(reader['sourceContainerId']==attestation['source']['id'] and reader['payloadSha256']==payload_sha, 'reader_environment_or_payload_changed')
    check(isinstance(reader['readerSha'],str) and re.fullmatch(r'[a-f0-9]{40}',reader['readerSha']) and isinstance(reader['verificationReceiptSha256'],str) and re.fullmatch(r'[a-f0-9]{64}',reader['verificationReceiptSha256']), 'reader_digest_invalid')
    check(isinstance(reader['deploymentId'],str) and re.fullmatch(r'dpl_[A-Za-z0-9]+',reader['deploymentId']), 'reader_deployment_identity_invalid')
    url=urlsplit(reader['url'])
    check(url.scheme=='https' and url.hostname and not url.username and not url.password and not url.query and not url.fragment, 'reader_url_invalid')
    checked=dt.datetime.fromisoformat(reader['checkedAt'].replace('Z','+00:00'))
    check(checked.utcoffset()==dt.timedelta(0) and 0<=((now or dt.datetime.now(dt.timezone.utc))-checked).total_seconds()<=86400, 'reader_proof_not_fresh')
    check(set(reader['checks'])=={'oldSqlRead','missingCapabilityOff','newSqlRead','newHistoryReadable','uiWriterOff','postWriterOff'} and all(v is True for v in reader['checks'].values()), 'reader_compatibility_not_verified')


def binding_for(safety, attestation, operation, reader=None):
    sql = payload(safety, operation)
    return {'sourceBaseSha': SOURCE_SHA, 'operation': operation,
            'attestationSha256': safety.digest(json.dumps(attestation, sort_keys=True).encode()),
            'payloadSha256': safety.digest(sql.encode()), 'safetyHelperSha256': SAFETY_SHA,
            'adapterSha256': safety.digest(Path(__file__).read_bytes()),
            'readerAttestationSha256':safety.digest(json.dumps(reader,sort_keys=True).encode()) if reader else None}


def reconcile(mode, attestation, operation, *, safety=None, reader=None):
    """Observe one existing intent. Never DDL, start/stop, replay or replace evidence.

    A stopped copy must be started separately by its authorized owner. Old state
    cannot prove an unknown original operation will never commit: it stays unresolved.
    """
    import fcntl
    safety = safety or load_safety()
    # Check the original attestation's exact structure/identity, without pretending
    # a historical checkpoint is fresh write authorization. No write path uses this.
    stamp = dt.datetime.strptime(attestation['checkpoint'], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    safety.validate_attestation(attestation, now=stamp)
    check(mode in ('copy', 'source'), 'explicit_mode_required')
    check(safety.digest(Path(safety.__file__).read_bytes()) == SAFETY_SHA, 'safety_helper_bytes_changed')
    directory = safety.BACKUPS / attestation['checkpoint'] / 'consultation-feedback-install' / operation
    binding = binding_for(safety, attestation, operation, reader)
    if reader:
        validate_reader(reader,attestation,binding['payloadSha256'],now=dt.datetime.fromisoformat(reader['checkedAt'].replace('Z','+00:00')))
    with (safety.BACKUPS / '.cashflow-release.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        intent = json.loads((directory / (mode+'-intent.json')).read_text())
        check(intent.get('binding') == binding and intent.get('mode') == mode
              and intent.get('sourceId') == attestation['source']['id']
              and intent.get('targetId') == attestation[mode]['id'], 'intent_binding_changed')
        before = json.loads((directory / (mode+'-before.json')).read_text())
        check(safety.digest(json.dumps(before, sort_keys=True).encode()) == intent.get('beforeSha256'), 'intent_before_fingerprint_changed')
        source = json.loads(safety.command(['docker', 'inspect', attestation['source']['id']]))[0]
        safety.source_safe(source, attestation)
        if mode == 'copy':
            copy = json.loads(safety.command(['docker', 'inspect', attestation['copy']['id']]))[0]
            safety.copy_safe(copy, source, attestation, True)
        query = ('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/* START_A_RECONCILE_READONLY */'
                 + INVENTORY + HISTORY + checks(safety, False) + checks(safety, True) + 'COMMIT;')
        raw = safety.command(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s',
                              attestation[mode]['id'], 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
                              '-v', 'ON_ERROR_STOP=1'], query.encode())
        values = [json.loads(line) for line in raw.splitlines() if line.strip()]
        check(len(values) == 4, 'reconciliation_shape_changed')
        catalog, history, old_checks, new_checks = values
        old = len(old_checks) == 9 and all(v is True for v in old_checks.values())
        new = len(new_checks) == 9 and all(v is True for v in new_checks.values())
        gate_off = old
        if new:
            raw_gate = safety.command(['docker','exec','-i','-e','PGOPTIONS=-c statement_timeout=10s',
                                       attestation[mode]['id'],'psql','-XqAt','-U','postgres','-d','postgres',
                                       '-v','ON_ERROR_STOP=1'], ('BEGIN READ ONLY;'+ROLLOUT_DEFAULT_OFF+'COMMIT;').encode())
            gate_off = raw_gate.strip() == 't'
        unchanged = catalog == before['catalog'] and history == before['historyAndFinancial']
        matches = unchanged and gate_off and (new if operation == 'apply' else old)
        result = {'status': 'MATCHED_TARGET_STATE_READBACK' if matches else 'UNRESOLVED',
                  'binding': binding, 'mode': mode, 'intentSha256': safety.digest((directory/(mode+'-intent.json')).read_bytes()),
                  'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'observedKernel': 'NEW' if new else 'OLD' if old else 'DRIFT',
                  'existingCatalogUnchanged': catalog == before['catalog'],
                  'historyAndFinancialUnchanged': history == before['historyAndFinancial'],
                  'observedSnapshotSha256': safety.digest(json.dumps(values, sort_keys=True).encode()),
                  'effectMatchesIntent': matches, 'installationExecuted': False, 'replayAllowed': False,
                  'rolloutDefaultOff': gate_off,
                  'nativeAcceptance': False, 'originalResultReplaced': False}
        name = mode+'-reconciliation-'+uuid4().hex+'.json'
        safety.write_exclusive(directory / name, result)
        print(json.dumps(result))
        return result


def run(mode, attestation, operation, *, safety=None, reader=None):
    import fcntl  # No fallback lock or Windows operational execution.
    safety = safety or load_safety()
    safety.validate_attestation(attestation)
    check(mode in ('copy', 'source'), 'explicit_mode_required')
    sql = payload(safety, operation)
    check(mode!='source' or reader is not None, 'source_reader_proof_required')
    if reader:
        validate_reader(reader,attestation,safety.digest(sql.encode()))
    check(safety.digest(Path(safety.__file__).read_bytes()) == SAFETY_SHA, 'safety_helper_bytes_changed')
    check(safety.digest(safety.HELPER.read_bytes()) == attestation['backupHelperSha256'], 'backup_helper_hash_changed')
    os.umask(0o077)
    checkpoint = safety.BACKUPS / attestation['checkpoint']
    directory = checkpoint / 'consultation-feedback-install' / operation
    binding = binding_for(safety, attestation, operation, reader)

    def inspect(which):
        return json.loads(safety.command(['docker', 'inspect', attestation[which]['id']]))[0]

    def target_safe():
        safety.validate_attestation(attestation)
        if reader:
            validate_reader(reader,attestation,binding['payloadSha256'])
        source = inspect('source')
        safety.source_safe(source, attestation)
        if mode == 'copy':
            safety.copy_safe(inspect('copy'), source, attestation, True)

    def query(value):
        target_safe()
        return safety.command(['docker', 'exec', '-i', '-e',
                               'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s',
                               attestation[mode]['id'], 'psql', '-XqAt', '-U', 'postgres',
                               '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], value.encode())

    def snapshot():
        values = [json.loads(line) for line in query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + INVENTORY + HISTORY + 'COMMIT;').splitlines() if line.strip()]
        check(len(values) == 2, 'snapshot_shape_changed')
        return {'catalog': values[0], 'historyAndFinancial': values[1]}

    with (safety.BACKUPS / '.cashflow-release.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        safety.validate_backup((checkpoint / 'receipt.json').read_bytes(), attestation)
        capacity(safety.BACKUPS)
        safety.source_safe(inspect('source'), attestation)
        safety.copy_safe(inspect('copy'), inspect('source'), attestation, False)
        if mode == 'source':
            validate_rehearsal(safety, json.loads((directory / 'copy-result.json').read_text()), binding)
        directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        check(not any((directory / (mode + suffix)).exists() for suffix in
                      ('-intent.json', '-result.json', '-before.json', '-after.json')),
              'prior_feedback_attempt_requires_readback_no_replay')
        result = {'status': 'BLOCKED', 'mode': mode, 'binding': binding,
                  'checkpoint': attestation['checkpoint'], 'sourceId': attestation['source']['id'],
                  'targetId': attestation[mode]['id'], 'automaticReplay': False,
                  'schemaReloadRequested': False, 'nativeAcceptance': False,
                  'encryptedBackupVerification': 'external_coordinator_attestation_not_decrypted_by_adapter'}
        try:
            if mode == 'copy':
                safety.command(['docker', 'start', attestation['copy']['id']])
                for attempt in range(30):
                    target_safe()
                    try:
                        safety.command(['docker', 'exec', attestation['copy']['id'], 'pg_isready', '-U', 'postgres'], timeout=5)
                        break
                    except RuntimeError:
                        if attempt == 29:
                            raise RuntimeError('copy_not_ready')
                        safety.time.sleep(0.5)
                check(query('SELECT 1;').strip() == '1', 'copy_not_ready')
                check(query('SHOW cron.launch_active_jobs;').strip() == 'off', 'copy_cron_enabled')
            before_checks = json.loads(query('BEGIN READ ONLY;' + checks(safety, operation == 'rollback') + 'COMMIT;'))
            safety.all_passed(before_checks, 9)
            before = snapshot()
            safety.write_exclusive(directory / (mode + '-before.json'), before)
            result['beforeSha256'] = safety.digest(json.dumps(before, sort_keys=True).encode())
            result['capacityFreeBytesBeforeDdl'] = capacity(safety.BACKUPS)
            target_safe()
            safety.write_exclusive(directory / (mode + '-intent.json'),
                                   {**result, 'status': 'INTENT_RECORDED', 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
            result['status'] = 'OUTCOME_UNKNOWN_READBACK_REQUIRED'
            query(sql)  # Exactly one DDL request. Never auto-replayed or auto-rolled back.
            result['status'] = 'APPLIED_REVIEW_REQUIRED'
            after = snapshot()
            safety.write_exclusive(directory / (mode + '-after.json'), after)
            result['existingCatalogUnchanged'] = before['catalog'] == after['catalog']
            result['historyAndFinancialUnchanged'] = before['historyAndFinancial'] == after['historyAndFinancial']
            result['beforeSha256'] = safety.digest(json.dumps(before, sort_keys=True).encode())
            result['afterSha256'] = safety.digest(json.dumps(after, sort_keys=True).encode())
            result['checks'] = json.loads(query('BEGIN READ ONLY;' + checks(safety, operation == 'apply') + 'COMMIT;'))
            safety.all_passed(result['checks'], 9)
            result['rolloutDefaultOff'] = operation == 'rollback' or query('BEGIN READ ONLY;'+ROLLOUT_DEFAULT_OFF+'COMMIT;').strip() == 't'
            check(result['rolloutDefaultOff'], 'rollout_gate_not_default_off')
            check(result['existingCatalogUnchanged'], 'unexpected_existing_catalog_change')
            check(result['historyAndFinancialUnchanged'], 'history_or_financial_change_requires_review')
            # Signatures and public schema are unchanged: no reload, GRANT or flag write.
            result['status'] = 'APPLIED'
        finally:
            cleanup_errors = []
            if mode == 'copy':
                try:
                    source, copy = inspect('source'), inspect('copy')
                    running = copy['State']['Running']
                    safety.copy_safe(copy, source, attestation, running)
                    if running:
                        safety.command(['docker', 'stop', '-t', '10', attestation['copy']['id']], timeout=30)
                    safety.copy_safe(inspect('copy'), source, attestation, False)
                    result['targetStopped'] = True
                except Exception:
                    cleanup_errors.append('copy_stop_requires_review')
            try:
                safety.source_safe(inspect('source'), attestation)
                result['sourceHealthyAfter'] = True
            except Exception:
                result['sourceHealthyAfter'] = False
                cleanup_errors.append('source_identity_or_health_requires_review')
            if cleanup_errors and result['status'] == 'APPLIED':
                result['status'] = 'APPLIED_REVIEW_REQUIRED'
            result['cleanupErrors'] = cleanup_errors
            result['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            safety.write_exclusive(directory / (mode + '-result.json'), result)
            print(json.dumps(result))
            check(not cleanup_errors, 'cleanup_or_source_health_requires_review')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attestation', required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=('copy', 'source'))
    parser.add_argument('--operation', required=True, choices=('apply', 'rollback'))
    parser.add_argument('--reconcile', action='store_true', help='Read an existing intent; no DDL, resource start/stop or replay')
    parser.add_argument('--reader-attestation', type=Path, help='Required and bound before copy rehearsal intended to authorize source')
    args = parser.parse_args()
    action = reconcile if args.reconcile else run
    reader=json.loads(args.reader_attestation.read_text(encoding='utf-8')) if args.reader_attestation else None
    action(args.mode, json.loads(args.attestation.read_text(encoding='utf-8')), args.operation,reader=reader)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'feedback_verification_or_execution_failed_readback_required', 'automaticReplay': False}))
        raise SystemExit(2)
