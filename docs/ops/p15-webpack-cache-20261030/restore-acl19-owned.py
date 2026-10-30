"""Reconcile only the observed 19 ACLs on one attested, offline restore copy.

The pinned backup helper, failed receipts, dump and primary remain unchanged.
Caller supplies reviewed planner and wrapper source in memory, with their hashes.
An existing intent permits readback only. Never rerun the dump/restore helper.
"""
import ast
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
ROOT = BASE / '20261030T215307Z'
OP = ROOT / 'acl19-reconciliation-20261031'
OLD_OP = BASE / 'v04-fresh-checkpoint-20261030'
TARGET = 'portfolio-recovery-proof-20261030t215307z'
TARGET_ID = '833a8447c01570811d6a0ad50cafee00745614b811ef9668acb0d944e04b21f1'
SOURCE = 'portfolio-stage-db-1'
SOURCE_ID = '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
HELPER = Path('/root/portfolio-recovery-tools/cashflow-native-reviewed.py')
HELPER_SHA = '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
MIN_DISK = 10 * 1024**3 + 2378622379 + 32 * 1024**2


def check(value, code):
    if not value:
        raise RuntimeError(code)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def save(name, data):
    with (OP / name).open('x', encoding='utf-8') as f:
        os.chmod(OP / name, 0o600)
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(OP, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def docker(args, data=None, timeout=60):
    p = subprocess.run(['docker', *args], input=data, capture_output=True, text=True, timeout=timeout)
    check(p.returncode == 0, 'docker_or_sql_failed')
    return p.stdout


def inspect(name):
    return json.loads(docker(['inspect', name]))[0]


def sql(name, query):
    check(name in (SOURCE, TARGET), 'unexpected_database_target')
    if name == SOURCE:
        check(query.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'), 'primary_write_forbidden')
    return docker(['exec', '-i', name, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
                   '-v', 'ON_ERROR_STOP=1'], query)


def attest(state, running):
    check(state['Id'] == TARGET_ID and state['Id'] != SOURCE_ID, 'target_identity_drift')
    check(state['Name'] == '/' + TARGET and state['Image'] == IMAGE, 'target_image_name_drift')
    check(state['State']['Running'] is running, 'unexpected_target_state')
    check(state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig'].get('PortBindings'), 'target_not_offline')
    check(state['Config']['Labels'].get('portfolio.recovery') == 'isolated-proof', 'target_owner_drift')
    check(any(m['Type'] == 'bind' and m['Source'] == str(ROOT) and m['Destination'] == '/recovery'
              and m['RW'] is False for m in state['Mounts']), 'target_backup_mount_drift')


def readback():
    return {'mode': 'readback_only', 'at': now(),
            'receipts': {p.name: json.loads(p.read_text()) for p in OP.glob('*.json')},
            'targetStopped': not inspect(TARGET)['State']['Running']}


def run():
    os.umask(0o077)
    os.nice(15)
    if (OP / 'intent.json').exists() or globals().get('_readback_only'):
        return readback()
    check(ROOT.resolve(strict=True) == ROOT and not ROOT.is_symlink(), 'checkpoint_path_drift')
    with (BASE / '.cashflow-release.lock').open('rb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(not OP.exists(), 'operation_exists_requires_readback')
        check(os.statvfs('/').f_bavail * os.statvfs('/').f_frsize >= MIN_DISK, 'disk_reserve')
        available = int(next(l for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')).split()[1]) * 1024
        check(available >= 4 * 1024**3, 'memory_reserve')
        helper = HELPER.read_bytes()
        check(digest(helper) == HELPER_SHA, 'pinned_helper_changed')
        tree = ast.parse(helper)
        nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef)
                 and n.name in ('normalize_inventory', 'bounded_acl_plan', 'attest_acl_target')]
        nodes += [n for n in tree.body if isinstance(n, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == 'INVENTORY' for t in n.targets)]
        old = {'re': re}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned-pure-helper>', 'exec'), old)
        check(digest(_reviewed_plan_source.encode()) == _reviewed_plan_sha256, 'plan_source_drift')
        check(digest(_reviewed_wrapper_source.encode()) == 'ebc7bb7733a5452392db2025d5973d15a6d1e372011103709cbc9a02938a05ec', 'private_query_source_drift')
        plans = {}
        exec(compile(_reviewed_plan_source, '<reviewed-acl19-plan>', 'exec'), plans)
        wrapper = {'__name__': 'read_only_private_inventory'}
        exec(compile(_reviewed_wrapper_source, '<reviewed-wrapper>', 'exec'), wrapper)
        original = (ROOT / 'receipt.json').read_bytes()
        failed = json.loads(original)
        check(failed['status'] == 'failed' and failed['targetStopped'] is True
              and failed['target'] == TARGET and failed['sourceContainerId'] == SOURCE_ID
              and failed['dumpBytes'] == 2406546295
              and failed['dumpSha256'] == '87434f8c53cca9910cdbd953415ffed5e01d3aacb0db8c0702a4e164253c8c17', 'original_failure_changed')
        old_result = (OLD_OP / 'result.json').read_bytes()
        check(json.loads(old_result)['status'] == 'not_accepted', 'old_wrapper_receipt_changed')
        source_state = inspect(SOURCE)
        check(source_state['Id'] == SOURCE_ID and source_state['Image'] == IMAGE
              and source_state['State']['Health']['Status'] == 'healthy', 'source_identity_health')
        attest(inspect(TARGET), False)
        normalize = old['normalize_inventory']
        expected = normalize((ROOT / 'source-inventory.private').read_text())
        query = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' + old['INVENTORY'] + '\nCOMMIT;'
        live_before = plans['live_source_catalog_check'](expected, normalize(sql(SOURCE, query)))
        private_before = json.loads((OLD_OP / 'private-before.json').read_text())
        check(wrapper['private_inventory'](SOURCE) == private_before, 'private_source_changed_since_snapshot')
        OP.mkdir(mode=0o700)
        save('intent.json', {'at': now(), 'target': TARGET, 'targetId': TARGET_ID, 'sourceId': SOURCE_ID,
                            'helperSha256': HELPER_SHA, 'planSha256': _reviewed_plan_sha256,
                            'runnerSha256': _reviewed_runner_sha256, 'sourceSqlWrites': False,
                            'originalReceiptSha256': digest(original)})
        result = {'at': now(), 'status': 'not_accepted', 'target': TARGET, 'targetId': TARGET_ID,
                  'sourceSqlWrites': False, 'helperReplaced': False, 'originalFailurePreserved': False,
                  'checkpoint': ROOT.name, 'dumpSha256': failed['dumpSha256']}
        started = False
        try:
            docker(['start', TARGET]); started = True
            for _ in range(45):
                p = subprocess.run(['docker', 'exec', TARGET, 'pg_isready', '-U', 'postgres', '-d', 'postgres'], capture_output=True, timeout=5)
                if p.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('owned_target_not_ready')
            attest(inspect(TARGET), True)
            old['attest_acl_target'](inspect(TARGET), SOURCE, TARGET, IMAGE, str(ROOT))
            check(docker(['exec', TARGET, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-c', 'SHOW cron.launch_active_jobs;']).strip() == 'off', 'target_cron_not_off')
            before = normalize(sql(TARGET, query))
            private_target = wrapper['private_inventory'](TARGET)
            correction, names = plans['observed_plan'](old['bounded_acl_plan'], expected, before, private_before, private_target)
            check(digest(correction.encode()) == _reviewed_sql_sha256, 'sql_differs_from_offline_review')
            save('plan.json', {'at': now(), 'objects': names, 'objectCount': len(names),
                               'sqlSha256': _reviewed_sql_sha256, 'beforeMismatchCounts': {'sourceOnly': len(expected-before), 'targetOnly': len(before-expected)}})
            attest(inspect(TARGET), True)
            sql(TARGET, correction)
            after_text = sql(TARGET, query)
            after = normalize(after_text)
            save('strict-core-comparison.json', {'equal': after == expected, 'sourceLines': len(expected),
                                                'targetLines': len(after), 'sourceOnly': sorted(expected-after), 'targetOnly': sorted(after-expected)})
            check(after == expected, 'strict_core_comparison_failed')
            private_restored = wrapper['private_inventory'](TARGET)
            save('strict-private-comparison.json', {'equal': private_restored == private_before,
                                                    'functions': len(private_restored['functions']), 'schemas': len(private_restored['schemas']),
                                                    'relations': private_restored['relations']})
            check(private_restored == private_before, 'strict_private_comparison_failed')
            live_after = plans['live_source_catalog_check'](expected, normalize(sql(SOURCE, query)))
            check(wrapper['private_inventory'](SOURCE) == private_before, 'private_source_changed_during_reconciliation')
            check((ROOT / 'receipt.json').read_bytes() == original and (OLD_OP / 'result.json').read_bytes() == old_result, 'original_receipt_mutated')
            result.update({'status': 'PASS_OWNED_COPY_ACL19_RECONCILIATION', 'objectCount': len(names),
                           'strictCoreEqual': True, 'strictPrivateEqual': True, 'privateFunctions': len(private_restored['functions']),
                           'sourceCatalogUnchanged': True, 'sourceDataFrozen': False,
                           'liveSourceRowCountDriftBefore': live_before, 'liveSourceRowCountDriftAfter': live_after,
                           'network': 'none', 'portsPublished': False, 'cronEnabled': False,
                           'originalFailurePreserved': True,
                           'originalReceiptSha256': digest(original), 'sqlSha256': _reviewed_sql_sha256})
        except Exception as e:
            result.update({'status': 'not_accepted', 'failureClass': type(e).__name__, 'failureCode': str(e)[:160]})
        finally:
            if started:
                check(inspect(TARGET)['Id'] == TARGET_ID, 'cleanup_target_identity_changed')
                docker(['stop', '-t', '10', TARGET], timeout=30)
            result['targetStopped'] = not inspect(TARGET)['State']['Running']
            source_after = inspect(SOURCE)
            result['sourceIdentityUnchanged'] = source_after['Id'] == SOURCE_ID and source_after['Image'] == IMAGE
            result['sourceHealthyAfter'] = source_after['State']['Health']['Status'] == 'healthy'
            result['availableBytesAfter'] = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
            result['materializationAndTenGiBReserveAfter'] = result['availableBytesAfter'] >= MIN_DISK
            if not all((result['targetStopped'], result['sourceIdentityUnchanged'], result['sourceHealthyAfter'], result['materializationAndTenGiBReserveAfter'])):
                result['status'] = 'not_accepted'
            result['finishedAt'] = now()
            save('result.json', result)
        return readback()


if __name__ == '__main__':
    print(json.dumps(run()))
