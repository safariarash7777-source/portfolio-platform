"""Call the existing pinned backup helper, add read-only private-schema checks.

No primary SQL write or helper replacement. The only extra Docker start/stop is
the newly created, attested, network-none proof container owned by this operation.
Existing historical checkpoints and services are never mutated.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

BASE = Path('/root/portfolio-recovery-backups')
OP = BASE / 'v04-fresh-checkpoint-20261030'
HELPER = Path('/root/portfolio-recovery-tools/cashflow-native-reviewed.py')
HELPER_SHA = '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
SOURCE = 'portfolio-stage-db-1'
PRIVATE_SQL = """
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),
 'acl',CASE WHEN n.nspacl IS NULL THEN NULL ELSE ARRAY(SELECT x::text FROM unnest(n.nspacl) x ORDER BY x::text) END,
 'effectiveRolePrivileges',(SELECT jsonb_object_agg(r,jsonb_build_object('usage',has_schema_privilege(r,n.oid,'USAGE'),'create',has_schema_privilege(r,n.oid,'CREATE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r)) ORDER BY n.nspname)
 FROM pg_namespace n WHERE n.nspname IN('consultation_private','portfolio_private','portfolio_scope_private')),
 'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('consultation_private','portfolio_private','portfolio_scope_private')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
 'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),
 'acl',CASE WHEN p.proacl IS NULL THEN NULL ELSE ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text) END,
 'definitionMd5',md5(pg_get_functiondef(p.oid)), 'securityDefiner',p.prosecdef,'proconfig',p.proconfig,
 'effectiveRoleExecute',(SELECT jsonb_object_agg(r,has_function_privilege(r,p.oid,'EXECUTE')) FROM unnest(ARRAY['anon','authenticated','service_role']) r),
 'dependencies',(SELECT coalesce(jsonb_agg(jsonb_build_object('object',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'kind',d.deptype) ORDER BY pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),d.deptype),'[]'::jsonb) FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('consultation_private','portfolio_private','portfolio_scope_private') AND p.prokind IN('f','p')),
 'defaultAcls',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'role',pg_get_userbyid(d.defaclrole),
 'kind',d.defaclobjtype,'acl',ARRAY(SELECT x::text FROM unnest(d.defaclacl) x ORDER BY x::text)) ORDER BY n.nspname,d.defaclrole,d.defaclobjtype),'[]'::jsonb)
 FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE n.nspname IN('consultation_private','portfolio_private','portfolio_scope_private')));
