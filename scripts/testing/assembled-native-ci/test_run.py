"""Offline contract tests only. No native, Docker, Auth, CI impersonation or network."""
import copy
import ast
from contextlib import ExitStack
import hashlib
import importlib.util
import io
import json
import os
import re
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import tarfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('assembled_ci_controller', HERE / 'run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def synthetic_env():
    return {'RUNNER_OS': 'Linux', 'CI': 'true', 'GITHUB_ACTIONS': 'true',
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REPOSITORY': runner.REPOSITORY,
            'GITHUB_JOB': 'assembled-native-bounded', 'GITHUB_RUN_ID': '123456789',
            'GITHUB_RUN_ATTEMPT': '1', 'ASSEMBLED_ALLOCATION_ID': '00000000-0000-4000-8000-000000000001',
            'ASSEMBLED_REVIEWED_SHA': 'a' * 40, 'GITHUB_SHA': 'a' * 40}


class Binding(unittest.TestCase):
    def test_allocated_execution_is_bound_to_run_attempt_and_reviewed_head(self):
        one = runner.context(synthetic_env(), 'linux')
        again = runner.context(synthetic_env(), 'linux')
        self.assertEqual(one, again)
        changed = synthetic_env(); changed['GITHUB_RUN_ID'] = '123456790'
        self.assertNotEqual(one['executionAllocationId'], runner.context(changed, 'linux')['executionAllocationId'])

    def test_only_explicit_fresh_gha_linux_dispatch_is_eligible(self):
        for key, bad in [('RUNNER_OS', 'Windows'), ('CI', 'false'), ('GITHUB_ACTIONS', 'false'),
                         ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_REPOSITORY', 'other/repo'),
                         ('GITHUB_JOB', 'quality'), ('GITHUB_RUN_ATTEMPT', '2'),
                         ('GITHUB_RUN_ID', '$(synthetic)'), ('ASSEMBLED_ALLOCATION_ID', 'unallocated'),
                         ('GITHUB_SHA', 'b' * 40), ('ASSEMBLED_REVIEWED_SHA', '')]:
            with self.subTest(key=key):
                value = synthetic_env(); value[key] = bad
                with self.assertRaises(ValueError): runner.context(value, 'linux')
        with self.assertRaises(ValueError): runner.context(synthetic_env(), 'win32')

    def test_child_receives_no_inherited_provider_or_github_credentials(self):
        synthetic = {'PATH': '/bin', 'LANG': 'C.UTF-8', 'CI': 'true', 'GITHUB_ACTIONS': 'true', 'RUNNER_TEMP': '/tmp',
                     'OPENAI_API_KEY': 'SYNTHETIC_DO_NOT_FORWARD', 'SUPABASE_SERVICE_ROLE_KEY': 'SYNTHETIC_DO_NOT_FORWARD',
                     'GITHUB_TOKEN': 'SYNTHETIC_DO_NOT_FORWARD', 'ACTIONS_RUNTIME_TOKEN': 'SYNTHETIC_DO_NOT_FORWARD',
                     'DOCKER_HOST': 'https://foreign.invalid', 'SSH_AUTH_SOCK': '/private/synthetic'}
        with patch.dict(os.environ, synthetic, clear=True): env = runner.safe_env(Path('/tmp/synthetic-private'))
        self.assertNotIn('SYNTHETIC_DO_NOT_FORWARD', json.dumps(env))
        self.assertEqual(env['DOCKER_HOST'], 'unix:///var/run/docker.sock')
        self.assertNotIn('SSH_AUTH_SOCK', env)
        self.assertEqual(env['GIT_CONFIG_GLOBAL'], '/dev/null')

    def test_exclusive_execution_intent_blocks_a_second_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder)
            state = {'stage': 'PREPARED', 'attempted': False}
            runner.private_json(private / 'state.json', state, True)
            runner.claim_execution(private, {'synthetic': True}, state)
            self.assertTrue(state['attempted'])
            with self.assertRaises(ValueError): runner.claim_execution(private, {}, state)
            # Even changing the in-memory stage cannot overwrite the intent.
            state['stage'] = 'PREPARED'
            with self.assertRaises(FileExistsError): runner.claim_execution(private, {}, state)

    def test_interrupted_or_killed_attempt_keeps_write_outcome_unknown(self):
        for state in [{'stage': 'STARTING', 'attempted': True}, {'stage': 'RUNNING', 'attempted': True},
                      {'stage': 'EXECUTED', 'attempted': True, 'timedOutOrInterrupted': True},
                      {'stage': 'EXECUTED', 'attempted': True, 'exitCode': -9}]:
            self.assertTrue(runner.write_outcome_unknown(state, b''))
        self.assertTrue(runner.write_outcome_unknown({'stage': 'EXECUTED'}, b'pf10_native_write_outcome_unknown_stop_no_replay'))
        self.assertFalse(runner.write_outcome_unknown({'stage': 'PREPARING', 'attempted': False}, b''))


class CleanupOwnership(unittest.TestCase):
    def setUp(self):
        self.run = 'assembled-member-admin-00000000-0000-4000-8000-000000000001'
        self.row = {'Id': 'a' * 64, 'Name': '/' + self.run + '-db', 'Config': {'Labels': {runner.LABEL: self.run}}}

    def test_exact_owned_resource_is_selected_by_full_inspected_id(self):
        self.assertEqual(runner.owned_docker_resource('container', self.row, self.run, 'a' * 12), 'a' * 64)

    def test_frozen_postgrest_version_probe_uses_the_same_exact_owner_gate(self):
        self.row['Name'] = '/' + self.run + '-rest-version'
        self.assertEqual(runner.owned_docker_resource('container', self.row, self.run, 'a' * 12), 'a' * 64)

    def test_foreign_label_name_or_object_id_cannot_be_removed(self):
        for field in ['label', 'name', 'id']:
            row = copy.deepcopy(self.row)
            if field == 'label': row['Config']['Labels'][runner.LABEL] = 'foreign-run'
            if field == 'name': row['Name'] = '/primary-db'
            if field == 'id': row['Id'] = 'b' * 64
            with self.subTest(field=field), self.assertRaises(ValueError):
                runner.owned_docker_resource('container', row, self.run, 'a' * 12)


