"""Offline unit tests. No run(), SSH, model, native gate or database execution."""
import copy
import errno
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import types
import unittest
from unittest.mock import MagicMock, Mock, patch

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
POLICY_PATH = 'docs/ops/p15-webpack-cache-20261030/CORRECTED-FAILED-V2R2-POLICY.json'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


r2 = load('r2', HERE / 'checkpoint-profile-v2r2-remote.py')


class ProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Stage the reviewed policy first; never substitute a synthetic policy in run().
        cls.raw = subprocess.check_output(['git', 'show', ':' + POLICY_PATH], cwd=REPO)
        cls.policy = r2.policy_bytes(cls.raw)

    def test_exact_git_policy_and_binding(self):
        self.assertEqual(len(self.raw), 4431)
        self.assertEqual(r2.digest(self.raw), r2.POLICY_SHA)
        raw = subprocess.check_output(['git', 'show', 'HEAD:docs/ops/p15-webpack-cache-20261030/RELEASE-BINDING-20261031.json'], cwd=REPO)
        self.assertEqual(len(raw), 2351)
        self.assertEqual(r2.digest(raw), self.policy['parentBindingSha256'])
        r2.check_expected(self.policy['roles'][15], r2.present_record(self.policy['roles'][15], raw, None))

    def test_policy_changes_or_normalization_rejected(self):
        for raw in (self.raw+b'\n', self.raw.replace(b'null', b'0', 1), self.raw[:-1], bytearray(self.raw)):
            with self.subTest(case=type(raw).__name__), self.assertRaises(r2.ReconcileRequired):
                r2.policy_bytes(raw)

    def test_roles_history_and_explicit_nulls(self):
        p = self.policy
        self.assertEqual((p['records'], p['streams'], p['absentIndex']), (17, 16, 5))
        self.assertEqual(len({r['role'] for r in p['roles']}), 17)
        self.assertEqual(len({(r['origin'], r['name']) for r in p['roles']}), 17)
        self.assertEqual([i for i,r in enumerate(p['roles']) if r['requiredState']=='absent'], [5])
        self.assertIsNone(p['roles'][5]['expectedLength'])
        self.assertIsNone(p['roles'][5]['expectedSha256'])
        self.assertEqual(p['roles'][7]['expectedLength'], 3707)
        self.assertNotEqual(p['roles'][7]['expectedSha256'], p['roles'][12]['expectedSha256'])
        self.assertIsNone(p['referenceObservation']['neverCreated'])
        self.assertIsNone(p['referenceObservation']['historicalNotDeleted'])
        self.assertFalse(p['grantsExecutionAuthority'])

    def test_only_child_enoent_is_absent(self):
        close = Mock()
        self.assertTrue(r2.classify_child_probe(Mock(side_effect=FileNotFoundError(errno.ENOENT, 'synthetic')), close))
        close.assert_not_called()

    def test_permission_link_unknown_not_absent(self):
        for error in (PermissionError(errno.EACCES, 'synthetic'), OSError(errno.ELOOP,'link'), OSError(errno.EIO,'unknown')):
            with self.subTest(errno=error.errno), self.assertRaises(type(error)):
                r2.classify_child_probe(Mock(side_effect=error), Mock())

    def test_existing_child_even_zero_length_rejected_and_closed(self):
        close = Mock()
        with self.assertRaisesRegex(r2.ReconcileRequired, 'final_appeared'):
            r2.classify_child_probe(lambda: 77, close)
        close.assert_called_once_with(77)

    def test_parent_missing_not_child_absence(self):
        root=Mock(); root.resolve.side_effect=FileNotFoundError(errno.ENOENT,'parent')
        with patch.object(r2, 'classify_child_probe') as child, self.assertRaises(FileNotFoundError):
            r2.absent(types.SimpleNamespace(ROOT=root))
        child.assert_not_called()

    def test_parent_link_not_absence(self):
        root=Mock(); root.resolve.return_value=object()
        with patch.object(r2, 'classify_child_probe') as child, self.assertRaisesRegex(r2.ReconcileRequired,'root_symlink'):
            r2.absent(types.SimpleNamespace(ROOT=root))
        child.assert_not_called()

    def test_native_binding_length_and_hash_both_checked(self):
        role=self.policy['roles'][15]
        record={'role':role['role'],'name':role['name'],'origin':role['origin'],'length':2351,'sha256':role['expectedSha256']}
        r2.check_expected(role,record)
        for k,v in (('length',2394),('length',2352),('sha256','0'*64),('role','correction.strict_private')):
            x=dict(record);x[k]=v
            with self.subTest(field=k,value=v), self.assertRaises(r2.ReconcileRequired):
                r2.check_expected(role,x)

    def test_precomparison_cannot_be_strict_correction_alias(self):
        role=self.policy['roles'][7]
        record={'role':role['role'],'name':role['name'],'origin':role['origin'],'length':3707,'sha256':self.policy['roles'][12]['expectedSha256']}
        with self.assertRaisesRegex(r2.ReconcileRequired,'role_hash'):
            r2.check_expected(role,record)

    def test_absence_failure_stops_before_full_gate(self):
        gate=MagicMock(); consumer=Mock()
        with patch.object(r2,'absent',side_effect=PermissionError('synthetic')), self.assertRaises(PermissionError):
            r2.metadata(gate,consumer,b'',self.policy)
        gate.run.assert_not_called();gate.opened.assert_not_called()

    def test_small_hash_failure_stops_before_full_gate(self):
        gate=MagicMock(); consumer=Mock()
        gate.stable_read.return_value=b'wrong raw before comparison'
        with patch.object(r2,'absent'), patch.object(r2.os,'fstat',return_value=types.SimpleNamespace(st_size=2406546295)), self.assertRaisesRegex(r2.ReconcileRequired,'role_length'):
            r2.metadata(gate,consumer,b'',self.policy)
        gate.run.assert_not_called()

    def test_small_reread_detects_change_after_full_gate(self):
        # All bytes/identities here are synthetic; tests the ordering of metadata().
        p=copy.deepcopy(self.policy)
        for role in p['roles']:
            role['expectedLength']=None;role['expectedSha256']=None
        p['roles'][0]['expectedLength']=1;p['roles'][0]['expectedSha256']=r2.digest(b'a')
        gate=MagicMock();gate.stable_read.side_effect=[b'a']*13+[b'b']
        gate.run.return_value={'dumpSha256':r2.digest(b'a'),'dumpBytes':1}
        consumer=Mock()
        with patch.object(r2,'absent'), patch.object(r2.os,'fstat',return_value=types.SimpleNamespace(st_size=1)), self.assertRaisesRegex(r2.ReconcileRequired,'small_artifact_changed_during_gate'):
            r2.metadata(gate,consumer,b'',p)
        gate.run.assert_called_once()
        consumer.validate_attestation.assert_called_once()


if __name__ == '__main__':
    unittest.main(verbosity=2)
