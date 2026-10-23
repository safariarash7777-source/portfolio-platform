"""Reviewed one-shot additive installer; prepare locally, execute only by coordinator.

Run restored-copy rehearsal first (--target-copy), then --source only after the
coordinator independently verifies the encrypted backup. This script cannot
attest local DPAPI. No automatic replay, no role/registry bootstrap or rollback.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

SOURCE = 'portfolio-stage-db-1'
SOURCE_ID = '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
STAMP = '20261023T204308Z'
TARGET = 'portfolio-recovery-proof-' + STAMP.lower()
SQL_SHA = '4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91'
HELPER_SHA = '850822a79dc2e9e7838fd890294bc9e3758a6ef8b8a7e2388efe0cac3c5cbec2'
CHECKPOINT = Path('/root/portfolio-recovery-backups') / STAMP
ARTIFACTS = CHECKPOINT / 'consultation-install'
REPO = Path(__file__).resolve().parents[3]

# Full preexisting definitions/ACL inventory, excluding ONLY this package's
# separately collision-checked namespace and public objects. No table row data.
INVENTORY = r"""
WITH namespaces AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','consultation_private')
), objects AS (
 SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
 WHERE NOT(n.nspname='public' AND c.relname LIKE 'consultation_%')
), functions AS (
 SELECT p.* FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p') AND NOT(n.nspname='public' AND p.proname IN ('load_consultation','command_consultation'))
)
SELECT jsonb_build_object(
 'namespaces',(SELECT jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl::text) ORDER BY nspname) FROM namespaces),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) ORDER BY c.oid) FROM objects c),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN objects c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl::text,pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM functions p),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.conrelid,c.conname,pg_get_constraintdef(c.oid)) ORDER BY c.oid) FROM pg_constraint c JOIN objects o ON o.oid=c.conrelid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY t.oid) FROM pg_trigger t JOIN objects o ON o.oid=t.tgrelid WHERE NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.polrelid,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid) FROM pg_policy p JOIN objects o ON o.oid=p.polrelid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(i.indexrelid,pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN objects o ON o.oid=i.indrelid),
 'defaultAcl',(SELECT jsonb_agg(jsonb_build_array(d.oid,d.defaclrole,d.defaclnamespace,d.defaclobjtype,d.defaclacl::text) ORDER BY d.oid) FROM pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace IN(SELECT oid FROM namespaces)))::text;