class CapsuleAndReceipt(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.private = Path(cls.temp.name)
        cls.capsule = cls.private / 'capsule'; cls.capsule.mkdir()
        cls.raw = (HERE / 'sealed-v4b-app-f07.tar').read_bytes()
        cls.contract = runner.unpack_capsule(cls.raw, cls.capsule)
        cls.stage_raw = (HERE / 'sealed-v3-stage-observation.tar').read_bytes()
        if hashlib.sha256(cls.stage_raw).hexdigest() != '57d35ddc07e2883bb2dd5b0a7e051625a235c1294e3c5283e06ecec4438ccd81':
            raise AssertionError('preserved_stage_capsule_changed')
        cls.stage_capsule = cls.private / 'stage-capsule'; cls.stage_capsule.mkdir()
        with tarfile.open(fileobj=io.BytesIO(cls.stage_raw)) as archive:
            for member in archive.getmembers():
                relative = Path(member.name)
                if not member.isfile() or relative.is_absolute() or '..' in relative.parts:
                    raise AssertionError('invalid_stage_source_fixture')
                target = cls.stage_capsule / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as handle:
                    handle.write(archive.extractfile(member).read())
        cls.parent_raw = (HERE / 'sealed-v2.tar').read_bytes()
        if hashlib.sha256(cls.parent_raw).hexdigest() != 'f5020a6afebcc685b2e713a7f895646f2a5718ee04b72c846edccec41adb86fc':
            raise AssertionError('preserved_parent_capsule_changed')
        cls.parent_capsule = cls.private / 'parent-capsule'; cls.parent_capsule.mkdir()
        with tarfile.open(fileobj=io.BytesIO(cls.parent_raw)) as archive:
            for member in archive.getmembers():
                relative = Path(member.name)
                if not member.isfile() or relative.is_absolute() or '..' in relative.parts:
                    raise AssertionError('invalid_parent_source_fixture')
                target = cls.parent_capsule / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as handle:
                    handle.write(archive.extractfile(member).read())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_capsule_and_all_eight_helpers_remain_byte_exact(self):
        self.assertEqual(len(self.raw), 122880)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), runner.CAPSULE)
        self.assertEqual(len(self.contract['files']), 8)
        for pin in self.contract['files']:
            raw = (self.capsule / 'overlay' / pin['path']).read_bytes()
            self.assertEqual(len(raw), pin['bytes'])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), pin['sha256'])
        self.assertEqual(len(runner.expected_sql(self.private)), 18)

    def test_tampering_is_rejected_before_any_extraction(self):
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(ValueError): runner.unpack_capsule(self.raw[:-1] + b'!', Path(destination))
            self.assertEqual(list(Path(destination).iterdir()), [])

    def test_stage_capsule_binding_preserves_parent_and_all_other_helper_bytes(self):
        self.assertEqual(hashlib.sha256(self.stage_raw).hexdigest(), '57d35ddc07e2883bb2dd5b0a7e051625a235c1294e3c5283e06ecec4438ccd81')
        stage_contract_raw = (self.stage_capsule / 'overlay/scripts/testing/consultation-tickets/assembled-overlay.json').read_bytes()
        self.assertEqual(hashlib.sha256(stage_contract_raw).hexdigest(), '94e50f1ede5cb926e8daf7a677e1e5b84de72540df25edec6b97dec0865bc511')
        with tarfile.open(fileobj=io.BytesIO(self.parent_raw)) as parent, tarfile.open(fileobj=io.BytesIO(self.stage_raw)) as child:
            self.assertEqual(parent.getnames(), child.getnames())
            changed = [name for name in parent.getnames()
                       if parent.extractfile(name).read() != child.extractfile(name).read()]
        prefix = 'overlay/scripts/testing/consultation-tickets/'
        self.assertEqual(set(changed), {prefix + name for name in
                         ['assembled-member-scenario.mjs', 'assembled-native.mjs', 'assembled-overlay.json']})
        parent_contract = json.loads((self.parent_capsule / prefix / 'assembled-overlay.json').read_bytes())
        self.assertEqual({**parent_contract, 'files': []}, {**json.loads(stage_contract_raw), 'files': []})
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(ValueError): runner.unpack_capsule(self.parent_raw, Path(destination))
            self.assertEqual(list(Path(destination).iterdir()), [])

    def test_actual_sealed_stage_observer_offline_without_browser_or_network(self):
        env = {key: os.environ[key] for key in ['PATH', 'LANG', 'CI', 'SYSTEMROOT', 'WINDIR'] if key in os.environ}
        env.update(ASSEMBLED_STAGE_PARENT_ROOT=str(self.parent_capsule), ASSEMBLED_STAGE_CANDIDATE_ROOT=str(self.stage_capsule))
        result = subprocess.run([shutil.which('node'), '--test', str(HERE / 'stages.test.mjs')], env=env, capture_output=True)
        output = result.stdout.decode('utf8')
        self.assertEqual(result.returncode, 0, output + result.stderr.decode('utf8'))
        self.assertIn('tests 6', output)
        self.assertIn('pass 6', output)
        self.assertIn('fail 0', output)

    def test_f07_child_keeps_stage_history_and_changes_only_reviewed_source_bindings(self):
        self.assertEqual(runner.CAPSULE, '04899c1754525365daad2fbe2b11bd9c7c1c3a417d751bd36151332aaca7d2f4')
        self.assertEqual(runner.DRIVER, '0103a765d4862c27a22089414c6a59bcb555dac3f36913ddf48b373e751ecb2a')
        prefix = 'overlay/scripts/testing/consultation-tickets/'
        before = self.stage_capsule / prefix
        after = self.capsule / prefix
        old_contract = json.loads((before / 'assembled-overlay.json').read_bytes())
        self.assertEqual(old_contract['candidateCommit'], '4dcf3713c3ad2507ed1a5bfee42a52b3c17cfb8a')
        self.assertEqual(old_contract['candidateTree'], 'c96d462d72505f2471c54c8e7e5293fe2b39b3d1')
        helpers = {Path(pin['path']).name for pin in old_contract['files']} - {'assembled-native-profile.mjs', 'assembled-native-source.json'}
        self.assertEqual(len(helpers), 6)
        for name in helpers - {'assembled-auth-runtime.mjs'}:
            self.assertEqual((before / name).read_bytes(), (after / name).read_bytes())
        old_pin = b"export const assembledCandidateSha='4dcf3713c3ad2507ed1a5bfee42a52b3c17cfb8a';"
        new_pin = b"export const assembledCandidateSha='f07e0543c46cea88822dc0d400080b5bb94bef91';"
        runtime = (after / 'assembled-auth-runtime.mjs').read_bytes()
        self.assertEqual(runtime.count(new_pin), 1)
        self.assertEqual(runtime.replace(new_pin, old_pin), (before / 'assembled-auth-runtime.mjs').read_bytes())
        old_source = json.loads((before / 'assembled-native-source.json').read_bytes())
        new_source = json.loads((after / 'assembled-native-source.json').read_bytes())
        self.assertEqual(len(new_source['files']), 26)
        self.assertEqual(len(new_source['bootstrap']), 17)
        self.assertEqual(len(self.contract['additionalBootstrap']), 1)
        source_paths = {pin['path'] for pin in new_source['files']}
        extra_paths = {pin['path'] for pin in self.contract['additionalBootstrap']}
        self.assertEqual(len(source_paths | extra_paths), 27)
        self.assertEqual(len(runner.expected_sql(self.private)), 18)
        expected = {**old_source, 'candidateCommit': runner.CANDIDATE,
                    'candidateTree': runner.TREE, 'sourceObjects': new_source['sourceObjects']}
        self.assertEqual(expected, new_source)
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(ValueError): runner.unpack_capsule(self.stage_raw, Path(destination))
            self.assertEqual(list(Path(destination).iterdir()), [])

    def intent_fixture(self, folder):
        paths = ['/api/portfolio/holdings', '/api/personal-finance/cash-flow', '/api/consultation']
        for index, route in enumerate(paths, 1):
            value = {'sha': runner.CANDIDATE, 'path': route,
                     'body': {'clientToken': '00000000-0000-4000-8000-' + str(index).zfill(12)}}
            (folder / ('intent-' + str(index).zfill(3) + '.json')).write_text(json.dumps(value))
        return {'sha': runner.CANDIDATE, 'local': str(folder), 'id': 'assembled-member-admin-00000000-0000-4000-8000-000000000001',
                'migrations': runner.expected_sql(self.private)}

    def test_exact_applied_sql_and_three_distinct_product_intents_are_required(self):
        with tempfile.TemporaryDirectory() as folder:
            data = self.intent_fixture(Path(folder))
            result = runner.verify_native_state(data, self.private)
            self.assertEqual(result['financialPosts'], 2)
            self.assertEqual(result['consentPosts'], 1)
            data['migrations'] = data['migrations'][:-1]
            with self.assertRaises(ValueError): runner.verify_native_state(data, self.private)

    def test_replayed_token_or_extra_product_post_never_becomes_acceptance(self):
        for case in ['duplicate-token', 'extra-post', 'wrong-source']:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder); data = self.intent_fixture(directory)
                path = directory / 'intent-002.json'; value = json.loads(path.read_text())
                if case == 'duplicate-token': value['body']['clientToken'] = '00000000-0000-4000-8000-000000000001'
                if case == 'wrong-source': value['sha'] = 'b' * 40
                path.write_text(json.dumps(value))
                if case == 'extra-post': (directory / 'intent-004.json').write_text(json.dumps(value))
                with self.assertRaises(ValueError): runner.verify_native_state(data, self.private)

    def test_actual_sealed_browser_validator_and_strict_projection_offline(self):
        env = dict(os.environ)
        env['ASSEMBLED_TEST_SEALED_RUNTIME'] = str(self.capsule / 'overlay/scripts/testing/consultation-tickets/assembled-auth-runtime.mjs')
        result = subprocess.run([shutil.which('node'), '--test', str(HERE / 'receipt.test.mjs')], env=env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8') + result.stderr.decode('utf8'))
        output = result.stdout.decode('utf8')
        self.assertIn('tests 26', output)
        self.assertIn('pass 26', output)
        self.assertIn('fail 0', output)

    def test_failure_counts_attest_partial_sql_and_intents_without_claiming_effects(self):
        with tempfile.TemporaryDirectory() as folder:
            data = self.intent_fixture(Path(folder))
            data['migrations'] = data['migrations'][:2]
            with patch.object(runner, 'owned', return_value=None):
                values = runner.project_attested_counts(data, self.private)
            self.assertEqual(values, {'observedSqlAppliedCount': 2, 'observedProductPostIntents': 3,
                             'observedFinancialPostIntents': 2, 'observedConsentPostIntents': 1,
                             'observedOtherProductPostIntents': 0})
            self.assertNotIn('00000000', json.dumps(values))

    def test_missing_unattested_or_unreadable_views_do_not_become_zero(self):
        for data in [None, {}, {'sha': 'b' * 40}]:
            self.assertTrue(all(value is None for value in runner.project_attested_counts(data, self.private).values()))
        with tempfile.TemporaryDirectory() as folder:
            data = self.intent_fixture(Path(folder))
            with patch.object(runner.os, 'scandir', side_effect=PermissionError()):
                values = runner.project_attested_counts(data, self.private)
            self.assertEqual(values['observedSqlAppliedCount'], 18)
            self.assertIsNone(values['observedProductPostIntents'])
            (Path(folder) / 'intent-002.json').write_text('{incomplete')
            with patch.object(runner, 'owned', return_value=None):
                values = runner.project_attested_counts(data, self.private)
            self.assertIsNone(values['observedFinancialPostIntents'])

    def test_explicitly_observed_empty_intent_directory_is_distinct_from_missing(self):
        with tempfile.TemporaryDirectory() as folder:
            data = {'sha': runner.CANDIDATE, 'local': folder, 'migrations': []}
            values = runner.project_attested_counts(data, self.private)
            self.assertEqual(values['observedSqlAppliedCount'], 0)
            self.assertEqual(values['observedProductPostIntents'], 0)
        missing = runner.project_attested_counts(data, self.private)
        self.assertIsNone(missing['observedProductPostIntents'])

    def test_failure_projection_survives_cleanup_failure_and_never_promotes_fourteen_names(self):
        for cleanup_fails in [True, False]:
            with self.subTest(cleanup_fails=cleanup_fails), tempfile.TemporaryDirectory() as folder:
                workspace = Path(folder); private = workspace / 'private'; private.mkdir()
                shutil.copytree(self.capsule, private / 'capsule')
                native = workspace / 'native'; native.mkdir()
                data = self.intent_fixture(native)
                raw = '\n'.join('P03_ASSEMBLED_NATIVE_CHECK ' + json.dumps({'name': name, 'status': 'PASS', 'body': 'SYNTHETIC_PRIVATE_NEVER_FORWARD'}) for name in runner.OBSERVED_CHECKS)
                raw += '\nP03_ASSEMBLED_FAILURE ' + json.dumps({'reason': 'playwright_timeout', 'body': 'SYNTHETIC_PRIVATE_NEVER_FORWARD'})
                (private / 'native.log').write_bytes(raw.encode())
                state = {'binding': {'synthetic': True}, 'stage': 'EXECUTED', 'attempted': True,
                         'exitCode': 1, 'fallbackUsed': cleanup_fails}
                error = ValueError('assembled_docker_cleanup_unconfirmed')
                with patch.object(runner, 'actual_context', return_value=state['binding']), \
                     patch.object(runner, 'paths', return_value=(workspace, workspace, private, workspace / 'app')), \
                     patch.object(runner, 'load_state', return_value=state), \
                     patch.object(runner, 'cleanup', side_effect=error if cleanup_fails else None, return_value=data), \
                     patch.object(runner, 'native_state', return_value=data), \
                     patch.object(runner, 'owned', return_value=None), \
                     patch.object(runner, 'command', side_effect=AssertionError('no process/network expected')):
                    with self.assertRaises(ValueError): runner.finalize()
                public = json.loads((workspace / 'assembled-native-artifact/receipt.json').read_text())
                self.assertEqual(public['status'], 'FAIL_NATIVE_NOT_ACCEPTED')
                self.assertEqual(public['ownedCleanupReadback'], 'UNCONFIRMED' if cleanup_fails else 'CONFIRMED')
                diag = public['failureDiagnostics']
                self.assertEqual(diag['actualExitCode'], 1)
                self.assertFalse(diag['timedOutOrInterrupted'])
                self.assertEqual(diag['fallbackUsed'], cleanup_fails)
                self.assertEqual(len(diag['observedPassedChecks']), 14)
                self.assertEqual(diag['nativeFailureCode'], 'playwright_timeout')
                self.assertEqual(diag['observedProductPostIntents'], 3)
                self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(public))
                self.assertEqual(public['privateLogSha256'], hashlib.sha256(raw.encode()).hexdigest())


