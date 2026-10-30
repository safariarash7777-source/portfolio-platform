"""Checkpoint-specific, exact ACL correction on the owned isolated restore only."""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

STAMP = '20261024T090243Z'
ROOT = Path('/root/portfolio-recovery-backups') / STAMP
SOURCE_ID = '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
COPY_ID = 'bc513716f316d1b97b16f35c1e9b61695a92ac9e4ec18188b01605fd5b659195'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
HELPER_SHA = '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
TABLES = ('actions', 'advisors', 'command_receipts', 'events', 'private_notes',
          'publications', 'relationships', 'revocations', 'sessions')


def plan(src, dst, old_plan):
    pairs = {}
    for suffix in TABLES:
        name = 'public.consultation_' + suffix
        prefix = 'table|' + name + '|r;owner=postgres;rls=t;forced=t;acl='
        pairs[prefix + '{postgres=arwdDxtm/postgres}'] = (prefix + '-', 'GRANT ALL ON TABLE ' + name + ' TO postgres;')
    prefix = 'table|public.consultation_events_event_no_seq|S;owner=postgres;rls=f;forced=f;acl='
    pairs[prefix + '{postgres=rwU/postgres}'] = (prefix + '{anon=rwU/postgres,authenticated=rwU/postgres,postgres=rwU/postgres,service_role=rwU/postgres}', 'REVOKE ALL ON SEQUENCE public.consultation_events_event_no_seq FROM anon,authenticated,service_role;')
    pairs['schema|consultation_private|postgres;{postgres=UC/postgres}'] = ('schema|consultation_private|postgres;-', 'GRANT USAGE,CREATE ON SCHEMA consultation_private TO postgres;')
    selected = [key for key in sorted(src - dst) if key in pairs]
    if any(pairs[key][0] not in dst - src for key in selected):
        raise RuntimeError('unexpected_exact_pair')
    remaining_src = src - set(selected)
    remaining_dst = dst - {pairs[key][0] for key in selected}
    old_sql, names = old_plan(remaining_src, remaining_dst)
    body = old_sql.removeprefix('BEGIN;').removesuffix('COMMIT;')
    return 'BEGIN;\nSET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'30s\';\n' + body + '\n' + '\n'.join(pairs[key][1] for key in selected) + '\nCOMMIT;', names + [key.split('|')[1] for key in selected]