COMMIT;
"""


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def check(condition, code):
    if not condition:
        raise RuntimeError(code)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value, exclusive=False):
    path = OP / name
    with path.open('x' if exclusive else 'w', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(OP, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def docker(args, input=None, timeout=30):
    r = subprocess.run(['docker', *args], input=input, text=True, capture_output=True, timeout=timeout)
    check(r.returncode == 0, 'docker_read_or_owned_proof_operation_failed')
    return r.stdout


def inspect(name):
    return json.loads(docker(['inspect', name]))[0]


def private_inventory(name):
    value = json.loads(docker(['exec', '-i', name, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
                               '-v', 'ON_ERROR_STOP=1'], PRIVATE_SQL))
    check(value['relations'] == 0 and len(value['schemas'] or []) == 3, 'private_schema_scope_drift')
    return value


def proof_safe(state, receipt):
    check(state['Id'] == receipt['targetContainerId'], 'proof_container_changed')
    check(state['Id'] != receipt['sourceContainerId'], 'proof_is_source')
    check(state['Name'] == '/' + receipt['target'] and state['Image'] == IMAGE, 'proof_identity_changed')
    check(state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig'].get('PortBindings'), 'proof_network_changed')
    check(state['Config']['Labels'].get('portfolio.recovery') == 'isolated-proof', 'proof_ownership_changed')
    check(any(m['Source'] == receipt['privateDirectory'] and m['Destination'] == '/recovery' and not m['RW']
              for m in state['Mounts']), 'proof_mount_changed')


def readback():
    return {'at': now(), 'mode': 'readback_only',
            'receipts': {p.name: json.loads(p.read_text()) for p in sorted(OP.glob('*.json'))},
            'availableBytes': os.statvfs('/').f_bavail * os.statvfs('/').f_frsize}


def run():
    os.umask(0o077)
    os.nice(15)
    if (OP / 'intent.json').exists():
        return readback()
    OP.mkdir(mode=0o700, exist_ok=True)
    check(OP.resolve(strict=True) == OP and not OP.is_symlink(), 'operation_path_changed')
    with (BASE / '.cashflow-release.lock').open('rb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(not (OP / 'intent.json').exists(), 'operation_already_started')
        helper_bytes = HELPER.read_bytes()
        check(hashlib.sha256(helper_bytes).hexdigest() == HELPER_SHA, 'backup_helper_drift')
        free = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
        # Includes a full old-archive raw materialization alongside the new dump
        # and retained proof, in addition to the unchanged ten-GiB guard.
        check(free >= int(17.25 * 1024 ** 3), 'backup_restore_and_materializer_peak_disk_budget')
        available = int(next(l for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')).split()[1]) * 1024
        check(available >= 4 * 1024 ** 3, 'backup_restore_memory_budget')
        source = inspect(SOURCE)
        check(source['Image'] == IMAGE and source['State']['Health']['Status'] == 'healthy', 'source_identity_health')
        before = private_inventory(SOURCE)
        save('private-before.json', before, True)
        save('intent.json', {'at': now(), 'helperSha256': HELPER_SHA, 'sourceContainerId': source['Id'],
                            'sourceImage': IMAGE, 'availableBytesBefore': free, 'sourcePrivateFunctions': len(before['functions']),
                            'existingCheckpointDirectoriesBefore': sorted(p.name for p in BASE.iterdir() if p.is_dir())}, True)
        proof = None
        started = False
        result = {'at': now(), 'status': 'started', 'primarySqlWrites': False, 'helperReplaced': False}
        try:
            # Helper makes its own durable checkpoint receipt, consistent snapshot,
            # full pg_dump/globals/cron and strict core comparison. No new backup engine.
            r = subprocess.run(['python3', '-'], input=helper_bytes.decode('utf-8'),
                               capture_output=True, text=True, timeout=1800)
            check(r.returncode == 0, 'existing_backup_helper_transport_failure')
            native = json.loads(r.stdout)
            save('native-receipt.json', native, True)
            check(native['status'] == 'passed' and native['comparisonEqual'] is True
                  and native['mismatchCounts'] == {'sourceOnly': 0, 'targetOnly': 0}
                  and native['sourceContainerId'] == source['Id'] and native['sourceImage'] == IMAGE
                  and native['sourceContainerUnchanged'] and native['sourceHealthyAfter']
                  and native['targetStopped'] and native['network'] == 'none'
                  and not native['portsPublished'] and not native['cronEnabledOnTarget'], 'native_checkpoint_not_accepted')
            check(re.fullmatch(r'\d{8}T\d{6}Z', native['startedAt']) is not None, 'checkpoint_stamp')
            check(native['privateDirectory'] == str(BASE / native['startedAt'])
                  and native['target'] == 'portfolio-recovery-proof-' + native['startedAt'].lower(), 'checkpoint_paths')
            after = private_inventory(SOURCE)
            save('private-source-after.json', after, True)
            check(before == after, 'private_source_drift_during_backup')
            proof = dict(native)
            proof['targetContainerId'] = inspect(native['target'])['Id']
            save('proof-identity.json', {'target': proof['target'], 'id': proof['targetContainerId'],
                                         'image': IMAGE, 'checkpoint': native['startedAt']}, True)
            proof_safe(inspect(proof['target']), proof)
            check(not inspect(proof['target'])['State']['Running'], 'new_proof_unexpected_running')
            docker(['start', proof['target']])
            started = True
            for _ in range(60):
                ready = subprocess.run(['docker', 'exec', proof['target'], 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
                                       capture_output=True, timeout=5)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('owned_proof_readiness')
            proof_safe(inspect(proof['target']), proof)
            cron = docker(['exec', proof['target'], 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
                           '-c', 'SHOW cron.launch_active_jobs;']).strip()
            check(cron == 'off', 'owned_proof_cron_not_disabled')
            restored = private_inventory(proof['target'])
            save('private-restored.json', restored, True)
            check(private_inventory(SOURCE) == before, 'private_source_changed_after_restore')
            check(restored == before, 'private_restore_comparison_failed')
            result.update({'status': 'passed', 'checkpoint': native['startedAt'], 'nativeCoreEqual': True,
                           'privateSchemaEqual': True, 'privateFunctions': len(before['functions']),
                           'sourceUnchangedDuringSupplement': True})
        except Exception as error:
            result.update({'status': 'not_accepted', 'failureClass': type(error).__name__, 'failureCode': str(error)[:120]})
        finally:
            if started and proof:
                try:
                    proof_safe(inspect(proof['target']), proof)
                    docker(['stop', '-t', '10', proof['target']], timeout=30)
                    result['ownedProofStopped'] = not inspect(proof['target'])['State']['Running']
                except Exception:
                    result.update({'status': 'not_accepted', 'failureCode': 'owned_proof_cleanup_requires_readback'})
            current = inspect(SOURCE)
            result['sourceIdentityUnchanged'] = current['Id'] == source['Id'] and current['Image'] == IMAGE
            result['sourceHealthyAfter'] = current['State']['Health']['Status'] == 'healthy'
            result['availableBytesAfter'] = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
            result['tenGiBGuardAfter'] = result['availableBytesAfter'] >= 10 * 1024 ** 3
            result['oldArchiveMaterializationBudgetAfter'] = result['availableBytesAfter'] >= 10 * 1024 ** 3 + 2378622379 + 32 * 1024 ** 2
            if not all((result['sourceIdentityUnchanged'], result['sourceHealthyAfter'],
                        result['tenGiBGuardAfter'], result['oldArchiveMaterializationBudgetAfter'])):
                result.update({'status': 'not_accepted', 'failureCode': 'final_identity_health_or_recovery_capacity'})
            result['finishedAt'] = now()
            save('result.json', result, True)
        return readback()


if __name__ == '__main__':
    print(json.dumps(run()))
