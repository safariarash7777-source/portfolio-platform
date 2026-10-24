"""Pure safety tests. Docker, processes and operational files are always mocked."""
import contextlib
import copy
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('next_installer', Path(__file__).with_name('install-native.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def attestation():
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    return {'contractVersion': 'consultation-next-install.v1', 'checkpoint': stamp,
            'checkpointReceiptSha256': 'a' * 64, 'backupHelperSha256': 'b' * 64,
            'source': {'name': 'portfolio-stage-db-1', 'id': 'c' * 64, 'image': 'sha256:' + 'd' * 64},
            'copy': {'name': 'portfolio-recovery-proof-' + stamp.lower(), 'id': 'e' * 64},
            'encryptedBackupVerification': {'status': 'VERIFIED_BY_COORDINATOR', 'receiptSha256': 'f' * 64, 'checkpointReceiptSha256': 'a' * 64}}


def states(a):
    source = {'Name': '/' + a['source']['name'], 'Id': a['source']['id'], 'Image': a['source']['image'],
              'State': {'Running': True, 'Health': {'Status': 'healthy'}}, 'Mounts': [{'Source': '/source-volume'}]}
    target = {'Name': '/' + a['copy']['name'], 'Id': a['copy']['id'], 'Image': a['source']['image'],
              'State': {'Running': False}, 'HostConfig': {'NetworkMode': 'none', 'PortBindings': {}},
              'NetworkSettings': {'Ports': {'5432/tcp': None}},
              'Config': {'Labels': {'portfolio.recovery': 'isolated-proof'}, 'Cmd': ['postgres', '-c', 'cron.launch_active_jobs=off']},
              'Mounts': [{'Type': 'bind', 'Source': str(m.BACKUPS / a['checkpoint']), 'Destination': '/recovery', 'RW': False},
                         {'Type': 'volume', 'Source': '/copy-volume', 'Destination': '/var/lib/postgresql/data', 'RW': True}]}
    return source, target


class SafetyTests(unittest.TestCase):
    def test_exact_fresh_attestation(self):
        a = attestation()
        self.assertEqual(m.validate_attestation(a), a)

    def test_missing_stale_future_traversal_and_unbound_inputs(self):
        for edit in [lambda a: a.pop('copy'), lambda a: a.update(extra=True),
                     lambda a: a.update(checkpoint='../elsewhere'),
                     lambda a: a.update(checkpoint='20000101T000000Z'),
                     lambda a: a.update(checkpoint='29990101T000000Z'),
                     lambda a: a['copy'].update(id=a['source']['id']),
                     lambda a: a['source'].update(name='other-db'),
                     lambda a: a['encryptedBackupVerification'].update(checkpointReceiptSha256='0' * 64),
                     lambda a: a['encryptedBackupVerification'].update(status='PENDING')]:
            a = attestation()
            edit(a)
            with self.assertRaises(RuntimeError):
                m.validate_attestation(a)

    def test_source_exact_identity_health(self):
        a = attestation()
        source, _ = states(a)
        m.source_safe(source, a)
        for edit in [lambda s: s.update(Id='0' * 64), lambda s: s.update(Name='/other'), lambda s: s['State'].update(Running=False), lambda s: s['State']['Health'].update(Status='unhealthy')]:
            changed = copy.deepcopy(source)
            edit(changed)
            with self.assertRaises(RuntimeError):
                m.source_safe(changed, a)

    def test_copy_isolation_and_exact_id(self):
        a = attestation()
        source, target = states(a)
        m.copy_safe(target, source, a, False)
        for edit in [lambda t: t.update(Id='0' * 64), lambda t: t['HostConfig'].update(NetworkMode='bridge'),
                     lambda t: t['Mounts'][0].update(RW=True), lambda t: t['Mounts'][1].update(Source='/source-volume'),
                     lambda t: t['Config'].update(Cmd=['postgres']), lambda t: t['State'].update(Running=True),
                     lambda t: t['NetworkSettings'].update(Ports={'5432/tcp': [{'HostPort': '5432'}]})]:
            changed = copy.deepcopy(target)
            edit(changed)
            with self.assertRaises(RuntimeError):
                m.copy_safe(changed, source, a, False)

    def test_both_pinned_migrations_one_transaction_baseline_not_replayed(self):
        files = {p: (m.REPO / p).read_bytes() for p in m.SQL_HASHES}
        sql = m.atomic_payload(files)
        self.assertEqual(len(m.re.findall(r'^BEGIN;\s*$', sql, m.re.M)), 1)
        self.assertEqual(len(m.re.findall(r'^COMMIT;\s*$', sql, m.re.M)), 1)
        self.assertNotIn('CREATE SCHEMA consultation_private', sql)
        self.assertIn('CREATE FUNCTION public.load_consultation_roster', sql)
        self.assertIn('CREATE TABLE public.consultation_reply_versions', sql)
        files[next(iter(files))] += b'-- drift'
        with self.assertRaisesRegex(RuntimeError, 'sql_hash_changed'):
            m.atomic_payload(files)

    def test_inventory_does_not_hide_baseline_namespace_or_functions(self):
        self.assertNotIn("LIKE 'consultation_%'", m.INVENTORY)
        self.assertNotIn("('information_schema','consultation_private')", m.INVENTORY)
        self.assertNotIn("'load_consultation','command_consultation'", m.INVENTORY)
        for key in ('columns', 'functions', 'constraints', 'triggers', 'policies', 'indexes', 'defaultAcl'):
            self.assertIn("'" + key + "'", m.INVENTORY)

    def test_rehearsal_bound_to_exact_bytes_not_any_pass_receipt(self):
        binding = {'synthetic': 'value'}
        valid = {'status': 'APPLIED', 'mode': 'copy', 'binding': binding, 'existingCatalogUnchanged': True, 'targetStopped': True, 'checks': {str(i): True for i in range(8)}}
        m.validate_rehearsal(valid, binding)
        for field, value in [('status', 'APPLIED_REVIEW_REQUIRED'), ('binding', {}), ('targetStopped', False), ('checks', {}), ('mode', 'source')]:
            with self.assertRaises(RuntimeError):
                m.validate_rehearsal({**valid, field: value}, binding)

    def test_exclusive_receipt_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'intent.json'
            m.write_exclusive(file, {'value': 1})
            with self.assertRaises(FileExistsError):
                m.write_exclusive(file, {'value': 2})
            self.assertEqual(json.loads(file.read_text()), {'value': 1})


class MockExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.a = attestation()
        self.helper = root / 'helper.py'
        self.helper.write_bytes(b'synthetic reviewed helper; never executed')
        self.a['backupHelperSha256'] = m.digest(self.helper.read_bytes())
        self.proof = {'status': 'passed', 'comparisonEqual': True, 'targetStopped': True, 'sourceContainerUnchanged': True,
                      'sourceHealthyAfter': True, 'startedAt': self.a['checkpoint'], 'source': self.a['source']['name'],
                      'sourceContainerId': self.a['source']['id'], 'sourceImage': self.a['source']['image'],
                      'target': self.a['copy']['name'], 'network': 'none', 'portsPublished': False,
                      'cronEnabledOnTarget': False, 'mismatchCounts': {'sourceOnly': 0, 'targetOnly': 0}}
        self.checkpoint = root / self.a['checkpoint']
        self.checkpoint.mkdir()
        raw = json.dumps(self.proof).encode()
        (self.checkpoint / 'receipt.json').write_bytes(raw)
        self.a['checkpointReceiptSha256'] = m.digest(raw)
        self.a['encryptedBackupVerification']['checkpointReceiptSha256'] = m.digest(raw)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m, 'BACKUPS', root))
        self.stack.enter_context(patch.object(m, 'HELPER', self.helper))
        self.stack.enter_context(patch.dict('sys.modules', {'fcntl': types.SimpleNamespace(LOCK_EX=1, LOCK_NB=2, flock=lambda *a: None)}))
        self.stack.enter_context(patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)))
        self.source, self.target = states(self.a)
        self.ddl = []
        self.fail_write = False
        self.catalog_reads = 0
        self.drift = False
        self.notifies = 0
        self.stack.enter_context(patch.object(m, 'command', side_effect=self.command))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def command(self, args, body=None, timeout=90):
        if args[:2] == ['docker', 'inspect']:
            return json.dumps([self.source if args[2] == self.a['source']['id'] else self.target])
        if args[:2] == ['docker', 'start']:
            self.target['State']['Running'] = True
            return ''
        if args[:2] == ['docker', 'stop']:
            self.target['State']['Running'] = False
            return ''
        sql = body.decode()
        if sql.startswith('SHOW '):
            return 'off'
        if m.PREFLIGHT in sql:
            return json.dumps({str(i): True for i in range(3)})
        if m.INVENTORY in sql:
            self.catalog_reads += 1
            return json.dumps({'baseline': 'changed' if self.drift and self.catalog_reads % 2 == 0 else 'same'})
        if m.CHECKS in sql:
            return json.dumps({str(i): True for i in range(8)})
        if sql.startswith('NOTIFY '):
            self.notifies += 1
            return ''
        self.assertTrue((self.checkpoint / 'consultation-next-install' / ('copy-intent.json' if self.target['State']['Running'] else 'source-intent.json')).exists())
        self.ddl.append(sql)
        if self.fail_write:
            raise TimeoutError('synthetic lost response')
        return ''

    def test_copy_then_source_exact_binding_and_schema_reload(self):
        m.run('copy', self.a)
        self.assertFalse(self.target['State']['Running'])
        m.run('source', self.a)
        self.assertEqual(len(self.ddl), 2)
        self.assertEqual(self.ddl[0], self.ddl[1])
        self.assertEqual(self.notifies, 1)

    def test_source_cannot_run_before_rehearsal(self):
        with self.assertRaises(FileNotFoundError):
            m.run('source', self.a)
        self.assertEqual(self.ddl, [])

    def test_lost_response_keeps_intent_and_prevents_replay(self):
        self.fail_write = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a)
        result = json.loads((self.checkpoint / 'consultation-next-install/copy-result.json').read_text())
        self.assertEqual(result['status'], 'OUTCOME_UNKNOWN_READBACK_REQUIRED')
        self.assertTrue(result['targetStopped'])
        with self.assertRaisesRegex(RuntimeError, 'prior_attempt'):
            m.run('copy', self.a)
        self.assertEqual(len(self.ddl), 1)

    def test_existing_catalog_drift_blocks_source_rehearsal_acceptance(self):
        self.drift = True
        with self.assertRaisesRegex(RuntimeError, 'existing_catalog_changed'):
            m.run('copy', self.a)
        with self.assertRaisesRegex(RuntimeError, 'copy_rehearsal_missing'):
            m.run('source', self.a)
        self.assertEqual(len(self.ddl), 1)

    def test_changed_checkpoint_receipt_never_executes(self):
        (self.checkpoint / 'receipt.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'checkpoint_receipt_changed'):
            m.run('copy', self.a)
        self.assertEqual(self.ddl, [])


if __name__ == '__main__':
    unittest.main()
