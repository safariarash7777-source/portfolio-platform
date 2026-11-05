"""Synthetic cross-artifact and live-state negatives. No SSH/Docker/SQL/files copied."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

here = Path(__file__).resolve().parent
gate = globals().get('_injected_gate')
if gate is None:
    spec = importlib.util.spec_from_file_location('checkpoint_read_gate', here/'checkpoint-read-gate.py')
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)


def encoded(value):
    return json.dumps(value, sort_keys=True).encode()


def fixture():
    binding = json.loads(globals().get('_injected_binding_bytes')
        or (here/'RELEASE-BINDING-20261031.json').read_bytes())
    # Synthetic contents and repinned synthetic hashes are used by pure validation
    # only. run() accepts solely the separately reviewed, fixed real binding SHA.
    native = {'status': 'failed', 'startedAt': gate.CHECKPOINT, 'source': gate.SOURCE,
        'sourceContainerId': gate.SOURCE_ID, 'sourceImage': gate.IMAGE, 'target': gate.TARGET,
        'privateDirectory': str(gate.ROOT), 'dumpBytes': binding['dump']['bytes'],
        'dumpSha256': binding['dump']['sha256']}
    original = encoded(native)
    original_hash = gate.digest(original)
    intent = {'target': gate.TARGET, 'targetId': gate.TARGET_ID, 'sourceId': gate.SOURCE_ID,
        'helperSha256': binding['helperSha256'], 'planSha256': gate.PLAN_SHA,
        'runnerSha256': gate.RUNNER_SHA, 'sourceSqlWrites': False, 'originalReceiptSha256': original_hash}
    result = {'status': 'PASS_OWNED_COPY_ACL19_RECONCILIATION', 'checkpoint': gate.CHECKPOINT,
        'target': gate.TARGET, 'targetId': gate.TARGET_ID, 'dumpSha256': binding['dump']['sha256'],
        'originalReceiptSha256': original_hash, 'strictCoreEqual': True, 'strictPrivateEqual': True,
        'targetStopped': True, 'sourceIdentityUnchanged': True, 'sourceHealthyAfter': True,
        'originalFailurePreserved': True, 'sourceSqlWrites': False, 'helperReplaced': False,
        'portsPublished': False, 'cronEnabled': False, 'network': 'none', 'objectCount': 19, 'sqlSha256': gate.SQL_SHA}
    raw = {'receipt.json': original, 'source-inventory.private': b'SYNTHETIC FULL INVENTORY',
        gate.OP+'intent.json': encoded(intent), gate.OP+'result.json': encoded(result),
        gate.OP+'plan.json': encoded({'objectCount': 19, 'objects': ['SYNTHETIC-'+str(i) for i in range(19)], 'sqlSha256': gate.SQL_SHA}),
        gate.OP+'strict-core-comparison.json': encoded({'equal': True, 'sourceLines': 2084, 'targetLines': 2084, 'sourceOnly': [], 'targetOnly': []}),
        gate.OP+'strict-private-comparison.json': encoded({'equal': True, 'functions': 19, 'schemas': 3, 'relations': 0})}
    binding['artifactsRelativeToCheckpoint'] = {name: gate.digest(value) for name, value in raw.items()}
    return binding, raw


def change(binding, raw, name, **fields):
    value = json.loads(raw[name])
    value.update(fields)
    raw[name] = encoded(value)
    binding['artifactsRelativeToCheckpoint'][name] = gate.digest(raw[name])


def states():
    source = {'Id': gate.SOURCE_ID, 'Image': gate.IMAGE,
        'State': {'Running': True, 'Health': {'Status': 'healthy'}}, 'Mounts': [{'Source': '/SYNTHETIC/source'}]}
    target = {'Id': gate.TARGET_ID, 'Name': '/'+gate.TARGET, 'Image': gate.IMAGE,
        'State': {'Running': False}, 'HostConfig': {'NetworkMode': 'none', 'PortBindings': None},
        'NetworkSettings': {'Ports': {'5432/tcp': None}},
        'Config': {'Labels': {'portfolio.recovery': 'isolated-proof'}, 'Cmd': ['postgres', 'cron.launch_active_jobs=off']},
        'Mounts': [{'Type': 'bind', 'Source': str(gate.ROOT), 'Destination': '/recovery', 'RW': False},
                   {'Type': 'volume', 'Source': '/SYNTHETIC/proof'}]}
    return source, target


class GateTests(unittest.TestCase):
    def test_corrected_receipt_is_consumed_with_original_failure_preserved(self):
        binding, raw = fixture()
        verdict = gate.validate_bundle(binding, raw)
        self.assertEqual(verdict['originalStatus'], 'failed')
        self.assertEqual(verdict['correctionReceiptSha256'], gate.digest(raw[gate.OP+'result.json']))

    def test_hash_tamper_without_repin_is_rejected(self):
        binding, raw = fixture()
        raw[gate.OP+'result.json'] += b' '
        with self.assertRaisesRegex(gate.Rejected, 'artifact_hash'): gate.validate_bundle(binding, raw)

    def test_relabelled_original_pass_is_rejected_even_if_repinned(self):
        binding, raw = fixture()
        change(binding, raw, 'receipt.json', status='passed')
        with self.assertRaisesRegex(gate.Rejected, 'original_failure_checkpoint'): gate.validate_bundle(binding, raw)

    def test_another_checkpoint_or_source_binding_cannot_be_used(self):
        for key, value in [('checkpoint', '20261023T204308Z'), ('sourceId', '0'*64), ('targetId', gate.SOURCE_ID)]:
            binding, raw = fixture(); binding[key] = value
            with self.assertRaises(gate.Rejected): gate.validate_bundle(binding, raw)

    def test_missing_or_added_artifact_is_rejected(self):
        for add in (False, True):
            binding, raw = fixture()
            if add: raw['other.json'] = b'{}'
            else: raw.pop(gate.OP+'intent.json')
            with self.assertRaisesRegex(gate.Rejected, 'artifact_allowlist'): gate.validate_bundle(binding, raw)

    def test_unlinked_intent_cannot_accept_another_failed_receipt(self):
        binding, raw = fixture()
        change(binding, raw, gate.OP+'intent.json', originalReceiptSha256='0'*64)
        with self.assertRaisesRegex(gate.Rejected, 'original_receipt_link'): gate.validate_bundle(binding, raw)

    def test_correction_dump_or_target_swap_is_rejected(self):
        for values in ({'dumpSha256': '0'*64}, {'targetId': gate.SOURCE_ID}):
            binding, raw = fixture(); change(binding, raw, gate.OP+'result.json', **values)
            with self.assertRaisesRegex(gate.Rejected, 'correction_identity_status'): gate.validate_bundle(binding, raw)

    def test_source_writes_helper_replacement_or_public_ports_are_rejected(self):
        for field in ('sourceSqlWrites', 'helperReplaced', 'portsPublished', 'cronEnabled'):
            binding, raw = fixture(); change(binding, raw, gate.OP+'result.json', **{field: True})
            with self.assertRaisesRegex(gate.Rejected, 'correction_isolation'): gate.validate_bundle(binding, raw)

    def test_full_core_counts_never_inherit_live_append_exceptions(self):
        binding, raw = fixture()
        change(binding, raw, gate.OP+'strict-core-comparison.json', sourceOnly=['rowcount|public.site_agent_runs|1'])
        with self.assertRaisesRegex(gate.Rejected, 'strict_core_comparison'): gate.validate_bundle(binding, raw)

    def test_private_inventory_and_plan_scope_are_strict(self):
        for name, value in [(gate.OP+'strict-private-comparison.json', {'functions': 18}),
                            (gate.OP+'plan.json', {'sqlSha256': '0'*64}),
                            (gate.OP+'intent.json', {'runnerSha256': '0'*64})]:
            binding, raw = fixture(); change(binding, raw, name, **value)
            with self.assertRaises(gate.Rejected): gate.validate_bundle(binding, raw)

    def test_receipt_gate_cannot_authorize_release_or_retry(self):
        for key in ('releaseAuthorizedByThisBinding', 'autoRetryBackup', 'proofPublicUseAllowed'):
            binding, raw = fixture(); binding[key] = True
            with self.assertRaises(gate.Rejected): gate.validate_bundle(binding, raw)

    def test_exact_stopped_owned_state_is_accepted(self):
        gate.validate_states(*states())

    def test_running_online_or_wrong_owner_proof_is_rejected(self):
        for path, value in [(('State', 'Running'), True), (('HostConfig', 'NetworkMode'), 'bridge'),
                            (('Config', 'Labels'), {}), (('Id',), gate.SOURCE_ID),
                            (('HostConfig', 'PortBindings'), {'5432/tcp': [{}]})]:
            source, target = states(); selected = target
            for key in path[:-1]: selected = selected[key]
            selected[path[-1]] = value
            with self.assertRaises(gate.Rejected): gate.validate_states(source, target)

    def test_archive_rw_and_primary_mount_overlap_are_rejected(self):
        source, target = states(); target['Mounts'][0]['RW'] = True
        with self.assertRaisesRegex(gate.Rejected, 'archive_mount'): gate.validate_states(source, target)
        source, target = states(); target['Mounts'][1]['Source'] = source['Mounts'][0]['Source']
        with self.assertRaisesRegex(gate.Rejected, 'source_mount_overlap'): gate.validate_states(source, target)

    def test_unhealthy_or_changed_source_is_rejected(self):
        source, target = states(); source['State']['Health']['Status'] = 'unhealthy'
        with self.assertRaises(gate.Rejected): gate.validate_states(source, target)
        source, target = states(); source['Image'] = 'unreviewed'
        with self.assertRaises(gate.Rejected): gate.validate_states(source, target)

    def test_path_traversal_rejected_before_any_file_open(self):
        for value in ('../receipt.json', '/etc/passwd', ''):
            with self.assertRaisesRegex(gate.Rejected, 'relative_path'): gate.opened(Path('/unused'), value)

    def test_runtime_refuses_repinning_the_binding_before_io(self):
        with patch.object(gate.os, 'name', 'posix'):
            for sha in ('0'*64, gate.digest(b'synthetic policy'), gate.PINNED_BINDING_SHA):
                with self.assertRaisesRegex(gate.Rejected, 'reviewed_binding_hash'):
                    gate.run(b'synthetic policy', sha)


if __name__ == '__main__':
    unittest.main(verbosity=2)
