"""Boundary tests; these never connect to SSH/Docker or apply SQL."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


consumer = load(HERE/'corrected-checkpoint-consumer.py', 'consumer')
installer = load(REPO/'scripts/testing/consultation/install-native.py', 'installer')


def bundle():
    folder = REPO/'docs/ops/p15-webpack-cache-20261030'
    return {'gate': base64.b64encode((folder/'checkpoint-read-gate.py').read_bytes().replace(b'\r\n', b'\n')).decode(),
            'binding': base64.b64encode((folder/'RELEASE-BINDING-20261031.json').read_bytes()).decode()}


def attestation():
    return {'status': 'PASS_PINNED_SQL_RESTORE_READ_GATE', 'checkpoint': '20261030T215307Z',
        'bindingSha256': consumer.BINDING_SHA, 'originalStatus': 'failed',
        'correctionStatus': 'PASS_OWNED_COPY_ACL19_RECONCILIATION',
        'sourceId': '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c',
        'targetId': '833a8447c01570811d6a0ad50cafee00745614b811ef9668acb0d944e04b21f1',
        'dumpSha256': '87434f8c53cca9910cdbd953415ffed5e01d3aacb0db8c0702a4e164253c8c17',
        'dumpBytes': 2406546295, 'proofStopped': True, 'proofNetwork': 'none',
        'proofPortsPublished': False, 'sourceHealthy': True,
        **dict.fromkeys(('sqlExecuted', 'backupRetried', 'filesTransferred', 'releaseAuthorized',
                        'captureConsumerIntegrated', 'installerConsumerIntegrated'), False)}


class Boundaries(unittest.TestCase):
    def test_exact_reviewed_sources_load_without_running_gate(self):
        gate, raw = consumer.load_gate(bundle())
        self.assertEqual(gate.PINNED_BINDING_SHA, consumer.BINDING_SHA)
        self.assertEqual(json.loads(raw)['checkpoint'], '20261030T215307Z')

    def test_gate_code_or_binding_cannot_be_repinned(self):
        for field in ('gate', 'binding'):
            changed = bundle()
            changed[field] = base64.b64encode(base64.b64decode(changed[field])+b'\n').decode()
            with self.assertRaisesRegex(ValueError, 'changed'):
                consumer.load_gate(changed)

    def test_extra_path_or_malformed_payload_is_rejected(self):
        for bad in ({**bundle(), 'path': '/tmp/other'}, {'gate': '!', 'binding': '!'}, None):
            with self.assertRaises((ValueError, TypeError)):
                consumer.load_gate(bad)

    def test_unknown_consumer_never_loads_or_runs_gate(self):
        with patch.object(consumer, 'load_gate') as loader:
            with self.assertRaisesRegex(ValueError, 'unknown_consumer'):
                consumer.review('install-native.apply', {})
            loader.assert_not_called()

    def test_failed_original_is_preserved_not_relabelled_passed(self):
        consumer.validate_attestation(attestation())
        changed = attestation(); changed['originalStatus'] = 'passed'
        with self.assertRaisesRegex(ValueError, 'receipt_profile_changed'):
            consumer.validate_attestation(changed)

    def test_changed_checkpoint_identity_dump_or_isolation_is_rejected(self):
        changes = {'checkpoint': '20261023T204308Z', 'sourceId': '0'*64,
            'targetId': '0'*64, 'dumpSha256': '0'*64, 'dumpBytes': True,
            'proofStopped': False, 'proofNetwork': 'bridge', 'proofPortsPublished': True,
            'sourceHealthy': 'true'}
        for key, value in changes.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                consumer.validate_attestation({**attestation(), key: value})

    def test_missing_false_or_granted_write_boundary_is_rejected(self):
        for key in ('sqlExecuted', 'backupRetried', 'filesTransferred', 'releaseAuthorized',
                    'captureConsumerIntegrated', 'installerConsumerIntegrated'):
            for value in (True, None, 0, 'false'):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    consumer.validate_attestation({**attestation(), key: value})

    def test_two_read_only_consumers_preserve_no_write_flags(self):
        for caller in consumer.CONSUMERS:
            fake = SimpleNamespace(run=lambda raw, sha: copy.deepcopy(attestation()))
            with patch.object(consumer, 'load_gate', return_value=(fake, b'reviewed')):
                result = consumer.review(caller, {})
            self.assertEqual(result['consumer'], caller)
            self.assertFalse(result['releaseAuthorized'])
            self.assertFalse(result['captureVerifyProfileIntegrated'])
            self.assertFalse(result['legacyApplyPathIntegrated'])
            self.assertEqual(result['attestation']['originalStatus'], 'failed')

    def test_installer_read_only_dispatch_never_enters_old_apply_path(self):
        with patch.object(installer.sys, 'argv', ['install-native.py', '--review-corrected-checkpoint']), \
             patch.object(installer, 'review_corrected_checkpoint', return_value={'status': 'READ_ONLY'}) as review, \
             patch.object(installer, 'command', side_effect=AssertionError('command forbidden')), \
             patch.object(installer, 'query', side_effect=AssertionError('SQL forbidden')), \
             patch('sys.stdout', new_callable=io.StringIO) as output:
            installer.main()
            review.assert_called_once_with()
            self.assertEqual(json.loads(output.getvalue())['status'], 'READ_ONLY')

    def test_installer_rejects_changed_consumer_before_execution(self):
        packet = {**bundle(), 'consumer': base64.b64encode(b'raise AssertionError()').decode()}
        with patch.object(installer.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(json.dumps(packet).encode()))):
            with self.assertRaisesRegex(RuntimeError, 'review_consumer_changed'):
                installer.review_corrected_checkpoint()

    def test_installer_rejects_oversized_payload(self):
        with patch.object(installer.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(b'x'*131073))):
            with self.assertRaisesRegex(RuntimeError, 'review_payload_size'):
                installer.review_corrected_checkpoint()


if __name__ == '__main__':
    unittest.main()
