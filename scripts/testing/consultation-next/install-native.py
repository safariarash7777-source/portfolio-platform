"""One-shot additive installer. Code only; coordinator supplies fresh attestation.

No SSH, credentials, account bootstrap, automatic retry, deployment or rollback.
Copy rehearsal and source install use the same externally verified checkpoint.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

REPO = Path(__file__).resolve().parents[3]
BACKUPS = Path('/root/portfolio-recovery-backups')
HELPER = Path('/root/portfolio-recovery-tools/cashflow-native-reviewed.py')
SQL_HASHES = {
    'sql/consultation_roster.sql': '03ccf7c622640ca508d8f60f6b1e8825de959ab038679c8cd798b87f331b5523',
    'sql/consultation_replies.sql': '57702c0090d643fa3eacd765ac19aecb36acd7254a161524dbe6b9326da4f49a',
}
BASELINE_SHA = '4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91'

INVENTORY = r"""
WITH namespaces AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema')
), objects AS (
 SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
 WHERE NOT(n.nspname='public' AND c.relname IN ('consultation_reply_versions','consultation_reply_versions_pkey','consultation_reply_versions_question_id_version_key','consultation_reply_receipts','consultation_reply_receipts_pkey'))
), functions AS (
 SELECT p.* FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p') AND NOT((n.nspname='public' AND p.proname IN ('load_consultation_roster','command_consultation_reply','load_consultation_replies')) OR (n.nspname='consultation_private' AND p.proname IN ('reply_command','reply_read_only','execute_reply','load_replies')))
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

PREFLIGHT = r"""
SELECT json_build_object(
 'baselinePresent',to_regprocedure('public.command_consultation(jsonb)') IS NOT NULL AND to_regprocedure('public.load_consultation(uuid,date,date)') IS NOT NULL AND to_regprocedure('auth.uid()') IS NOT NULL,
 'noRelations',NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('consultation_reply_versions','consultation_reply_versions_pkey','consultation_reply_versions_question_id_version_key','consultation_reply_receipts','consultation_reply_receipts_pkey')),
 'noFunctions',NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN('load_consultation_roster','command_consultation_reply','load_consultation_replies')) OR (n.nspname='consultation_private' AND p.proname IN('reply_command','reply_read_only','execute_reply','load_replies'))));
"""
CHECKS = r"""
SELECT json_build_object(
 'twoTablesForced',(SELECT count(*)=2 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('consultation_reply_versions','consultation_reply_receipts') AND c.relkind='r'),
 'directTablesClosed',NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege WHERE n.nspname='public' AND c.relname IN('consultation_reply_versions','consultation_reply_receipts') AND has_table_privilege(r,c.oid,privilege)),
 'privateSchemaClosed',NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_schema_privilege(r,'consultation_private','USAGE') OR has_schema_privilege(r,'consultation_private','CREATE')),
 'privateFunctionsClosed',(SELECT count(*)=4 AND bool_and(NOT p.prosecdef AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']::text[] AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='consultation_private' AND p.proname IN('reply_command','reply_read_only','execute_reply','load_replies')),
 'wrappersRestricted',(SELECT count(*)=3 AND bool_and(p.prosecdef AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']::text[] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('load_consultation_roster','command_consultation_reply','load_consultation_replies')),
 'immutableHistory',(SELECT count(*)=4 AND bool_and(t.tgenabled='O' AND t.tgfoid='consultation_private.reject_mutation()'::regprocedure) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('consultation_reply_versions','consultation_reply_receipts') AND NOT t.tgisinternal),
 'emptyReplies',NOT EXISTS(SELECT FROM public.consultation_reply_versions),
 'emptyReceipts',NOT EXISTS(SELECT FROM public.consultation_reply_receipts));
"""


def check(condition, code):
    if not condition:
        raise RuntimeError(code)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def validate_attestation(value, now=None):
    """Explicit coordinator input, not a guessed checkpoint or credential."""
    keys = {'contractVersion', 'checkpoint', 'checkpointReceiptSha256', 'source', 'copy',
            'backupHelperSha256', 'encryptedBackupVerification'}
    check(isinstance(value, dict) and set(value) == keys, 'invalid_attestation_keys')
    check(value['contractVersion'] == 'consultation-next-install.v1', 'invalid_attestation_contract')
    stamp = value['checkpoint']
    check(isinstance(stamp, str) and re.fullmatch(r'\d{8}T\d{6}Z', stamp), 'invalid_checkpoint')
    created = dt.datetime.strptime(stamp, '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    age = ((now or dt.datetime.now(dt.timezone.utc)) - created).total_seconds()
    check(0 <= age <= 86400, 'checkpoint_not_fresh')
    for field in ('checkpointReceiptSha256', 'backupHelperSha256'):
        check(isinstance(value[field], str) and re.fullmatch(r'[a-f0-9]{64}', value[field]), 'invalid_digest')
    source, copy = value['source'], value['copy']
    check(isinstance(source, dict) and set(source) == {'name', 'id', 'image'}, 'invalid_source')
    check(source['name'] == 'portfolio-stage-db-1' and re.fullmatch(r'[a-f0-9]{64}', source['id'])
          and re.fullmatch(r'sha256:[a-f0-9]{64}', source['image']), 'invalid_source_identity')
    check(isinstance(copy, dict) and set(copy) == {'name', 'id'}, 'invalid_copy')
    check(copy['name'] == 'portfolio-recovery-proof-' + stamp.lower()
          and re.fullmatch(r'[a-f0-9]{64}', copy['id']) and copy['id'] != source['id'], 'invalid_copy_identity')
    encrypted = value['encryptedBackupVerification']
    check(isinstance(encrypted, dict) and set(encrypted) == {'status', 'receiptSha256', 'checkpointReceiptSha256'}, 'invalid_encrypted_gate')
    check(encrypted['status'] == 'VERIFIED_BY_COORDINATOR'
          and re.fullmatch(r'[a-f0-9]{64}', encrypted['receiptSha256'])
          and encrypted['checkpointReceiptSha256'] == value['checkpointReceiptSha256'], 'encrypted_gate_not_bound')
    return value


def validate_backup(raw, attestation):
    check(digest(raw) == attestation['checkpointReceiptSha256'], 'checkpoint_receipt_changed')
    proof = json.loads(raw)
    check(proof['status'] == 'passed' and proof['comparisonEqual'] is True
          and proof['targetStopped'] is True and proof['sourceContainerUnchanged'] is True
          and proof['sourceHealthyAfter'] is True, 'backup_not_passed')
    check(proof['startedAt'] == attestation['checkpoint'] and proof['source'] == attestation['source']['name']
          and proof['sourceContainerId'] == attestation['source']['id'] and proof['sourceImage'] == attestation['source']['image']
          and proof['target'] == attestation['copy']['name'] and proof['network'] == 'none'
          and proof['portsPublished'] is False and proof['cronEnabledOnTarget'] is False
          and proof['mismatchCounts'] == {'sourceOnly': 0, 'targetOnly': 0}, 'backup_provenance_changed')


def source_safe(state, attestation):
    expected = attestation['source']
    check(state['Name'] == '/' + expected['name'] and state['Id'] == expected['id'] and state['Image'] == expected['image']
          and state['State']['Running'] is True and state['State'].get('Health', {}).get('Status') == 'healthy', 'source_identity_or_health_changed')


def copy_safe(state, source, attestation, running):
    expected = attestation['copy']
    checkpoint = BACKUPS / attestation['checkpoint']
    check(state['Name'] == '/' + expected['name'] and state['Id'] == expected['id']
          and state['Image'] == attestation['source']['image'], 'copy_identity_changed')
    check(state['State']['Running'] is running and state['HostConfig']['NetworkMode'] == 'none'
          and not state['HostConfig'].get('PortBindings') and not any((state['NetworkSettings'].get('Ports') or {}).values()), 'copy_not_isolated')
    check(state['Config'].get('Labels', {}).get('portfolio.recovery') == 'isolated-proof', 'copy_label_changed')
    check('cron.launch_active_jobs=off' in (state['Config'].get('Cmd') or []), 'copy_cron_enabled')
    check(any(m.get('Type') == 'bind' and m.get('Source') == str(checkpoint)
              and m.get('Destination') == '/recovery' and m.get('RW') is False for m in state['Mounts']), 'copy_backup_mount_changed')
    source_mounts = {m.get('Source') for m in source['Mounts']}
    for mount in state['Mounts']:
        check(mount.get('Source') not in source_mounts, 'copy_shares_source_mount')
        check((mount.get('Type') == 'bind' and mount.get('Source') == str(checkpoint)
               and mount.get('Destination') == '/recovery' and mount.get('RW') is False)
              or mount.get('Type') in ('volume', 'tmpfs'), 'unexpected_copy_mount')


def atomic_payload(files):
    bodies = []
    for path, expected in SQL_HASHES.items():
        raw = files[path]
        check(digest(raw) == expected, 'sql_hash_changed')
        text = raw.decode('utf-8')
        check(len(re.findall(r'^BEGIN;\s*$', text, re.M)) == 1 and len(re.findall(r'^COMMIT;\s*$', text, re.M)) == 1, 'unexpected_transaction_boundary')
        bodies.append(re.sub(r'^COMMIT;\s*$', '', re.sub(r'^BEGIN;\s*$', '', text, count=1, flags=re.M), count=1, flags=re.M))
    return 'BEGIN;\n' + '\n'.join(bodies) + '\nCOMMIT;\n'


def command(args, body=None, timeout=90):
    result = subprocess.run(args, input=body, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    check(result.returncode == 0, 'operation_failed_readback_required')
    return result.stdout.decode()


def write_exclusive(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    # Linux coordinator host: persist the directory entry as well as file bytes.
    if hasattr(os, 'O_DIRECTORY'):
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def all_passed(value, count):
    check(isinstance(value, dict) and len(value) == count and all(v is True for v in value.values()), 'verification_failed')


def validate_rehearsal(value, binding):
    check(value.get('status') == 'APPLIED' and value.get('mode') == 'copy'
          and value.get('binding') == binding and value.get('existingCatalogUnchanged') is True
          and value.get('targetStopped') is True, 'copy_rehearsal_missing')
    all_passed(value.get('checks'), 8)


def run(mode, attestation):
    import fcntl  # Operational execution is deliberately Linux-only.
    validate_attestation(attestation)
    check(mode in ('copy', 'source'), 'explicit_mode_required')
    os.umask(0o077)
    checkpoint = BACKUPS / attestation['checkpoint']
    artifacts = checkpoint / 'consultation-next-install'
    files = {path: (REPO / path).read_bytes() for path in SQL_HASHES}
    payload = atomic_payload(files)
    check(digest((REPO / 'sql/consultation_workflow.sql').read_bytes()) == BASELINE_SHA, 'baseline_hash_changed')
    check(digest(HELPER.read_bytes()) == attestation['backupHelperSha256'], 'backup_helper_hash_changed')
    binding = {'attestationSha256': digest(json.dumps(attestation, sort_keys=True).encode()), 'sqlHashes': SQL_HASHES,
               'payloadSha256': digest(payload.encode()), 'installerSha256': digest(Path(__file__).read_bytes())}

    def inspect(which):
        return json.loads(command(['docker', 'inspect', attestation[which]['id']]))[0]

    def attest_target():
        source = inspect('source')
        source_safe(source, attestation)
        if mode == 'copy':
            copy_safe(inspect('copy'), source, attestation, True)

    def query(sql):
        attest_target()
        return command(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s',
                        attestation[mode]['id'], 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql.encode())

    with (BACKUPS / '.cashflow-release.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        validate_backup((checkpoint / 'receipt.json').read_bytes(), attestation)
        source = inspect('source')
        source_safe(source, attestation)
        artifacts.mkdir(mode=0o700, exist_ok=True)
        if mode == 'source':
            validate_rehearsal(json.loads((artifacts / 'copy-result.json').read_text()), binding)
            copy_safe(inspect('copy'), source, attestation, False)
        intent = artifacts / (mode + '-intent.json')
        check(not intent.exists() and not (artifacts / (mode + '-result.json')).exists()
              and not (artifacts / (mode + '-catalog-before.json')).exists(), 'prior_attempt_requires_readback_no_replay')
        started = False
        result = {'status': 'BLOCKED', 'mode': mode, 'binding': binding,
                  'checkpoint': attestation['checkpoint'], 'sourceId': attestation['source']['id'],
                  'targetId': attestation[mode]['id'], 'automaticReplay': False,
                  'encryptedBackupVerification': 'coordinator_attestation_bound_not_DPAPI_verified_by_this_script'}
        try:
            if mode == 'copy':
                copy_safe(inspect('copy'), source, attestation, False)
                command(['docker', 'start', attestation['copy']['id']])
                started = True
                for _ in range(30):
                    ready = subprocess.run(['docker', 'exec', attestation['copy']['id'], 'pg_isready', '-U', 'postgres'], capture_output=True, timeout=5)
                    if ready.returncode == 0:
                        break
                    time.sleep(1)
                else:
                    raise RuntimeError('copy_not_ready')
                check(query('SHOW cron.launch_active_jobs;').strip() == 'off', 'copy_cron_enabled')
            all_passed(json.loads(query('BEGIN READ ONLY;' + PREFLIGHT + 'COMMIT;')), 3)
            before = json.loads(query('BEGIN READ ONLY;' + INVENTORY + 'COMMIT;'))
            write_exclusive(artifacts / (mode + '-catalog-before.json'), before)
            write_exclusive(intent, {**result, 'status': 'INTENT_RECORDED', 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
            result['status'] = 'OUTCOME_UNKNOWN_READBACK_REQUIRED'
            query(payload)  # One atomic transaction, never automatically retried.
            result['status'] = 'APPLIED_REVIEW_REQUIRED'
            after = json.loads(query('BEGIN READ ONLY;' + INVENTORY + 'COMMIT;'))
            write_exclusive(artifacts / (mode + '-catalog-after.json'), after)
            result['existingCatalogUnchanged'] = before == after
            result['catalogBeforeSha256'] = digest(json.dumps(before, sort_keys=True).encode())
            result['catalogAfterSha256'] = digest(json.dumps(after, sort_keys=True).encode())
            result['checks'] = json.loads(query('BEGIN READ ONLY;' + CHECKS + 'COMMIT;'))
            check(result['existingCatalogUnchanged'], 'existing_catalog_changed')
            all_passed(result['checks'], 8)
            if mode == 'source':
                query("NOTIFY pgrst, 'reload schema';")
                result['schemaReloadRequested'] = True  # Native API readback remains a separate gate.
            result['status'] = 'APPLIED'
        finally:
            if started:
                copy_safe(inspect('copy'), source, attestation, True)
                command(['docker', 'stop', '-t', '10', attestation['copy']['id']], timeout=30)
                copy_safe(inspect('copy'), source, attestation, False)
                result['targetStopped'] = True
            source_safe(inspect('source'), attestation)
            result['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            write_exclusive(artifacts / (mode + '-result.json'), result)
            print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attestation', required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=('copy', 'source'))
    args = parser.parse_args()
    run(args.mode, json.loads(args.attestation.read_text(encoding='utf-8')))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'verification_or_execution_failed_readback_required', 'automaticReplay': False}))
        raise SystemExit(2)