class FailureLog(unittest.TestCase):
    def test_literal_codes_and_only_the_fixed_check_names_survive_projection(self):
        raw = ('P03_ASSEMBLED_NATIVE_CHECK ' + json.dumps({'name': runner.OBSERVED_CHECKS[0], 'status': 'PASS', 'url': 'https://synthetic.invalid/private'})
               + '\nP03_ASSEMBLED_NATIVE_CHECK ' + json.dumps({'name': 'SYNTHETIC_PRIVATE_NAME', 'status': 'PASS'})
               + '\nP03_ASSEMBLED_FAILURE ' + json.dumps({'reason': 'assembled_member_http_status', 'token': 'SYNTHETIC_PRIVATE_TOKEN'})).encode()
        result = runner.project_failure_log(raw)
        self.assertEqual(result['observedPassedChecks'], [runner.OBSERVED_CHECKS[0]])
        self.assertEqual(result['lastObservedPassedCheck'], runner.OBSERVED_CHECKS[0])
        self.assertEqual(result['nativeFailureCode'], 'assembled_member_http_status')
        self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(result))
        self.assertNotIn('https:', json.dumps(result))

    def test_unknown_or_regex_lookalike_errors_are_not_raw_public_codes(self):
        for reason in ['assembled_private_unknown_payload', 'pf10_native_private_unknown_payload',
                       'https://synthetic.invalid/private', {'body': 'SYNTHETIC_PRIVATE'}]:
            raw = ('P03_ASSEMBLED_FAILURE ' + json.dumps({'reason': reason})).encode()
            self.assertIsNone(runner.project_failure_log(raw)['nativeFailureCode'])
        self.assertEqual(runner.static_controller_error(ValueError('assembled_private_unknown_payload'), 'assembled_finalization_failed'), 'assembled_finalization_failed')
        self.assertEqual(runner.static_native_error('p03_legacy_page_ready_not_ready'), 'p03_legacy_page_ready')
        self.assertIsNone(runner.static_native_error('p03_legacy_page_ready_private_payload'))

    def test_missing_duplicate_and_malformed_records_keep_explicit_uncertainty(self):
        self.assertIsNone(runner.project_failure_log(None)['observedPassedChecks'])
        self.assertEqual(runner.project_failure_log(b'')['observedPassedChecks'], [])
        line = 'P03_ASSEMBLED_NATIVE_CHECK ' + json.dumps({'name': runner.OBSERVED_CHECKS[0], 'status': 'PASS'})
        result = runner.project_failure_log((line + '\n' + line + '\nP03_ASSEMBLED_FAILURE {bad').encode())
        self.assertEqual(len(result['observedPassedChecks']), 1)
        self.assertTrue(result['duplicatePassRecords'])
        self.assertTrue(result['malformedLogRecords'])
        self.assertIsNone(result['nativeFailureCode'])
        raw = '\n'.join('P03_ASSEMBLED_FAILURE ' + json.dumps({'reason': code}) for code in ['playwright_timeout', 'selector_ambiguous'])
        self.assertIsNone(runner.project_failure_log(raw.encode())['nativeFailureCode'])

    def test_missing_flags_and_attestation_are_null_not_guessed_defaults(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            with patch.object(runner, 'native_state', side_effect=ValueError('assembled_native_owner_marker')):
                result, raw = runner.failure_observation({'stage': 'STARTING'}, path, path)
            self.assertIsNone(raw)
            for key in ['actualExitCode', 'timedOutOrInterrupted', 'fallbackUsed', 'observedSqlAppliedCount', 'observedProductPostIntents']:
                self.assertIsNone(result[key])
            with patch.object(runner, 'native_state', return_value=None):
                result, _ = runner.failure_observation({'stage': 'EXECUTED', 'exitCode': -9}, path, path)
            self.assertEqual(result['actualExitCode'], -9)
            self.assertIsNone(result['timedOutOrInterrupted'])
            with patch.object(runner, 'native_state', return_value=None):
                result, _ = runner.failure_observation({'stage': 'EXECUTED', 'exitCode': 1,
                    'timedOutOrInterrupted': 'SYNTHETIC_PRIVATE_INVALID_FLAG'}, path, path)
            self.assertIsNone(result['timedOutOrInterrupted'])
            self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(result))


