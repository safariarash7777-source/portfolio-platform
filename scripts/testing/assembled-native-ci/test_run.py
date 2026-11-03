"""Offline contract tests only. No native, Docker, Auth, CI impersonation or network."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
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


class CleanupOwnership(unittest.TestCase):
    def setUp(self):
        self.run = 'assembled-member-admin-00000000-0000-4000-8000-000000000001'
        self.row = {'Id': 'a' * 64, 'Name': '/' + self.run + '-db', 'Config': {'Labels': {runner.LABEL: self.run}}}

    def test_exact_owned_resource_is_selected_by_full_inspected_id(self):
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
        cls.raw = (HERE / 'sealed-v2.tar').read_bytes()
        cls.contract = runner.unpack_capsule(cls.raw, cls.capsule)

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

    def intent_fixture(self, folder):
        paths = ['/api/portfolio/holdings', '/api/personal-finance/cash-flow', '/api/consultation']
        for index, route in enumerate(paths, 1):
            value = {'sha': runner.CANDIDATE, 'path': route,
                     'body': {'clientToken': '00000000-0000-4000-8000-' + str(index).zfill(12)}}
            (folder / ('intent-' + str(index).zfill(3) + '.json')).write_text(json.dumps(value))
        return {'local': str(folder), 'id': 'assembled-member-admin-00000000-0000-4000-8000-000000000001',
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
        self.assertIn('tests 25', output)
        self.assertIn('pass 25', output)
        self.assertIn('fail 0', output)


class Workflow(unittest.TestCase):
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
