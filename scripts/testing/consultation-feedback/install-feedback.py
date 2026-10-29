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
import shutil
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
SAFETY_SHA = '5b5b082907609f8834fdc0f785579a00cda60f4b5ae8512875b5ea2935be6e5f'
SOURCE_SHA = 'b08687b233d5fe1317748b6adff61653d58dadd8'
MIN_FREE_BYTES = 10 * 1024 ** 3
ARTIFACTS = {
    'apply': ('supabase/migrations/20261029142010_consultation_feedback_states.sql',
              '32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda'),
    'rollback': ('docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql',
                 'aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa'),
}
OLD = ('54dd2351f7ca5ac458e7feb52729c88d', 'da2199a556779a36286deb2f534404a9')
NEW = ('20701b814f94276bc90f8cad51f16174', 'b97a210cd7e6064ffaa52c703b6d972a')
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
), objects AS (SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace)
SELECT jsonb_build_object(
 'namespaces',(SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM namespaces n),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) ORDER BY c.oid) FROM objects c),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN objects c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped),
 'functions',(SELECT jsonb_agg(CASE WHEN p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)')) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid) FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE p.prokind IN('f','p')),
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


def checks(safety, extended):
    """PR314 ACL/RLS checks without its installation-only empty-history demand."""
    prerequisite = safety.CHECKS.strip().rstrip(';')
    bodies, states = (NEW, NEW_STATES) if extended else (OLD, OLD_STATES)
    return """SELECT (to_jsonb(t.v)-'emptyReplies'-'emptyReceipts') || jsonb_build_object(
 'kernelBodies', (SELECT count(*)=2 AND bool_and(md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=CASE p.proname WHEN 'command' THEN '%s' ELSE '%s' END) FROM pg_proc p WHERE p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)'))),
 'kernelClosed', (SELECT count(*)=2 AND bool_and(pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[] AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN(to_regprocedure('consultation_private.command(jsonb)'),to_regprocedure('consultation_private.execute(jsonb)'))),
 'feedbackConstraint', (SELECT array_agg(m[1] ORDER BY m[1])=ARRAY[%s]::text[] FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid),'''([^'']*)''','g') m WHERE c.conrelid=to_regclass('public.consultation_actions') AND c.conname='consultation_actions_status_check' AND c.contype='c' AND c.convalidated AND NOT c.connoinherit)) FROM (%s) t(v);""" % (bodies[0], bodies[1], ','.join("'%s'" % s for s in states), prerequisite)


def payload(safety, operation, repo=ROOT):
    check(operation in ARTIFACTS, 'explicit_operation_required')
    path, expected = ARTIFACTS[operation]
    raw = (repo / path).read_bytes()
    check(safety.digest(raw) == expected, 'feedback_sql_bytes_changed')
    return raw.decode('utf-8')


def capacity(path):
    free = shutil.disk_usage(path).free
    check(free >= MIN_FREE_BYTES, 'capacity_below_10GiB')
    return free


def validate_rehearsal(safety, proof, binding):
    check(proof.get('status') == 'APPLIED' and proof.get('mode') == 'copy'
          and proof.get('binding') == binding and proof.get('targetStopped') is True
          and proof.get('sourceHealthyAfter') is True and proof.get('existingCatalogUnchanged') is True
          and proof.get('historyAndFinancialUnchanged') is True, 'feedback_copy_rehearsal_missing')
    safety.all_passed(proof.get('checks'), 9)


def binding_for(safety, attestation, operation):
    sql = payload(safety, operation)
    return {'sourceCodeSha': SOURCE_SHA, 'operation': operation,
            'attestationSha256': safety.digest(json.dumps(attestation, sort_keys=True).encode()),
            'payloadSha256': safety.digest(sql.encode()), 'safetyHelperSha256': SAFETY_SHA,
            'adapterSha256': safety.digest(Path(__file__).read_bytes())}


def reconcile(mode, attestation, operation, *, safety=None):
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
    binding = binding_for(safety, attestation, operation)
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
        unchanged = catalog == before['catalog'] and history == before['historyAndFinancial']
        matches = unchanged and (new if operation == 'apply' else old)
        result = {'status': 'MATCHED_TARGET_STATE_READBACK' if matches else 'UNRESOLVED',
                  'binding': binding, 'mode': mode, 'intentSha256': safety.digest((directory/(mode+'-intent.json')).read_bytes()),
                  'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'observedKernel': 'NEW' if new else 'OLD' if old else 'DRIFT',
                  'existingCatalogUnchanged': catalog == before['catalog'],
                  'historyAndFinancialUnchanged': history == before['historyAndFinancial'],
                  'observedSnapshotSha256': safety.digest(json.dumps(values, sort_keys=True).encode()),
                  'effectMatchesIntent': matches, 'installationExecuted': False, 'replayAllowed': False,
                  'nativeAcceptance': False, 'originalResultReplaced': False}
        name = mode+'-reconciliation-'+uuid4().hex+'.json'
        safety.write_exclusive(directory / name, result)
        print(json.dumps(result))
        return result


def run(mode, attestation, operation, *, safety=None):
    import fcntl  # No fallback lock or Windows operational execution.
    safety = safety or load_safety()
    safety.validate_attestation(attestation)
    check(mode in ('copy', 'source'), 'explicit_mode_required')
    sql = payload(safety, operation)
    check(safety.digest(Path(safety.__file__).read_bytes()) == SAFETY_SHA, 'safety_helper_bytes_changed')
    check(safety.digest(safety.HELPER.read_bytes()) == attestation['backupHelperSha256'], 'backup_helper_hash_changed')
    os.umask(0o077)
    checkpoint = safety.BACKUPS / attestation['checkpoint']
    directory = checkpoint / 'consultation-feedback-install' / operation
    binding = binding_for(safety, attestation, operation)

    def inspect(which):
        return json.loads(safety.command(['docker', 'inspect', attestation[which]['id']]))[0]

    def target_safe():
        safety.validate_attestation(attestation)
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
    args = parser.parse_args()
    action = reconcile if args.reconcile else run
    action(args.mode, json.loads(args.attestation.read_text(encoding='utf-8')), args.operation)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'feedback_verification_or_execution_failed_readback_required', 'automaticReplay': False}))
        raise SystemExit(2)