def main():
    import fcntl
    os.umask(0o077)
    helper = Path('/root/portfolio-recovery-tools/cashflow-native-reviewed.py').read_bytes()
    assert hashlib.sha256(helper).hexdigest() == HELPER_SHA
    tree = ast.parse(helper)
    scope = {'re': re}
    allowed = {'normalize_inventory', 'bounded_acl_plan', 'attest_acl_target'}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in allowed:
            exec(compile(ast.Module(body=[node], type_ignores=[]), '<reviewed-pure-helper>', 'exec'), scope)
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'INVENTORY' for t in node.targets):
            inventory = ast.literal_eval(node.value)
    normalize = scope['normalize_inventory']
    def run(args, body=None):
        p = subprocess.run(args, input=body, capture_output=True, timeout=300)
        assert p.returncode == 0, 'command_failed_readback_required'
        return p.stdout.decode()
    def inspect(identity):
        return json.loads(run(['docker', 'inspect', identity]))[0]
    def source_safe():
        state = inspect(SOURCE_ID)
        assert state['Id'] == SOURCE_ID and state['Name'] == '/portfolio-stage-db-1'
        assert state['Image'] == receipt['sourceImage'] == IMAGE and state['State']['Health']['Status'] == 'healthy'
    def copy_safe():
        state = inspect(COPY_ID)
        assert state['Id'] == COPY_ID
        scope['attest_acl_target'](state, 'portfolio-stage-db-1', receipt['target'], receipt['sourceImage'], str(ROOT))
        assert 'cron.launch_active_jobs=off' in state['Config']['Cmd']
        source_mounts = {m['Source'] for m in inspect(SOURCE_ID)['Mounts']}
        assert all(m['Source'] not in source_mounts for m in state['Mounts'])
    def query(identity, sql):
        source_safe()
        if identity == COPY_ID:
            copy_safe()
        else:
            assert identity == SOURCE_ID and sql.startswith('BEGIN READ ONLY;')
        return run(['docker', 'exec', '-i', identity, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql.encode())
    def save_new(name, value):
        with (ROOT / name).open('x', encoding='utf-8') as f:
            f.write(value)
            f.flush()
            os.fsync(f.fileno())
    with (ROOT.parent / '.cashflow-release.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = (ROOT / 'receipt.json').read_text()
        receipt = json.loads(raw)
        assert receipt['status'] == 'failed' and receipt['startedAt'] == STAMP and receipt['sourceContainerId'] == SOURCE_ID
        source_safe()
        state = inspect(COPY_ID)
        assert state['State']['Running'] is False and state['Name'] == '/' + receipt['target']
        assert state['Image'] == IMAGE and state['HostConfig']['NetworkMode'] == 'none'
        assert not state['HostConfig'].get('PortBindings') and 'cron.launch_active_jobs=off' in state['Config']['Cmd']
        assert state['Config'].get('Labels', {}).get('portfolio.recovery') == 'isolated-proof'
        source_mounts = {m['Source'] for m in inspect(SOURCE_ID)['Mounts']}
        assert all(m['Source'] not in source_mounts for m in state['Mounts'])
        assert any(m['Type'] == 'bind' and m['Source'] == str(ROOT) and m['Destination'] == '/recovery' and m['RW'] is False for m in state['Mounts'])
        save_new('receipt-before-next-reconciliation.json', raw)
        run(['docker', 'start', COPY_ID])
        try:
            for _ in range(30):
                ready = subprocess.run(['docker', 'exec', COPY_ID, 'pg_isready', '-U', 'postgres'], capture_output=True, timeout=5)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('copy_not_ready')
            copy_safe()
            assert query(COPY_ID, 'SHOW cron.launch_active_jobs;').strip() == 'off'
            src = normalize((ROOT / 'source-inventory.private').read_text())
            before = query(COPY_ID, 'BEGIN READ ONLY;' + inventory + 'COMMIT;')
            assert normalize(before) == normalize((ROOT / 'target-inventory.private').read_text())
            # The historical inventory omitted this namespace. Compare it explicitly,
            # read-only on the source, and again after correction; do not hide that limit.
            extra = inventory.replace("'public','auth','storage','identity_private','cash_flow_private','goals_private'", "'consultation_private'")
            extra = '\n'.join(line for line in extra.splitlines() if not line.startswith("SELECT 'identity-ids|") and not line.startswith("SELECT format('extension|"))
            source_extra = query(SOURCE_ID, 'BEGIN READ ONLY;' + extra + 'COMMIT;')
            copy_extra = query(COPY_ID, 'BEGIN READ ONLY;' + extra + 'COMMIT;')
            assert any(line.startswith('schema|consultation_private|postgres;') for line in normalize(source_extra)), 'missing_source_schema'
            assert any(line.startswith('function|consultation_private.') for line in normalize(source_extra)), 'missing_source_functions'
            assert any(line.startswith('schema|consultation_private|postgres;') for line in normalize(copy_extra)), 'missing_target_schema'
            assert any(line.startswith('function|consultation_private.') for line in normalize(copy_extra)), 'missing_target_functions'
            save_new('source-consultation-supplement.private', source_extra)
            save_new('target-before-consultation-supplement.private', copy_extra)
            sql, names = plan(src | normalize(source_extra), normalize(before) | normalize(copy_extra), scope['bounded_acl_plan'])
            assert len(names) in (17, 18), 'unexpected_correction_count'
            save_new('next-reconciliation-intent.json', json.dumps({'sourceSqlMutation': False, 'targetId': COPY_ID, 'objects': names, 'sqlSha256': hashlib.sha256(sql.encode()).hexdigest()}))
            query(COPY_ID, sql)
            after = query(COPY_ID, 'BEGIN READ ONLY;' + inventory + 'COMMIT;')
            after_extra = query(COPY_ID, 'BEGIN READ ONLY;' + extra + 'COMMIT;')
            assert normalize(source_extra) == normalize(query(SOURCE_ID, 'BEGIN READ ONLY;' + extra + 'COMMIT;')), 'source_supplement_drift'
            assert src == normalize(after) and normalize(source_extra) == normalize(after_extra), 'comparison_failed'
            save_new('target-inventory-before-next-reconciliation.private', before)
            (ROOT / 'target-inventory.private').write_text(after)
            save_new('target-consultation-supplement.private', after_extra)
            (ROOT / 'comparison.private.json').write_text(json.dumps({'sourceOnly': [], 'targetOnly': []}))
            receipt.update(status='passed', comparisonEqual=True, mismatchCounts={'sourceOnly': 0, 'targetOnly': 0}, inventoryLines={'source': len(src), 'target': len(normalize(after))}, sourceContainerUnchanged=True, sourceHealthyAfter=True)
            receipt['aclCorrection'] = {'policy': 'observed-exact-consultation-acls-20261024', 'objects': names, 'objectCount': len(names), 'sourceSqlMutation': False, 'status': 'verified', 'initialAttempt': 'failed_preserved', 'consultationSupplementEqual': True, 'supplementLines': len(normalize(source_extra)), 'supplementComparedTo': 'current_source_read_only_before_and_after_not_original_snapshot'}
            for section in ('rowcount', 'identity-ids', 'policy', 'table', 'function', 'defaultacl', 'extension'):
                receipt[section + 'Equal'] = True
        finally:
            run(['docker', 'stop', '-t', '10', COPY_ID])
            assert inspect(COPY_ID)['State']['Running'] is False
            source_safe()
        receipt['targetStopped'] = True
        receipt['reconciledAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (ROOT / 'receipt.json').write_text(json.dumps(receipt, indent=2))
        print(json.dumps(receipt))


if __name__ == '__main__':
    main()
