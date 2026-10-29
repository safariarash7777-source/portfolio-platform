"""No operational files/targets: transport and backup evidence are synthetic."""
import contextlib
import copy
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('feedback_adapter', Path(__file__).with_name('install-feedback.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='start-a-adapter-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        # Materialize exact reviewed Git bytes ONLY for the mocked test module.
        helper = root / 'repo/scripts/testing/consultation-next/install-native.py'
        helper.parent.mkdir(parents=True)
        raw = (ROOT/'scripts/testing/consultation-next/install-native.py').read_bytes()
        import hashlib
        if hashlib.sha256(raw).hexdigest() != m.SAFETY_SHA:
            raw = subprocess.check_output(['git', 'show', 'HEAD:scripts/testing/consultation-next/install-native.py'], cwd=ROOT)
        helper.write_bytes(raw)
        self.s = m.load_safety(helper)
        self.s.BACKUPS = root
        self.s.HELPER = root / 'reviewed-backup-helper.py'
        self.s.HELPER.write_bytes(b'synthetic helper; not executable')
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        self.a = {'contractVersion': 'consultation-next-install.v1', 'checkpoint': stamp,
                  'checkpointReceiptSha256': 'a'*64, 'backupHelperSha256': self.s.digest(self.s.HELPER.read_bytes()),
                  'source': {'name': 'portfolio-stage-db-1', 'id': 'b'*64, 'image': 'sha256:'+'c'*64},
                  'copy': {'name': 'portfolio-recovery-proof-'+stamp.lower(), 'id': 'd'*64},
                  'encryptedBackupVerification': {'status': 'VERIFIED_BY_COORDINATOR', 'receiptSha256': 'e'*64, 'checkpointReceiptSha256': 'a'*64}}
        proof = {'status': 'passed', 'comparisonEqual': True, 'targetStopped': True, 'sourceContainerUnchanged': True,
                 'sourceHealthyAfter': True, 'startedAt': stamp, 'source': self.a['source']['name'],
                 'sourceContainerId': self.a['source']['id'], 'sourceImage': self.a['source']['image'],
                 'target': self.a['copy']['name'], 'network': 'none', 'portsPublished': False,
                 'cronEnabledOnTarget': False, 'mismatchCounts': {'sourceOnly': 0, 'targetOnly': 0}}
        self.checkpoint = root / stamp
        self.checkpoint.mkdir()
        raw = json.dumps(proof).encode()
        (self.checkpoint/'receipt.json').write_bytes(raw)
        self.a['checkpointReceiptSha256'] = self.a['encryptedBackupVerification']['checkpointReceiptSha256'] = self.s.digest(raw)
        self.source = {'Name': '/portfolio-stage-db-1', 'Id': 'b'*64, 'Image': 'sha256:'+'c'*64,
                       'State': {'Running': True, 'Health': {'Status': 'healthy'}}, 'Mounts': [{'Source': '/source-volume'}]}
        self.target = {'Name': '/'+self.a['copy']['name'], 'Id': 'd'*64, 'Image': self.source['Image'],
                       'State': {'Running': False}, 'HostConfig': {'NetworkMode': 'none', 'PortBindings': {}},
                       'NetworkSettings': {'Ports': {}},
                       'Config': {'Labels': {'portfolio.recovery': 'isolated-proof'}, 'Cmd': ['postgres', '-c', 'cron.launch_active_jobs=off']},
                       'Mounts': [{'Type': 'bind', 'Source': str(self.checkpoint), 'Destination': '/recovery', 'RW': False},
                                  {'Type': 'volume', 'Source': '/copy-volume'}]}
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        if os.name == 'nt':
            self.stack.enter_context(patch.dict(sys.modules, {'fcntl': types.SimpleNamespace(LOCK_EX=1, LOCK_NB=2, flock=lambda *a: None)}))
        self.stack.enter_context(patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=20*1024**3)))
        self.stack.enter_context(patch.object(self.s, 'command', side_effect=self.command))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.ddl = []
        self.snapshot_count = 0
        self.drift = False
        self.financial_drift = False
        self.lose_response = False
        self.start_response_lost = False
        self.wrong_after = False
        self.observe_old = False

    def command(self, args, body=None, timeout=90):
        if args[:2] == ['docker', 'inspect']:
            return json.dumps([self.source if args[2] == self.a['source']['id'] else self.target])
        if args[:2] == ['docker', 'start']:
            self.target['State']['Running'] = True
            if self.start_response_lost:
                raise TimeoutError('lost copy start response')
            return ''
        if args[:2] == ['docker', 'stop']:
            self.target['State']['Running'] = False
            return ''
        if 'pg_isready' in args:
            return ''
        sql = body.decode()
        if sql == 'SELECT 1;':
            return '1'
        if sql.startswith('SHOW '):
            return 'off'
        if 'START_A_RECONCILE_READONLY' in sql:
            values = [{'catalog': 'drift' if self.drift else 'same'},
                      {'financial': 'drift' if self.financial_drift else 'same'},
                      {str(i): self.observe_old for i in range(9)},
                      {str(i): not self.observe_old for i in range(9)}]
            return '\n'.join(json.dumps(value) for value in values)
        if m.INVENTORY in sql:
            self.snapshot_count += 1
            after = self.snapshot_count % 2 == 0
            return json.dumps({'catalog': 'drift' if self.drift and after else 'same'})+'\n'+json.dumps({'financial': 'drift' if self.financial_drift and after else 'same'})
        if 'kernelBodies' in sql:
            return json.dumps({str(i): not(self.wrong_after and len(self.ddl)>0) for i in range(9)})
        operation = 'rollback' if sql == m.payload(self.s, 'rollback') else 'apply'
        mode = 'copy' if self.target['State']['Running'] else 'source'
        assert (self.checkpoint/'consultation-feedback-install'/operation/(mode+'-intent.json')).exists()
        self.ddl.append(sql)
        if self.lose_response:
            raise TimeoutError('simulated response lost AFTER commit')
        return ''

    def result(self, mode='copy', operation='apply'):
        return json.loads((self.checkpoint/'consultation-feedback-install'/operation/(mode+'-result.json')).read_text())

    def test_copy_source_are_exact_payload_and_bound_to_rehearsal(self):
        m.run('copy', self.a, 'apply', safety=self.s)
        m.run('source', self.a, 'apply', safety=self.s)
        self.assertEqual(len(self.ddl), 2)
        self.assertEqual(self.ddl[0], self.ddl[1])
        self.assertEqual(self.result('source')['status'], 'APPLIED')
        self.assertFalse(self.result('source')['schemaReloadRequested'])
        self.assertFalse(self.target['State']['Running'])

    def test_source_without_rehearsal_is_never_sent(self):
        with self.assertRaises(FileNotFoundError):
            m.run('source', self.a, 'apply', safety=self.s)
        self.assertEqual(self.ddl, [])

    def test_changed_operation_or_binding_is_not_a_rehearsal(self):
        m.run('copy', self.a, 'apply', safety=self.s)
        proof = self.result()
        for edit in [{'binding': {}}, {'targetStopped': False}, {'sourceHealthyAfter': False},
                     {'historyAndFinancialUnchanged': False}, {'status': 'APPLIED_REVIEW_REQUIRED'}]:
            with self.assertRaises(RuntimeError):
                m.validate_rehearsal(self.s, {**proof, **edit}, proof['binding'])
        with self.assertRaises(FileNotFoundError):
            m.run('source', self.a, 'rollback', safety=self.s)
        self.assertEqual(len(self.ddl), 1)

    def test_lost_commit_response_preserves_intent_and_cannot_replay(self):
        self.lose_response = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.result()['status'], 'OUTCOME_UNKNOWN_READBACK_REQUIRED')
        self.assertTrue(self.result()['targetStopped'])
        with self.assertRaisesRegex(RuntimeError, 'prior_feedback_attempt'):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(len(self.ddl), 1)

    def test_unknown_commit_reconciles_exact_intent_without_ddl_or_replacing_evidence(self):
        self.lose_response = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a, 'apply', safety=self.s)
        directory = self.checkpoint/'consultation-feedback-install/apply'
        original = {name: (directory/name).read_bytes() for name in ['copy-intent.json','copy-result.json']}
        self.target['State']['Running'] = True  # Owner starts its copy separately, never reconciler.
        observed = m.reconcile('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(observed['status'], 'MATCHED_TARGET_STATE_READBACK')
        self.assertFalse(observed['replayAllowed'])
        self.assertFalse(observed['installationExecuted'])
        self.assertEqual(len(self.ddl), 1)
        for name, raw in original.items():
            self.assertEqual((directory/name).read_bytes(), raw)

    def test_old_state_or_changed_history_stays_unresolved_without_replay(self):
        self.lose_response = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.target['State']['Running'] = True
        self.observe_old = True
        self.assertEqual(m.reconcile('copy', self.a, 'apply', safety=self.s)['status'], 'UNRESOLVED')
        self.observe_old = False
        self.financial_drift = True
        self.assertEqual(m.reconcile('copy', self.a, 'apply', safety=self.s)['status'], 'UNRESOLVED')
        self.assertEqual(len(self.ddl), 1)

    def test_tampered_before_snapshot_cannot_be_reconciled(self):
        self.lose_response = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a, 'apply', safety=self.s)
        (self.checkpoint/'consultation-feedback-install/apply/copy-before.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'intent_before_fingerprint_changed'):
            m.reconcile('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(len(self.ddl), 1)

    def test_start_outcome_unknown_still_inspects_and_stops_only_owned_copy(self):
        self.start_response_lost = True
        with self.assertRaises(TimeoutError):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertFalse(self.target['State']['Running'])
        self.assertEqual(self.ddl, [])

    def test_catalog_drift_keeps_result_review_required_and_cannot_enable_source(self):
        self.drift = True
        with self.assertRaisesRegex(RuntimeError, 'unexpected_existing_catalog'):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.result()['status'], 'APPLIED_REVIEW_REQUIRED')
        with self.assertRaisesRegex(RuntimeError, 'feedback_copy_rehearsal_missing'):
            m.run('source', self.a, 'apply', safety=self.s)

    def test_financial_change_is_not_silently_accepted(self):
        self.financial_drift = True
        with self.assertRaisesRegex(RuntimeError, 'history_or_financial'):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertFalse(self.result()['historyAndFinancialUnchanged'])

    def test_wrong_postconditions_are_not_applied(self):
        self.wrong_after = True
        with self.assertRaisesRegex(RuntimeError, 'verification_failed'):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.result()['status'], 'APPLIED_REVIEW_REQUIRED')

    def test_capacity_below_guard_cannot_send_ddl(self):
        with patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=m.MIN_FREE_BYTES-1)):
            with self.assertRaisesRegex(RuntimeError, 'capacity_below_10GiB'):
                m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.ddl, [])

    def test_changed_backup_receipt_stops_before_copy_start(self):
        (self.checkpoint/'receipt.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'checkpoint_receipt_changed'):
            m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.ddl, [])
        self.assertFalse(self.target['State']['Running'])

    def test_tampered_helper_and_migration_cannot_construct_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'helper.py'
            path.write_bytes(b'altered')
            with self.assertRaisesRegex(RuntimeError, 'safety_helper_bytes_changed'):
                m.load_safety(path)
            file = Path(directory)/m.ARTIFACTS['apply'][0]
            file.parent.mkdir(parents=True)
            file.write_bytes(b'altered')
            with self.assertRaisesRegex(RuntimeError, 'feedback_sql_bytes_changed'):
                m.payload(self.s, 'apply', Path(directory))

    @unittest.skipIf(os.name == 'nt', 'requires real Linux fcntl')
    def test_real_fcntl_contention_blocks_before_any_target_operation(self):
        import fcntl
        with (self.s.BACKUPS/'.cashflow-release.lock').open('a+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                m.run('copy', self.a, 'apply', safety=self.s)
        self.assertEqual(self.ddl, [])


if __name__ == '__main__':
    unittest.main()