class ChromeObservation(unittest.TestCase):
    def metadata(self, raw, **changes):
        values = dict(st_dev=1, st_ino=2, st_mode=stat.S_IFREG | 0o755,
                      st_size=len(raw), st_mtime_ns=3, st_ctime_ns=4)
        return SimpleNamespace(**(values | changes))

    def filesystem(self, stack, raw, *, metadata=None, stats=None):
        metadata = metadata or self.metadata(raw)
        stack.enter_context(patch.object(runner.Path, 'lstat', return_value=metadata))
        opened = stack.enter_context(patch.object(runner.os, 'open', return_value=17))
        stack.enter_context(patch.object(runner.os, 'O_NOFOLLOW', 0x20000, create=True))
        stack.enter_context(patch.object(runner.os, 'O_NONBLOCK', 0x800, create=True))
        stack.enter_context(patch.object(runner.os, 'fstat', side_effect=stats or None, return_value=metadata))
        stack.enter_context(patch.object(runner.os, 'read', side_effect=[raw, b'']))
        closed = stack.enter_context(patch.object(runner.os, 'close'))
        return opened, closed

    def test_missing_unreadable_and_symlink_never_execute_or_hash_a_target(self):
        for failure, error, exists in [(FileNotFoundError(), 'MISSING', False),
                                       (PermissionError('SYNTHETIC_PRIVATE'), 'UNREADABLE', None)]:
            with self.subTest(error=error), patch.object(runner.Path, 'lstat', side_effect=failure), \
                 patch.object(runner.os, 'open') as opened, patch.object(runner.subprocess, 'run') as process:
                value = runner.observe_chrome()
                self.assertEqual(value['readError'], error)
                self.assertIs(value['exists'], exists)
                self.assertIsNone(value['observedSha256'])
                opened.assert_not_called(); process.assert_not_called()
        with patch.object(runner.Path, 'lstat', return_value=self.metadata(b'x', st_mode=stat.S_IFLNK | 0o777)), \
             patch.object(runner.os, 'open') as opened, patch.object(runner.subprocess, 'run') as process:
            value = runner.observe_chrome()
            self.assertFalse(value['noSymlink'])
            self.assertEqual(value['readError'], 'UNSAFE_TYPE')
            opened.assert_not_called(); process.assert_not_called()

    def test_mismatched_bytes_are_observed_but_never_executed_even_for_version(self):
        with ExitStack() as stack:
            opened, closed = self.filesystem(stack, b'unreviewed')
            process = stack.enter_context(patch.object(runner.subprocess, 'run'))
            stack.enter_context(patch.dict(os.environ, {'ImageVersion': '20261101.360.1',
                                                       'OPENAI_API_KEY': 'SYNTHETIC_PRIVATE'}, clear=True))
            value = runner.observe_chrome()
            self.assertEqual(value['observedSha256'], hashlib.sha256(b'unreviewed').hexdigest())
            self.assertFalse(value['matchesReviewedSha'])
            self.assertIsNone(value['chromeVersion'])
            self.assertEqual(value['runnerImageVersion'], '20261101.360.1')
            self.assertFalse(value['runnerImageVersionAttested'])
            self.assertTrue(opened.call_args.args[1] & runner.os.O_NOFOLLOW)
            closed.assert_called_once_with(17); process.assert_not_called()
            self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(value))

    def test_version_executes_only_reviewed_fd_and_emits_only_typed_version(self):
        for stdout, expected in [(b'Google Chrome 150.0.7000.1\n', '150.0.7000.1'),
                                 (b'Google Chrome 150.0.7000.1 SYNTHETIC_PRIVATE', None)]:
            with self.subTest(stdout=stdout), ExitStack() as stack:
                self.filesystem(stack, b'reviewed')
                stack.enter_context(patch.object(runner, 'CHROME', hashlib.sha256(b'reviewed').hexdigest()))
                process = stack.enter_context(patch.object(runner.subprocess, 'run',
                                                           return_value=SimpleNamespace(returncode=0, stdout=stdout)))
                value = runner.observe_chrome()
                self.assertEqual(value['chromeVersion'], expected)
                self.assertEqual(process.call_args.args[0], [str(runner.CHROME_PATH), '--version'])
                self.assertEqual(process.call_args.kwargs['executable'], '/proc/self/fd/17')
                self.assertEqual(process.call_args.kwargs['pass_fds'], (17,))
                self.assertEqual(set(process.call_args.kwargs['env']), {'PATH', 'LANG', 'LC_ALL'})
                self.assertEqual(process.call_args.kwargs['timeout'], 3)
                self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(value))

    def test_changed_identity_or_size_never_emits_a_digest_or_version(self):
        for change in [dict(st_ino=99), dict(st_size=8), dict(st_mtime_ns=99)]:
            with self.subTest(change=change), ExitStack() as stack:
                original = self.metadata(b'read')
                self.filesystem(stack, b'read', stats=[original, self.metadata(b'read', **change)])
                process = stack.enter_context(patch.object(runner.subprocess, 'run'))
                value = runner.observe_chrome()
                self.assertEqual(value['readError'], 'CHANGED_DURING_READ')
                self.assertIsNone(value['observedSha256'])
                self.assertIsNone(value['chromeVersion']); process.assert_not_called()

    def test_untrusted_fields_cannot_become_image_attestation_or_raw_public_output(self):
        value = runner.project_chrome_observation({'schemaVersion': 'chrome-runner-observation.v1',
                    'exists': 'true', 'isRegular': 1, 'noSymlink': [], 'knownFixedPath': {'private': True},
                    'observedSha256': 'SYNTHETIC_PRIVATE', 'matchesReviewedSha': True,
                    'chromeVersion': 'SYNTHETIC_PRIVATE', 'runnerImageVersion': '20261101.360.1/private',
                    'runnerImageVersionAttested': True, 'readError': {'private': True}, 'raw': 'SYNTHETIC_PRIVATE'})
        self.assertTrue(all(value[key] is None for key in ['exists', 'isRegular', 'noSymlink', 'knownFixedPath',
                                                          'observedSha256', 'matchesReviewedSha', 'chromeVersion', 'runnerImageVersion']))
        self.assertFalse(value['runnerImageVersionAttested'])
        self.assertEqual(value['readError'], 'UNREADABLE')
        self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(value))
        self.assertIsNone(runner.project_chrome_observation(None))

    def test_capture_is_bound_to_preparing_not_a_native_attempt(self):
        for stage in ['PREPARING', 'EXECUTED']:
            state = {'binding': {'synthetic': True}, 'stage': stage, 'attempted': stage != 'PREPARING'}
            with patch.object(runner, 'actual_context', return_value=state['binding']), \
                 patch.object(runner, 'paths', return_value=(None, None, Path('/synthetic'), None)), \
                 patch.object(runner, 'load_state', return_value=state), \
                 patch.object(runner, 'observe_chrome', return_value={'synthetic': True}) as observe, \
                 patch.object(runner, 'private_json') as write:
                runner.capture_chrome_prepare_failure()
                self.assertEqual(observe.call_count, int(stage == 'PREPARING'))
                self.assertEqual(write.call_count, int(stage == 'PREPARING'))

    def test_prepare_failure_receipt_projects_observation_without_promoting_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            workspace = Path(folder); private = workspace / 'private'; private.mkdir()
            state = {'binding': {'synthetic': True}, 'stage': 'PREPARING', 'attempted': False,
                     'fallbackUsed': False, 'chromePreflight': {
                         'schemaVersion': 'chrome-runner-observation.v1', 'knownFixedPath': True,
                         'exists': True, 'isRegular': True, 'noSymlink': True,
                         'observedSha256': 'a' * 64, 'chromeVersion': 'SYNTHETIC_PRIVATE',
                         'runnerImageVersion': '20261101.360.1', 'runnerImageVersionAttested': True,
                         'readError': 'NONE', 'raw': 'SYNTHETIC_PRIVATE'}}
            with patch.object(runner, 'actual_context', return_value=state['binding']), \
                 patch.object(runner, 'paths', return_value=(workspace, workspace, private, workspace / 'app')), \
                 patch.object(runner, 'load_state', return_value=state), \
                 patch.object(runner, 'cleanup', return_value=None), \
                 patch.object(runner, 'native_state', return_value=None), \
                 patch.object(runner, 'command', side_effect=AssertionError('no native/network')):
                with self.assertRaises(ValueError): runner.finalize()
            public = json.loads((workspace / 'assembled-native-artifact/receipt.json').read_bytes())
            self.assertEqual(public['status'], 'FAIL_NATIVE_NOT_ACCEPTED')
            self.assertFalse(public['nativeAttempted'])
            self.assertEqual(public['ownedCleanupReadback'], 'CONFIRMED')
            self.assertIsNone(public['failureDiagnostics']['observedProductPostIntents'])
            chrome = public['failureDiagnostics']['chromePreflight']
            self.assertEqual(chrome['observedSha256'], 'a' * 64)
            self.assertIsNone(chrome['chromeVersion'])
            self.assertFalse(chrome['runnerImageVersionAttested'])
            self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(public))

    def test_diagnostic_context_binds_head_event_job_and_receives_no_native_authority(self):
        with tempfile.TemporaryDirectory() as folder:
            event = Path(folder) / 'event.json'
            event.write_text(json.dumps({'inputs': {'reviewed_source_sha': 'a' * 40}}))
            env = synthetic_env() | {'GITHUB_JOB': 'runner-observation', 'GITHUB_EVENT_PATH': str(event),
                                     'RUNNER_OBSERVATION_REVIEWED_SHA': 'a' * 40}
            observed = {'runnerImageVersion': '20261101.360.1'}
            def git_result(repo, *args):
                return 'a' * 40 if args[0] == 'rev-parse' else 'https://github.com/' + runner.REPOSITORY
            for changes, valid in [({}, True), ({'GITHUB_JOB': 'assembled-native-bounded'}, False),
                                   ({'GITHUB_SHA': 'b' * 40}, False), ({'GITHUB_RUN_ATTEMPT': '2'}, False)]:
                with self.subTest(changes=changes), patch.dict(os.environ, env | changes, clear=True), \
                     patch.object(runner.sys, 'platform', 'linux'), patch.object(runner, 'git', side_effect=git_result), \
                     patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout=b'')), \
                     patch.object(runner, 'observe_chrome', return_value=observed) as observe:
                    if valid:
                        value = runner.runner_observation()
                        self.assertEqual(value['status'], 'OBSERVATION_ONLY_NOT_NATIVE_ACCEPTANCE')
                        self.assertFalse(value['nativeAttempted'])
                        self.assertEqual(value['binding']['sourceCommit'], 'a' * 40)
                        self.assertFalse(value['binding']['runnerImageVersionAttested'])
                    else:
                        with self.assertRaises(ValueError): runner.runner_observation()
                        observe.assert_not_called()

    def test_diagnostic_workflow_is_dispatch_only_and_has_no_financial_or_install_steps(self):
        workflow = (HERE.parents[2] / '.github/workflows/assembled-native-runner-observation.yml').read_text()
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('persist-credentials: false', workflow)
        self.assertIn('ref: ${{ github.sha }}', workflow)
        self.assertIn('contents: read', workflow)
        self.assertIn('run.py observe-runner', workflow)
        for forbidden in ['pull_request:', 'push:', 'needs:', 'secrets.', 'npm ', 'docker ', 'run.py prepare',
                          'run.py execute', 'run.py finalize', 'setup-node', 'apt-get', 'PASS_BOUNDED_ASSEMBLED_NATIVE']:
            self.assertNotIn(forbidden, workflow)