"""

CHECKS = r"""
SELECT json_build_object(
 'nineTablesForced',(SELECT count(*)=9 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'consultation_%' AND c.relkind='r'),
 'directTablesClosed',NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege WHERE n.nspname='public' AND c.relname LIKE 'consultation_%' AND c.relkind='r' AND has_table_privilege(r,c.oid,privilege)),
 'privateSchemaClosed',NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_schema_privilege(r,'consultation_private','USAGE') OR has_schema_privilege(r,'consultation_private','CREATE')),
 'privateFunctionsClosed',NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r WHERE n.nspname='consultation_private' AND (has_function_privilege(r,p.oid,'EXECUTE') OR p.prosecdef OR pg_get_userbyid(p.proowner)<>'postgres' OR NOT('search_path=""'=ANY(p.proconfig)))),
 'wrappersRestricted',(SELECT count(*)=2 AND bool_and(p.prosecdef AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']::text[] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('command_consultation','load_consultation')),
 'immutableHistory',(SELECT count(*)=16 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'consultation_%' AND c.relname<>'consultation_advisors' AND NOT t.tgisinternal AND t.tgenabled='O'),
 'emptyOwnerRegistry',NOT EXISTS(SELECT FROM public.consultation_advisors),
 'emptyRelations',NOT EXISTS(SELECT FROM public.consultation_relationships),
 'emptySessions',NOT EXISTS(SELECT FROM public.consultation_sessions),
 'emptyReceipts',NOT EXISTS(SELECT FROM public.consultation_command_receipts));
"""


def check(condition, code):
    if not condition:
        raise RuntimeError(code)


def command(args, body=None, timeout=90):
    result = subprocess.run(args, input=body, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    check(result.returncode == 0, 'operation_failed_readback_required')
    return result.stdout.decode()


def inspect(name):
    check(name in (SOURCE, TARGET), 'unexpected_target')
    return json.loads(command(['docker', 'inspect', name]))[0]


def source_healthy():
    state = inspect(SOURCE)
    check(state['Id'] == SOURCE_ID and state['Image'] == IMAGE and state['State']['Running'] is True
          and state['State'].get('Health', {}).get('Status') == 'healthy', 'source_identity_or_health_changed')
    return state


def copy_safe(state, source, running):
    check(state['Name'] == '/' + TARGET and state['Id'] != SOURCE_ID and state['Image'] == IMAGE,
          'copy_identity_changed')
    check(state['State']['Running'] is running and state['HostConfig']['NetworkMode'] == 'none'
          and not state['HostConfig'].get('PortBindings') and not any((state['NetworkSettings'].get('Ports') or {}).values()), 'copy_not_isolated')
    check(state['Config'].get('Labels', {}).get('portfolio.recovery') == 'isolated-proof', 'copy_label_changed')
    command_line = state['Config'].get('Cmd') or []
    check('cron.launch_active_jobs=off' in command_line, 'copy_cron_enabled')
    check(any(m.get('Type') == 'bind' and m.get('Source') == str(CHECKPOINT)
              and m.get('Destination') == '/recovery' and m.get('RW') is False for m in state['Mounts']), 'copy_backup_mount_changed')
    source_mounts = {m.get('Source') for m in source['Mounts']}
    for mount in state['Mounts']:
        check(mount.get('Source') not in source_mounts, 'copy_shares_source_mount')
        check((mount.get('Type') == 'bind' and mount.get('Source') == str(CHECKPOINT)
               and mount.get('Destination') == '/recovery' and mount.get('RW') is False)
              or mount.get('Type') in ('volume', 'tmpfs'), 'unexpected_copy_mount')


def query(target, sql):
    return command(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s',
                    target, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql.encode())


def write_exclusive(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def digest(value):
    return hashlib.sha256(value).hexdigest()


def main():
    import fcntl
    check(sys.argv[1:] in (['--target-copy'], ['--source']), 'explicit_execution_mode_required')
    mode = 'copy' if sys.argv[1] == '--target-copy' else 'source'
    os.umask(0o077)
    sql = (REPO / 'sql/consultation_workflow.sql').read_bytes()
    check(digest(sql) == SQL_SHA, 'sql_hash_changed')
    # Verify the exact reviewed backup helper bytes; do not import/execute it.
    helper = Path('/root/portfolio-recovery-tools/cashflow-native-reviewed.py')
    check(digest(helper.read_bytes()) == HELPER_SHA, 'backup_helper_hash_changed')
    with open('/root/portfolio-recovery-backups/.cashflow-release.lock', 'a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        proof_bytes = (CHECKPOINT / 'receipt.json').read_bytes()
        proof = json.loads(proof_bytes)
        check(proof['status'] == 'passed' and proof['comparisonEqual'] is True
              and proof['targetStopped'] is True and proof['sourceContainerUnchanged'] is True
              and proof['sourceHealthyAfter'] is True, 'backup_not_passed')
        check(proof['startedAt'] == STAMP and proof['source'] == SOURCE and proof['sourceContainerId'] == SOURCE_ID
              and proof['sourceImage'] == IMAGE and proof['target'] == TARGET
              and proof['network'] == 'none' and proof['portsPublished'] is False
              and proof['cronEnabledOnTarget'] is False and proof['mismatchCounts'] == {'sourceOnly': 0, 'targetOnly': 0}, 'backup_provenance_changed')
        source = source_healthy()
        ARTIFACTS.mkdir(mode=0o700, exist_ok=True)
        if mode == 'source':
            rehearsal = json.loads((ARTIFACTS / 'copy-result.json').read_text())
            check(rehearsal['status'] == 'APPLIED' and rehearsal['sqlSha256'] == SQL_SHA
                  and rehearsal['checkpointReceiptSha256'] == digest(proof_bytes)
                  and rehearsal['existingCatalogUnchanged'] is True and rehearsal['targetStopped'] is True,
                  'copy_rehearsal_missing')
        target = TARGET if mode == 'copy' else SOURCE
        intent_path = ARTIFACTS / (mode + '-intent.json')
        check(not intent_path.exists(), 'prior_attempt_requires_readback_no_replay')
        started = False
        result = {'status': 'BLOCKED', 'mode': mode, 'sqlSha256': SQL_SHA,
                  'checkpoint': STAMP, 'checkpointReceiptSha256': digest(proof_bytes),
                  'sourceId': SOURCE_ID, 'encryptedBackupVerification': 'external_coordinator_gate_not_attested_here'}
        try:
            if mode == 'copy':
                state = inspect(TARGET)
                copy_safe(state, source, False)
                result['targetId'] = state['Id']
                command(['docker', 'start', TARGET])
                started = True
                for _ in range(30):
                    ready = subprocess.run(['docker', 'exec', TARGET, 'pg_isready', '-U', 'postgres'], capture_output=True, timeout=5)
                    if ready.returncode == 0:
                        break
                    time.sleep(1)
                else:
                    raise RuntimeError('copy_not_ready')
                state = inspect(TARGET)
                copy_safe(state, source, True)
                check(state['Id'] == result['targetId'], 'copy_id_changed')
                check(query(TARGET, 'SHOW cron.launch_active_jobs;').strip() == 'off', 'copy_cron_enabled')
            before = query(target, 'BEGIN READ ONLY;' + INVENTORY + 'COMMIT;').strip()
            write_exclusive(ARTIFACTS / (mode + '-catalog-before.json'), json.loads(before))
            # Exclusive durable intent precedes all package DDL. A lost result
            # must be inspected; this script will never repeat the write.
            write_exclusive(intent_path, {**result, 'status': 'INTENT_RECORDED',
                                          'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
            source_healthy()
            query(target, sql.decode())
            result['status'] = 'APPLIED_REVIEW_REQUIRED'
            after = query(target, 'BEGIN READ ONLY;' + INVENTORY + 'COMMIT;').strip()
            write_exclusive(ARTIFACTS / (mode + '-catalog-after.json'), json.loads(after))
            result['existingCatalogUnchanged'] = before == after
            result['catalogBeforeSha256'] = digest(before.encode())
            result['catalogAfterSha256'] = digest(after.encode())
            result['checks'] = json.loads(query(target, 'BEGIN READ ONLY;' + CHECKS + 'COMMIT;'))
            check(result['existingCatalogUnchanged'] and all(v is True for v in result['checks'].values()), 'post_install_verification_failed')
            source_healthy()
            if mode == 'source':
                query(target, "NOTIFY pgrst, 'reload schema';")
            result['status'] = 'APPLIED'
        finally:
            if started:
                current = inspect(TARGET)
                check(current['Id'] == result['targetId'], 'copy_id_changed_before_stop')
                command(['docker', 'stop', '-t', '10', TARGET], timeout=30)
                result['targetStopped'] = inspect(TARGET)['State']['Running'] is False
            source_healthy()
            result['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            write_exclusive(ARTIFACTS / (mode + '-result.json'), result)
            print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'verification_or_execution_failed_readback_required', 'automaticReplay': False}))
        sys.exit(2)