class StageProjection(unittest.TestCase):
    @staticmethod
    def marker(name, edge):
        return 'P03_ASSEMBLED_STAGE ' + json.dumps({'stage': name, 'edge': edge})

    def test_missing_empty_and_old_logs_are_not_invented_stages(self):
        self.assertEqual(runner.project_stage_log(None)['stageReadback'], 'MISSING')
        for raw in [b'', b'old run has no stage records', b'P03_ASSEMBLED_FAILURE {"reason":"playwright_timeout"}']:
            value = runner.project_stage_log(raw)
            self.assertEqual(value['stageReadback'], 'NO_STAGE_RECORDS')
            self.assertIsNone(value['lastObservedStage'])
            self.assertFalse(value['malformedStageRecords'])
        self.assertEqual(runner.project_stage_log('SYNTHETIC_PRIVATE')['stageReadback'], 'UNAVAILABLE_OR_TOO_LARGE')

    def test_nested_failure_preserves_incomplete_leaf_without_claiming_completion(self):
        raw = '\n'.join([self.marker('legacy-open', 'before'), self.marker('legacy-context', 'before'),
                         self.marker('legacy-context', 'after'), self.marker('legacy-document', 'before')]).encode()
        value = runner.project_stage_log(raw)
        self.assertEqual(value['lastObservedStage'], 'legacy-document')
        self.assertEqual(value['lastObservedStageEdge'], 'before')
        self.assertFalse(value['malformedStageRecords'])
        complete = runner.project_stage_log((self.marker('rest-own', 'before') + '\n' + self.marker('rest-own', 'after')).encode())
        self.assertEqual(complete['lastObservedStageEdge'], 'after')

    def test_unknown_payload_extra_duplicate_or_out_of_order_markers_fail_closed(self):
        invalid = [
            'P03_ASSEMBLED_STAGE {"stage":"rest-unknown-private","edge":"before"}',
            'P03_ASSEMBLED_STAGE {"stage":"rest-own","edge":"SYNTHETIC_PRIVATE"}',
            'P03_ASSEMBLED_STAGE {"stage":"rest-own","edge":"before","url":"https://private.invalid"}',
            'P03_ASSEMBLED_STAGE {"stage":"SYNTHETIC_PRIVATE","stage":"rest-own","edge":"before"}',
            'P03_ASSEMBLED_STAGE {bad', self.marker('rest-own', 'after'),
            self.marker('rest-own', 'before') + '\n' + self.marker('rest-foreign', 'after'),
            '\n'.join([self.marker('legacy-open', 'before')] * 17),
        ]
        for raw in invalid:
            with self.subTest(raw=raw):
                value = runner.project_stage_log(raw.encode())
                self.assertEqual(value['stageReadback'], 'UNVERIFIED_STAGE_RECORD')
                self.assertIsNone(value['lastObservedStage'])
                self.assertIsNone(value['lastObservedStageEdge'])
                self.assertTrue(value['malformedStageRecords'])
                self.assertNotIn('private', json.dumps(value).lower())

    def test_stage_records_do_not_become_checks_or_change_existing_error_projection(self):
        old = ('P03_ASSEMBLED_NATIVE_CHECK ' + json.dumps({'name': runner.OBSERVED_CHECKS[0], 'status': 'PASS'})
               + '\nP03_ASSEMBLED_FAILURE {"reason":"playwright_timeout"}').encode()
        annotated = (self.marker('rest-own', 'before') + '\n').encode() + old
        self.assertEqual(runner.project_failure_log(old), runner.project_failure_log(annotated))
        self.assertEqual(runner.project_failure_log(annotated)['observedPassedChecks'], [runner.OBSERVED_CHECKS[0]])
        self.assertEqual(runner.static_native_error('assembled_stage_invalid'), 'assembled_stage_invalid')
        self.assertIsNone(runner.static_native_error('assembled_stage_private_payload'))

    def test_failure_only_integration_keeps_exit_counts_and_original_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder)
            raw = (self.marker('rest-own', 'before') + '\nP03_ASSEMBLED_FAILURE {"reason":"playwright_timeout"}').encode()
            (private / 'native.log').write_bytes(raw)
            state = {'stage': 'EXECUTED', 'exitCode': 1, 'fallbackUsed': False}
            with patch.object(runner, 'owned', return_value=None), patch.object(runner, 'native_state', return_value=None):
                value, captured = runner.failure_observation(state, private, private)
            self.assertEqual(captured, raw)
            self.assertEqual(value['actualExitCode'], 1)
            self.assertEqual(value['nativeFailureCode'], 'playwright_timeout')
            self.assertEqual(value['lastObservedStage'], 'rest-own')
            self.assertEqual(value['lastObservedStageEdge'], 'before')
            self.assertIsNone(value['observedProductPostIntents'])
            self.assertEqual(value['observedPassedChecks'], [])

    def test_actual_sealed_emitter_and_projector_share_fixed_table(self):
        with tarfile.open(HERE / 'sealed-v3-stage-observation.tar') as archive:
            source = archive.extractfile('overlay/scripts/testing/consultation-tickets/assembled-member-scenario.mjs').read().decode('utf8')
        table = json.loads(re.search(r'assembledStageNames = Object.freeze\((\[.*?\])\);', source, re.S).group(1))
        self.assertEqual(tuple(table), runner.OBSERVED_STAGES)
        self.assertEqual(len(set(table)), 33)

    def test_existing_chrome_app_tree_and_fourteen_native_checks_are_pinned(self):
        self.assertEqual(runner.CHROME, '95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72')
        self.assertEqual(runner.CANDIDATE, 'f07e0543c46cea88822dc0d400080b5bb94bef91')
        self.assertEqual(runner.TREE, '8e43eab0bd66705b5455713ea15dd5c1d9c5f81a')
        self.assertEqual(len(set(runner.OBSERVED_CHECKS)), 14)


class Workflow(unittest.TestCase):
    def test_success_criteria_private_flags_and_frame_remain_frozen(self):
        receipt = (HERE / 'receipt.mjs').read_text(encoding='utf8')
        literal = re.search(r'export const checks = Object\.freeze\(\[(.*?)\]\);', receipt, re.S).group(1)
        self.assertEqual(tuple(re.findall(r"'([^']+)'", literal)), runner.OBSERVED_CHECKS)
        self.assertEqual(len(set(runner.OBSERVED_CHECKS)), 14)
        tree = ast.parse((HERE / 'run.py').read_text(encoding='utf8'))
        # The sole authorized execution-frame delta is the reviewed capsule filename.
        prepare = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'prepare')
        filenames = [node for node in ast.walk(prepare) if isinstance(node, ast.Constant)
                     and node.value == 'sealed-v4b-app-f07.tar']
        self.assertEqual(len(filenames), 1)
        filenames[0].value = 'sealed-v2.tar'
        names = {'context', 'actual_context', 'paths', 'private_json', 'safe_env', 'expected_sql',
                 'prepare', 'load_state', 'execute', 'native_state', 'owned_docker_resource', 'cleanup',
                 'verify_native_state', 'write_outcome_unknown', 'claim_execution', 'stop_child'}
        parts = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
        final = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'finalize')
        parts.append(next(node for node in final.body if isinstance(node, ast.Try)).body)
        parts.append(next(node for node in final.body if isinstance(node, ast.Assign)
                          and any(isinstance(target, ast.Name) and target.id == 'report' for target in node.targets)))
        text = repr([ast.dump(node, include_attributes=False) if isinstance(node, ast.AST)
                     else [ast.dump(child, include_attributes=False) for child in node] for node in parts])
        self.assertEqual(hashlib.sha256(text.encode()).hexdigest(), '23c8a3ff905dc217178b10d13ae335892d38a28eea64e0e7f3da455c7028b5d3')

    def test_ordinary_five_jobs_are_byte_equivalent_and_optional_job_is_explicit(self):
        text = (HERE.parents[2] / '.github/workflows/ci.yml').read_text(encoding='utf8')
        normal = text.split('jobs:\n', 1)[1].split('\n  # Optional native execution', 1)[0].rstrip() + '\n'
        self.assertEqual(hashlib.sha256(normal.encode()).hexdigest(), '15804e4906da441cfbd4926c77566ad9989777c65022d850075cdd261bd60d73')
        optional = text.split('  assembled-native-bounded:', 1)[1]
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.assembled_native == true", optional)
        self.assertIn('persist-credentials: false', optional)
        self.assertIn('path: assembled-native-artifact/receipt.json', optional)
        self.assertNotIn('secrets.', optional)
        self.assertNotIn('CI: true', optional)
        self.assertNotIn('GITHUB_ACTIONS: true', optional)
        self.assertNotIn('tee ', optional)


if __name__ == '__main__':
    unittest.main()
