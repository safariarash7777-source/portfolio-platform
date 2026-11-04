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
from unittest.mock import patch, Mock
import contextlib

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
                historical_checks = ['isolation-attested', 'four-fresh-auth-users-and-sdk-getuser', 'assembled-financial-receipts-and-null-readback', 'assembled-consent-and-authorized-version-basis', 'immutable-source-default-closed', 'assembled-real-member-navigation-and-read-only-dom', 'actual-sdk-same-jwt-own-versus-foreign-rls', 'expired-source-unverified-dom', 'active-source-unverified-dom', 'revoked-source-unverified-dom', 'advisor-other-client-zero-side-get', 'actual-sdk-identity-clear', 'actual-sdk-signout-clear', 'private-storage-url-and-owned-cleanup']
                self.assertEqual(diag['observedPassedChecks'],
                                 ['browser-owned-nonzero-dossier-real-consent'] + historical_checks)
                self.assertEqual(len(diag['observedPassedChecks']), 15)
                self.assertEqual(diag['observedPassedChecks'][0], 'browser-owned-nonzero-dossier-real-consent')
                self.assertEqual(diag['observedPassedChecks'][1:], historical_checks)
                self.assertEqual(diag['nativeFailureCode'], 'playwright_timeout')
                self.assertEqual(diag['observedProductPostIntents'], 3)
                self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(public))
                self.assertEqual(public['privateLogSha256'], hashlib.sha256(raw.encode()).hexdigest())


class FailureLog(unittest.TestCase):
    def test_default_prepare_status_exact_local_binding_and_redaction(self):
        candidate=runner.COMPOSITION_SPEC['application']
        data={'sha':candidate,'local':'synthetic-owned','id':'synthetic-owned-run'}
        observation={'stageReadback':'OBSERVED','malformedStageRecords':False,'lastObservedStage':'composition-default-prepare','lastObservedStageEdge':'before'}
        intent={'sha':candidate,'path':'/api/consultation/ticket-attempts','body':{'contractVersion':'consultation-ticket-request.v1','clientToken':'synthetic-token','expectedActorId':'synthetic-actor','command':{'kind':'open'},'secret':'SYNTHETIC_PRIVATE'}}
        result={'sha':candidate,'path':intent['path'],'ordinal':12,'status':503}
        def read(rows):return lambda local,name:(rows[name],'unused')
        with patch.object(runner,'SELECTED_PROFILE',runner.COMPOSITION),patch.object(runner,'CANDIDATE',candidate):
            body=json.dumps(intent['body']);binding={'schema':'p03-composition-binding.v1','appSha':candidate,'appTree':runner.COMPOSITION_SPEC['tree'],'runId':data['id'],'databaseMarker':data['id'],'local':data['local'],'profile':'consultation-ticket','transportInitial':{'authorizedPostRequests':8,'poisoned':False},'authCreatedIds':['synthetic-actor']}
            admission={'kind':'intent','ordinal':4,'actor':'a','path':intent['path'],'body':body,'bodySha256':hashlib.sha256(body.encode()).hexdigest(),'token':'synthetic-token'}
            rows={'composition-binding.json':binding,'composition-intent-004.json':admission,'intent-012.json':intent,'transport-result-012.json':result}
            for status in [100,200,401,500,503,599]:
                with patch.object(runner,'composition_read',side_effect=read({**rows,'transport-result-012.json':{**result,'status':status}})) as reader:
                    out=runner.project_default_prepare_status(data,observation)
                    self.assertEqual(out,status);self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(out))
                    self.assertEqual([call.args[1] for call in reader.call_args_list],['composition-binding.json','composition-intent-004.json','intent-012.json','transport-result-012.json'])
            for key,bad in [('ordinal',11),('ordinal',True),('ordinal','12'),('sha','0'*40),('path','/api/consultation/tickets'),('status',True),('status','503'),('status',99),('status',600)]:
                with patch.object(runner,'composition_read',side_effect=read({**rows,'transport-result-012.json':{**result,key:bad}})):
                    self.assertIsNone(runner.project_default_prepare_status(data,observation))
            for bad in [{**intent,'sha':'0'*40},{**intent,'path':'/wrong'},{**intent,'extra':'SYNTHETIC_PRIVATE'},{**intent,'body':None}]:
                with patch.object(runner,'composition_read',side_effect=read({**rows,'intent-012.json':bad})):
                    self.assertIsNone(runner.project_default_prepare_status(data,observation))
            for bad in [{**binding,'runId':'other'},{**binding,'local':'other'},{**binding,'transportInitial':{'authorizedPostRequests':True,'poisoned':False}},{**binding,'transportInitial':{'authorizedPostRequests':9,'poisoned':False}},{**binding,'authCreatedIds':[]}]:
                with patch.object(runner,'composition_read',side_effect=read({**rows,'composition-binding.json':bad})):
                    self.assertIsNone(runner.project_default_prepare_status(data,observation))
            for bad in [{**admission,'ordinal':3},{**admission,'actor':'owner'},{**admission,'bodySha256':'0'*64},{**admission,'token':'wrong'}]:
                with patch.object(runner,'composition_read',side_effect=read({**rows,'composition-intent-004.json':bad})):
                    self.assertIsNone(runner.project_default_prepare_status(data,observation))
            for missing in rows:
                with patch.object(runner,'composition_read',side_effect=read({k:v for k,v in rows.items() if k!=missing})):
                    self.assertIsNone(runner.project_default_prepare_status(data,observation))
            with patch.object(runner,'composition_read',side_effect=PermissionError('SYNTHETIC_PRIVATE')):
                self.assertIsNone(runner.project_default_prepare_status(data,observation))
    def test_default_prepare_status_requires_verified_stage_and_current_owner_before_read(self):
        candidate=runner.COMPOSITION_SPEC['application'];good={'stageReadback':'OBSERVED','malformedStageRecords':False,'lastObservedStage':'composition-default-prepare','lastObservedStageEdge':'before'}
        with patch.object(runner,'SELECTED_PROFILE',runner.COMPOSITION),patch.object(runner,'CANDIDATE',candidate),patch.object(runner,'composition_read',side_effect=AssertionError('must not read')):
            for data,obs in [(None,good),({'sha':'0'*40},good),({'sha':candidate},{}),({'sha':candidate},{**good,'lastObservedStageEdge':'after'}),({'sha':candidate},{**good,'malformedStageRecords':True})]:
                self.assertIsNone(runner.project_default_prepare_status(data,obs))
            with patch.object(runner,'SELECTED_PROFILE','assembled-member-admin-v1'):
                self.assertIsNone(runner.project_default_prepare_status({'sha':candidate},good))

    def test_default_prepare_static_callchain_codes_are_exact_and_redacted(self):
        codes=['p03_composition_shared_admission_stopped', 'p03_composition_stopped', 'p03_composition_result_shape', 'p03_composition_result_binding', 'p03_composition_journal_failed_stop', 'p03_composition_transport_poisoned', 'p03_composition_transport_rejection_journal_failed']
        for code in codes:
            raw=('P03_ASSEMBLED_FAILURE '+json.dumps({'reason':code,'body':'SYNTHETIC_PRIVATE_NEVER_FORWARD','token':'SYNTHETIC_PRIVATE_TOKEN'})).encode()
            result=runner.project_failure_log(raw)
            self.assertEqual(result['nativeFailureCode'],code)
            self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(result))
            for unknown in [code+'_SYNTHETIC_PRIVATE',code.upper(),{'reason':code},None]:
                value=runner.project_failure_log(('P03_ASSEMBLED_FAILURE '+json.dumps({'reason':unknown})).encode())
                self.assertIsNone(value['nativeFailureCode'])
                self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(value))
        duplicate=('P03_ASSEMBLED_FAILURE '+json.dumps({'reason':codes[0]})+'\n')*2
        value=runner.project_failure_log(duplicate.encode())
        self.assertIsNone(value['nativeFailureCode']);self.assertTrue(value['malformedLogRecords'])

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
        self.assertEqual(tuple(table), runner.OBSERVED_STAGES[6:])
        self.assertEqual(len(runner.OBSERVED_STAGES),len(table)+6)
        self.assertEqual(runner.OBSERVED_STAGES[:6],('composition-financial-before-write', 'composition-context-binding', 'composition-fixture-apply', 'composition-fixture-binding', 'composition-default-prepare', 'composition-default-page'))
        self.assertEqual(len(set(table)), 33)

    def test_existing_chrome_app_tree_and_fourteen_native_checks_are_pinned(self):
        self.assertEqual(runner.CHROME, '95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72')
        self.assertEqual(runner.CANDIDATE, 'f07e0543c46cea88822dc0d400080b5bb94bef91')
        self.assertEqual(runner.TREE, '8e43eab0bd66705b5455713ea15dd5c1d9c5f81a')
        self.assertEqual(len(set(runner.OBSERVED_CHECKS[1:])), 14)
        self.assertEqual(runner.OBSERVED_CHECKS[0], "browser-owned-nonzero-dossier-real-consent")
        self.assertEqual(len(runner.OBSERVED_CHECKS),15)


class Workflow(unittest.TestCase):
    def test_success_criteria_private_flags_and_frame_remain_frozen(self):
        receipt = (HERE / 'receipt.mjs').read_text(encoding='utf8')
        literal = re.search(r'export const checks = Object\.freeze\(\[(.*?)\]\);', receipt, re.S).group(1)
        self.assertEqual(tuple(re.findall(r"'([^']+)'", literal)), runner.OBSERVED_CHECKS[1:])
        self.assertEqual(len(set(runner.OBSERVED_CHECKS[1:])), 14)
        self.assertEqual(runner.OBSERVED_CHECKS[0], "browser-owned-nonzero-dossier-real-consent")
        self.assertEqual(len(runner.OBSERVED_CHECKS),15)
        historical = (HERE / 'fixtures/run-d253.py.txt').read_bytes()
        self.assertEqual(hashlib.sha256(historical).hexdigest(), '097ed514103524b5cfb1df9c82a690752e39652639504178c1c971c5ad654153')
        tree = ast.parse(historical.decode('utf8'))
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

    def test_ordinary_offline_step_has_exact_shape_and_no_runtime_authority(self):
        text = (HERE.parents[2] / '.github/workflows/ci.yml').read_text(encoding='utf8')
        # Match a complete step up to its next sibling, not merely a substring.
        name = '      - name: Assembled offline source contracts'
        self.assertEqual(text.splitlines().count(name), 1)
        tail = text.split(name + '\n', 1)[1]
        block = tail.split('\n      - ', 1)[0]
        body = '\n'.join(line for line in block.splitlines() if line.strip() and not line.lstrip().startswith('#'))
        self.assertEqual(body, '        run: python3 scripts/testing/assembled-native-ci/test_run.py')
        # This exact step must belong to the existing quality job, before its next job.
        lines = text.splitlines(); index = lines.index(name)
        job = next(line for line in reversed(lines[:index]) if re.fullmatch(r'  [A-Za-z0-9_-]+:', line))
        self.assertEqual(job, '  quality:')
        self.assertEqual(text.count('        run: python3 scripts/testing/assembled-native-ci/test_run.py\n'), 1)

    def test_ordinary_five_jobs_are_byte_equivalent_and_optional_job_is_explicit(self):
        text = (HERE.parents[2] / '.github/workflows/ci.yml').read_text(encoding='utf8')
        # Preserve the exact parent hash after removing this one reviewed step only.
        step = '      - name: Assembled offline source contracts\n        run: python3 scripts/testing/assembled-native-ci/test_run.py\n'
        self.assertEqual(text.count(step), 1)
        self.assertEqual(text.count('      - name: Assembled offline source contracts\n'), 1)
        normal = text.split('jobs:\n', 1)[1].split('\n  # Optional native execution', 1)[0]
        self.assertEqual(normal.count(step), 1)
        normal = normal.replace('\n' + step, '', 1).rstrip() + '\n'
        self.assertEqual(hashlib.sha256(normal.encode()).hexdigest(), '15804e4906da441cfbd4926c77566ad9989777c65022d850075cdd261bd60d73')
        optional = text.split('  assembled-native-bounded:', 1)[1]
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.assembled_native == true", optional)
        self.assertIn('persist-credentials: false', optional)
        self.assertIn('path: assembled-native-artifact/receipt.json', optional)
        self.assertNotIn('secrets.', optional)
        self.assertNotIn('CI: true', optional)
        self.assertNotIn('GITHUB_ACTIONS: true', optional)
        self.assertNotIn('tee ', optional)


class CompositionCurrentFrame(unittest.TestCase):
    def setUp(self):
        keys=['SELECTED_PROFILE','CANDIDATE','TREE','CAPSULE','DRIVER','PREFIX','CAPSULE_FILE','NATIVE_GLOB','OVERLAY_NAMES']
        self.saved={key:getattr(runner,key) for key in keys}
        self.addCleanup(lambda:[setattr(runner,key,value) for key,value in self.saved.items()])

    def choose(self):
        spec=runner.COMPOSITION_SPEC
        return {'acceptance_profile':runner.COMPOSITION,'candidate_sha':spec['application'],
                'capsule_sha256':spec['capsuleSha256'],'driver_sha256':spec['driverSha256']}

    def test_current_actual_context_binds_four_inputs_and_reviewed_head(self):
        with tempfile.TemporaryDirectory() as folder:
            event=Path(folder)/'event.json';env=synthetic_env();env['GITHUB_EVENT_PATH']=str(event)
            inputs={**self.choose(),'assembled_native':True,'allocation_id':env['ASSEMBLED_ALLOCATION_ID'],'reviewed_helper_sha':env['ASSEMBLED_REVIEWED_SHA']}
            event.write_text(json.dumps({'inputs':inputs}))
            with patch.dict(os.environ,env),patch.object(runner.sys,'platform','linux'),patch.object(runner,'git',return_value=env['GITHUB_SHA']):
                bound=runner.actual_context()
                self.assertEqual(bound['acceptanceProfile'],runner.COMPOSITION)
                self.assertEqual(bound['candidateCommit'],self.choose()['candidate_sha'])
                for field in ['candidate_sha','capsule_sha256','driver_sha256','reviewed_helper_sha']:
                    bad={**inputs,field:'0'*len(inputs[field])};event.write_text(json.dumps({'inputs':bad}))
                    with self.subTest(field=field),self.assertRaises(ValueError):runner.actual_context()
                event.write_text(json.dumps({'inputs':inputs}))
                with patch.object(runner,'git',return_value='0'*40),self.assertRaises(ValueError):runner.actual_context()

    def test_current_prepare_routes_exact_capsule_without_native_operations(self):
        for composition in [False,True]:
            for key,value in self.saved.items():setattr(runner,key,value)
            if composition:runner.select_profile(self.choose())
            with self.subTest(composition=composition),tempfile.TemporaryDirectory() as folder,ExitStack() as stack:
                temp=Path(folder);private=temp/'private';app=temp/'app';app.mkdir()
                binding={'workflowCommit':'a'*40};materializer=SimpleNamespace(apply=unittest.mock.Mock())
                loader=SimpleNamespace(exec_module=lambda _:None)
                stack.enter_context(patch.object(runner,'actual_context',return_value=binding))
                stack.enter_context(patch.object(runner,'paths',return_value=(temp,temp,private,app)))
                stack.enter_context(patch.object(runner,'owned'))
                journal=stack.enter_context(patch.object(runner,'private_json'))
                def git(repo,*args):
                    if args==('rev-parse','HEAD'):return runner.CANDIDATE
                    if args==('rev-parse','HEAD^{tree}'):return runner.TREE
                    if args==('status','--porcelain','--untracked-files=no'):return ''
                    if args==('remote','get-url','origin'):return 'https://github.com/'+runner.REPOSITORY
                    raise AssertionError('unexpected git read')
                stack.enter_context(patch.object(runner,'git',side_effect=git))
                stack.enter_context(patch.object(runner.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=b'')))
                reads=[]
                def read(path):reads.append(path.name);return b'synthetic'
                stack.enter_context(patch.object(runner.Path,'read_bytes',read))
                stack.enter_context(patch.object(runner.Path,'is_file',return_value=True))
                stack.enter_context(patch.object(runner.Path,'is_socket',return_value=True))
                stack.enter_context(patch.object(runner,'sha',return_value=runner.CHROME))
                unpack=stack.enter_context(patch.object(runner,'unpack_capsule'))
                stack.enter_context(patch.object(runner.importlib.util,'spec_from_file_location',return_value=SimpleNamespace(loader=loader)))
                stack.enter_context(patch.object(runner.importlib.util,'module_from_spec',return_value=materializer))
                stack.enter_context(patch.object(runner,'expected_sql',return_value=[]))
                self.assertEqual(runner.prepare(),'PREPARED_NATIVE_NOT_RUN')
                expected='sealed-p03-composition-e0-v1.tar' if composition else 'sealed-v4b-app-f07.tar'
                self.assertIn(expected,reads);unpack.assert_called_once();materializer.apply.assert_called_once_with(private/'capsule/overlay',app,runner.DRIVER)
                self.assertEqual(journal.call_args.args[1]['stage'],'PREPARED')

    def test_current_sql_and_state_routing_keep_default_and_new_scope_separate(self):
        for composition in [False,True]:
            for key,value in self.saved.items():setattr(runner,key,value)
            if composition:runner.select_profile(self.choose())
            capsule=HERE/runner.CAPSULE_FILE
            with tempfile.TemporaryDirectory() as folder:
                private=Path(folder);destination=private/'capsule';destination.mkdir()
                runner.unpack_capsule(capsule.read_bytes(),destination)
                pins=runner.expected_sql(private)
                self.assertEqual(len(pins),19 if composition else 18)
                self.assertEqual(pins[-1]['file'],'scripts/testing/consultation-tickets/owned-fixture.sql' if composition else 'supabase/migrations/20261003094327_member_investment_scope_reviews.sql')
            if composition:
                sentinel={'source':'synthetic-independent'}
                with patch.object(runner,'verify_composition_state',return_value=sentinel) as verify:
                    self.assertIs(runner.verify_native_state({'test':1},Path('synthetic')),sentinel)
                    verify.assert_called_once()

    def test_current_workflow_hard_bound_and_no_changed_parent_default(self):
        source=(HERE.parents[2]/'.github/workflows/ci.yml').read_text(encoding='utf8')
        self.assertIn("default: assembled-member-admin-v1",source)
        self.assertIn("timeout-minutes: ${{ inputs.acceptance_profile == 'p03-composition-e0-v1' && 25 || 35 }}",source)
        self.assertIn("'e0b930927563d7f9f6d79e848917c4ba0d77ed6f' || 'f07e0543c46cea88822dc0d400080b5bb94bef91'",source)


"""Synthetic/AST tests only: never imports or executes the native controller."""
import ast,copy,hashlib,json,pathlib,re,unittest
from collections import Counter
source=(HERE/'run.py').read_text(encoding='utf-8')
tree=ast.parse(source)
names={'composition_json','select_profile','reconcile_composition','project_composition','need','sha'}
constants={'COMPOSITION','COMPOSITION_SPEC','SELECTED_PROFILE','CAPSULE_FILE','NATIVE_GLOB','CANDIDATE','TREE','CAPSULE','DRIVER','PREFIX','OVERLAY_NAMES'}
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
ns={'json':json,'re':re,'hashlib':hashlib,'Counter':Counter,'UUID':re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'),'HEX':re.compile(r'[a-f0-9]{64}')}
exec(compile(ast.Module(body=selected,type_ignores=[]),'controller-pure-functions','exec'),ns)
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
def compact(x):return json.dumps(x,separators=(',',':'),ensure_ascii=False)
def fixture():
    sha=ns['COMPOSITION_SPEC']['application'];run='consultation-ticket-'+uid(500)
    ids=[uid(i) for i in range(1,5)];relation=uid(10);session=uid(11);request=uid(12);h='a'*64
    caps=[('a','/api/portfolio/holdings',2),('a','/api/personal-finance/cash-flow',1),('a','/api/consultation',4),('owner','/api/consultation',5),('a','/api/consultation/tickets',3),('owner','/api/consultation/tickets',2),('a','/api/consultation/ticket-attempts',5),('owner','/api/consultation/ticket-attempts',2),('owner','/api/consultation/replies',2)]
    direct_caps={'/api/portfolio/holdings':2,'/api/personal-finance/cash-flow':1,'/api/consultation':9,'/api/consultation/tickets':1,'/api/consultation/ticket-attempts':2,'/api/consultation/replies':2}
    r={};i=0;direct=[];counts=Counter()
    for actor,path,count in caps:
        for j in range(count):
            i+=1;body={'clientToken':uid(100+i),'expectedActorId':ids[0 if actor=='a' else 2]}
            if path=='/api/portfolio/holdings':body={'client_token':uid(100+i),'base_version':j,'positions':[]}
            if path=='/api/personal-finance/cash-flow':body={'clientToken':uid(100+i),'expectedOwnerId':ids[0]}
            raw=compact(body)
            status=503 if path.endswith('ticket-attempts') and j==0 and actor=='a' else 409 if path.endswith('replies') and j==1 else 201
            r[f'composition-intent-{i:03}.json']={'kind':'intent','ordinal':i,'actor':actor,'path':path,'body':raw,'bodySha256':hashlib.sha256(raw.encode()).hexdigest(),'token':body.get('clientToken',body.get('client_token'))}
            r[f'composition-result-{i:03}.json']={'kind':'result','ordinal':i,'status':status}
            if counts[path]<direct_caps[path]:direct.append((path,body,status));counts[path]+=1
    for path,count,status in [('/auth/v1/admin/users',4,201),('/auth/v1/token?grant_type=password',9,200),('/auth/v1/logout',4,204),('/rest/v1/rpc/lookup_consultation_ticket_attempt',1,403)]:
        direct.extend((path,{'synthetic':True},status) for _ in range(count))
    for i,(path,body,status) in enumerate(direct,1):
        r[f'intent-{i:03}.json']={'sha':sha,'path':path,'body':body};r[f'transport-result-{i:03}.json']={'sha':sha,'path':path,'ordinal':i,'status':status}
    r['transport-observation.json']={'schema':'p03-owned-transport.v1','sha':sha,'runId':run,'poisoned':False,'rejected':0,'authorizedPostRequests':35,'sdkReads':18}
    summary={'sessionId':session,'requestId':request,'contentHash':h,'replyReceipt':{'command':{'relationshipId':relation}}}
    browser=['browser-preflight-before-provision','real-member-page-default-right-closed','real-201-discard-live-page-one-post','same-attempt-get-only-recovery','fresh-sdk-context-and-reload-get-only','real-advisor-response-and-member-followup','real-revoke-and-private-fallback-denial','desktop-mobile-and-private-storage-cache-url','unconfirmed-command-destroy-and-server-intent-get-only','unknown-preparation-destroy-no-command','owned-browser-cleanup']
    r['composition-observed.json']={'schema':'p03-composition-observed.v1','sha':sha,'appSha':sha,'runId':run,'summary':summary,'unknownScope':'P03-ticket-only','p09UnknownSave':'NOT_COVERED_MISSING_JOURNAL','p09HistoricalAcceptanceTransferred':False,'modelCalls':0,'workbookPosts':0,'browserChecks':[{'name':n,'status':'PASS'} for n in browser]}
    r['composition-binding.json']={'runId':run,'appSha':sha,'appTree':ns['COMPOSITION_SPEC']['tree'],'authCreatedIds':ids,'actors':[{'id':i,'run':run} for i in ids]}
    r['composition-database-observation.json']={'databaseMarker':run,'authUsers':4,'relationships':[{'id':relation,'clientId':ids[0],'advisorId':ids[2],'revoked':True}],'sessions':[{'id':session,'relationshipId':relation,'contentHash':h,'version':1}], 'requests':2,'ticketEvents':5,'preparedIntents':6,'summaryEvents':3,'publications':1,'feedback':3,'replyVersions':1,'holdingVersions':2,'cashFlowVersions':1,'requestLinks':[{'requestId':v,'relationshipId':relation} for v in [request,uid(13)]],'recommendationLinks':[{'requestId':request,'version':3,'recommendation':{'sessionId':session,'version':1,'contentHash':h}}]}
    r['composition-database-observation.json']['holdingOwnership']=[{'userId':ids[0],'version':i,'clientToken':uid(100+i)} for i in (1,2)]
    return r,run,sha
class CompositionPureContractCI(unittest.TestCase):
    def test_synthetic_complete_only(self):
        r,run,sha=fixture();got=ns['reconcile_composition'](r,run,sha)
        self.assertEqual((got['productAttempts'],got['directPostAttempts'],got['browserProductAttempts']),(26,35,9))
        self.assertNotIn('body',compact(got))
    def test_missing_unknown_and_typed_counts(self):
        for field,value in [('authorizedPostRequests',None),('authorizedPostRequests',True),('poisoned',None),('rejected',False),('sdkReads','18')]:
            with self.subTest(field=field,value=value):
                r,run,sha=fixture();r['transport-observation.json'][field]=value
                with self.assertRaises((ValueError,KeyError,TypeError)):ns['reconcile_composition'](r,run,sha)
    def test_no_unknown_result_or_replay_or_source_substitution(self):
        for change in [lambda r:r.pop('composition-result-001.json'),lambda r:r['composition-result-001.json'].update(status=None),lambda r:r['transport-result-001.json'].update(sha='b'*40),lambda r:r['composition-intent-001.json'].update(bodySha256='b'*64),lambda r:r.update({'intent-036.json':r['intent-001.json']})]:
            r,run,sha=fixture();change(r)
            with self.assertRaises((ValueError,KeyError,TypeError)):ns['reconcile_composition'](r,run,sha)
    def test_uuid_hash_db_and_actor_reconcile(self):
        for change in [lambda r:r['composition-database-observation.json'].update(databaseMarker='foreign'),lambda r:r['composition-database-observation.json']['sessions'][0].update(contentHash='b'*64),lambda r:r['composition-database-observation.json']['recommendationLinks'][0].update(requestId=uid(999)),lambda r:r['composition-database-observation.json'].update(requests=True),lambda r:r['composition-database-observation.json']['relationships'][0].update(clientId=uid(2))]:
            r,run,sha=fixture();change(r)
            with self.assertRaises((ValueError,KeyError,TypeError)):ns['reconcile_composition'](r,run,sha)
    def test_holdings_real_body_uses_sql_owner_and_token_not_invented_field(self):
        r,run,sha=fixture();body=json.loads(r['composition-intent-001.json']['body'])
        self.assertNotIn('expectedOwnerId',body);self.assertNotIn('expectedActorId',body)
        self.assertTrue(ns['reconcile_composition'](r,run,sha)['databaseMatched'])
        for key,value in [('userId',uid(2)),('clientToken',uid(999)),('version',True)]:
            bad=copy.deepcopy(r);bad['composition-database-observation.json']['holdingOwnership'][0][key]=value
            with self.assertRaises(ValueError):ns['reconcile_composition'](bad,run,sha)
    def test_json_duplicate_nonfinite_and_empty_rejected(self):
        for raw in [b'{"x":1,"x":2}',b'{"x":NaN}',b'',b'{']:
            with self.assertRaises(ValueError):ns['composition_json'](raw)
    def test_explicit_profile_bindings_and_parent_default(self):
        self.assertEqual(ns['select_profile']({}),'assembled-member-admin-v1')
        for inputs in [{'acceptance_profile':ns['COMPOSITION']},{'candidate_sha':'e'*40},{'acceptance_profile':'unknown'}]:
            with self.assertRaises(ValueError):ns['select_profile'](inputs)
        spec=ns['COMPOSITION_SPEC'];inputs={'acceptance_profile':ns['COMPOSITION'],'candidate_sha':spec['application'],'capsule_sha256':spec['capsuleSha256'],'driver_sha256':spec['driverSha256']}
        ns['select_profile'](inputs);self.assertEqual(ns['CANDIDATE'],spec['application'])
        self.assertEqual(ns['NATIVE_GLOB'],'consultation-ticket-native-*')
        with self.assertRaises(ValueError):ns['select_profile']({**inputs,'driver_sha256':'0'*64})
    def test_projector_rejects_literal_pass_missing_evidence(self):
        row={'status':'PASS_BOUNDED_P03_COMPOSITION_NATIVE','scenarios':13}
        for raw in [b'',b'P03_ASSEMBLED_NATIVE_AUTH '+compact(row).encode(),b'P03_ASSEMBLED_NATIVE_AUTH {"status":"PASS","status":"FAIL"}']:
            with self.assertRaises((ValueError,KeyError,TypeError)):ns['project_composition'](raw,{}, {})
    def test_projector_full_synthetic_and_redaction(self):
        r,run,sha=fixture();ind=ns['reconcile_composition'](r,run,sha)
        ind.update(dockerContainers=0,dockerNetworks=0,browserTemps=0,fallbackUsed=False,compositionProofSha256='a'*64,transportProofSha256='b'*64,secret='SYNTHETIC_MUST_NOT_EMIT')
        names=['isolation-attested','four-fresh-auth-users-and-sdk-getuser','browser-owned-nonzero-dossier-real-consent','assembled-real-member-navigation-and-read-only-dom','browser-real-consumer-checked','composition-summary-published-exact-link','composition-question-reply-and-feedback','composition-fresh-summary-dom-get-only','composition-feedback-stable-before-basis-change','composition-financial-basis-change-readonly','composition-isolation-revocation-history','composition-auth-api-cdp-counts','composition-owned-browser-cleanup']
        lines=[b'P03_ASSEMBLED_NATIVE_CHECK '+compact({'name':n,'status':'PASS'}).encode() for n in names]
        row={'sha':sha,'allocationId':uid(600),'status':'PASS_BOUNDED_P03_COMPOSITION_NATIVE','scenarios':13,'cleanup':'REMOVED_OWNED_RESOURCES','compositionProofSha256':'a'*64,'transportProofSha256':'b'*64,'secret':'SYNTHETIC_MUST_NOT_EMIT'}
        raw=b'\n'.join(lines+[b'P03_ASSEMBLED_NATIVE_AUTH '+compact(row).encode()]);binding={'executionAllocationId':uid(600)}
        result=ns['project_composition'](raw,ind,binding)
        self.assertNotIn('SYNTHETIC_MUST_NOT_EMIT',compact(result));self.assertEqual(result['nativeChecks'],13)
        for key,value in [('directPostAttempts',None),('unresolved',False),('databaseMatched',None),('compositionProofSha256','c'*64)]:
            bad={**ind,key:value}
            with self.assertRaises(ValueError):ns['project_composition'](raw,bad,binding)
        with self.assertRaises(ValueError):ns['project_composition'](raw+b'\n'+lines[0],ind,binding)
    def test_no_controller_entry_or_native_import_executed(self):
        self.assertFalse(any(isinstance(n,(ast.Import,ast.ImportFrom)) for n in selected))
        self.assertEqual({n.name for n in selected if isinstance(n,ast.FunctionDef)},names)


def valid_guarded_pure_output(output,count):
    if not isinstance(output,str) or type(count) is not int or count<1:return False
    lines=output.splitlines()
    if lines.count('P03_PURE_GUARD_INSTALLED_V1')!=1 or not lines or lines[0]!='P03_PURE_GUARD_INSTALLED_V1':return False
    expected={'tests':count,'pass':count,'fail':0,'cancelled':0,'skipped':0}
    return all(lines.count('# '+key+' '+str(value))==1 and len([line for line in lines if line.startswith('# '+key+' ')])==1 for key,value in expected.items())

class PureGuardReceipt(unittest.TestCase):
    def test_guard_proof_is_required_before_tests_and_exact_counts(self):
        good='P03_PURE_GUARD_INSTALLED_V1\nTAP version 13\n# tests 31\n# pass 31\n# fail 0\n# cancelled 0\n# skipped 0\n'
        self.assertTrue(valid_guarded_pure_output(good,31))
        for bad in [good.replace('P03_PURE_GUARD_INSTALLED_V1\n',''),good+'P03_PURE_GUARD_INSTALLED_V1\n',good.replace('# fail 0','# fail 1'),good.replace('# skipped 0','# skipped 1'),good.replace('# cancelled 0','# cancelled 1'),'banner\n'+good,good.replace('# tests 31','# tests 30')]:
            self.assertFalse(valid_guarded_pure_output(bad,31))

class CompositionCapsulePureCI(unittest.TestCase):
    def test_pinned_composition_contract_and_sdk_transport_offline(self):
        # The same existing offline step runs these tests on Node22 in CI.
        # Only four fixed pure modules are materialized; no driver is imported.
        raw=(HERE/'sealed-p03-composition-e0-v1.tar').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),runner.COMPOSITION_SPEC['capsuleSha256'])
        prefix='overlay/scripts/testing/consultation-tickets/'
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            members=archive.getmembers()
            expected={prefix+n for n in runner.COMPOSITION_SPEC['overlayNames']}|{prefix+'assembled-overlay.json','apply-overlay.py','REVIEW.fa.md'}
            self.assertEqual(len(members),len(expected));self.assertEqual({m.name for m in members},expected)
            self.assertTrue(all(m.isfile() for m in members));self.assertLess(sum(m.size for m in members),256*1024)
            contract_raw=archive.extractfile(prefix+'assembled-overlay.json').read()
            self.assertEqual(hashlib.sha256(contract_raw).hexdigest(),runner.COMPOSITION_SPEC['driverSha256'])
            contract=runner.composition_json(contract_raw)
            self.assertEqual(contract['candidateCommit'],runner.COMPOSITION_SPEC['application'])
            pins={p['path']:p for p in contract['files']}
            self.assertEqual(len(pins),len(contract['files']))
            names=['composition-contract.mjs','composition-contract.test.mjs','composition-transport.mjs','composition-transport.test.mjs']
            with tempfile.TemporaryDirectory(prefix='p03-pure-ci-') as folder:
                for name in names:
                    data=archive.extractfile(prefix+name).read();pin=pins['scripts/testing/consultation-tickets/'+name]
                    self.assertEqual(len(data),pin['bytes']);self.assertEqual(hashlib.sha256(data).hexdigest(),pin['sha256'])
                    with (Path(folder)/name).open('xb') as handle:handle.write(data)
                guard=HERE/'pure-node-guard.cjs';probe=HERE/'pure-node-guard.test.mjs'
                self.assertEqual(hashlib.sha256(guard.read_bytes()).hexdigest(), '4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028')
                self.assertEqual(hashlib.sha256(probe.read_bytes()).hexdigest(), 'a6bc1a6c3e54ae71b853674761415b03761555a8e3e3bd33f473ecfe25158d72')
                # Direct node:test auto-run: no --test runner or permitted child spawn.
                entry=Path(folder)/'pure-entry.mjs'
                entry.write_bytes(b"import './composition-contract.test.mjs';\nimport './composition-transport.test.mjs';\n")
                env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','TEMP','TMP']}
                for script,count in [(probe,4),(entry,31)]:
                    result=subprocess.run([shutil.which('node'),'--test-reporter=tap','--require',str(guard),str(script)],env=env,capture_output=True,timeout=60)
                    output=result.stdout.decode('utf8')+result.stderr.decode('utf8')
                    self.assertEqual(result.returncode,0,output)
                    self.assertTrue(valid_guarded_pure_output(output,count),output)



# Source-only diagnostic regressions, in the existing ordinary CI entrypoint.
def post_member_case_source():
    raw=(HERE/'sealed-p03-composition-e0-v1.tar').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=runner.COMPOSITION_SPEC['capsuleSha256']:raise ValueError('capsule_pin')
    prefix='overlay/scripts/testing/consultation-tickets/'
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        contract_raw=archive.extractfile(prefix+'assembled-overlay.json').read()
        if hashlib.sha256(contract_raw).hexdigest()!=runner.COMPOSITION_SPEC['driverSha256']:raise ValueError('driver_pin')
        contract=runner.composition_json(contract_raw)
        pins=[row for row in contract['files'] if row['path']=='scripts/testing/consultation-tickets/composition-browser-case.mjs']
        if len(pins)!=1:raise ValueError('case_pin')
        data=archive.extractfile(prefix+'composition-browser-case.mjs').read()
        if len(data)!=pins[0]['bytes'] or hashlib.sha256(data).hexdigest()!=pins[0]['sha256']:raise ValueError('case_pin')
        return data

class PostMemberDiagnostic(unittest.TestCase):
    def test_new_pass_and_redaction(self):
        raw=b'P03_ASSEMBLED_NATIVE_CHECK {"name":"browser-owned-nonzero-dossier-real-consent","status":"PASS","secret":"DO_NOT_OUTPUT"}'
        out=runner.project_failure_log(raw)
        self.assertEqual(out['lastObservedPassedCheck'],'browser-owned-nonzero-dossier-real-consent')
        self.assertNotIn('DO_NOT_OUTPUT',json.dumps(out))
    def test_each_bounded_stage_before_and_after(self):
        for stage in ['composition-financial-before-write', 'composition-context-binding', 'composition-fixture-apply', 'composition-fixture-binding', 'composition-default-prepare', 'composition-default-page']:
            before=('P03_ASSEMBLED_STAGE '+json.dumps({'stage':stage,'edge':'before'})+'\n').encode()
            self.assertEqual(runner.project_stage_log(before)['lastObservedStageEdge'],'before')
            after=('P03_ASSEMBLED_STAGE '+json.dumps({'stage':stage,'edge':'after'})+'\n').encode()
            result=runner.project_stage_log(before+after)
            self.assertEqual(result['lastObservedStageEdge'],'after');self.assertFalse(result['malformedStageRecords'])
    def test_unknown_stage_and_extra_payload_rejected(self):
        for row in [{'stage':'DO_NOT_OUTPUT','edge':'before'},{'stage':'composition-fixture-apply','edge':'before','secret':'DO_NOT_OUTPUT'}]:
            out=runner.project_stage_log(('P03_ASSEMBLED_STAGE '+json.dumps(row)).encode())
            self.assertTrue(out['malformedStageRecords']);self.assertNotIn('DO_NOT_OUTPUT',json.dumps(out))
    def test_fixed_failure_codes_only(self):
        for code in ['p03_composition_default_form_exposed','p03_composition_default_prepare_not_closed']:
            self.assertEqual(runner.project_failure_log(('P03_ASSEMBLED_FAILURE '+json.dumps({'reason':code})).encode())['nativeFailureCode'],code)
        self.assertIsNone(runner.project_failure_log(b'P03_ASSEMBLED_FAILURE {"reason":"p03_composition_secret_DO_NOT_OUTPUT"}')['nativeFailureCode'])
    def test_product_statements_byte_exact(self):
        after=post_member_case_source()
        after=after.replace(b"import {validateTicketRequest} from '../../../lib/consultation/tickets.ts';\n",b'')
        line=next(line for line in after.splitlines(keepends=True) if b'const denied=' in line)
        oldline=line.replace(b'const denied=validateTicketRequest({',b'const denied={')[:-4]+b'};\n'
        after=after.replace(line,oldline)
        cleaned=b''.join(line for line in after.splitlines(keepends=True) if not line.startswith(b" console.log('P03_ASSEMBLED_STAGE '+"))
        self.assertEqual(hashlib.sha256(cleaned).hexdigest(),'f2bc233694297d150e577534c2ce6c8bfc704678518ece16ff517e4b4996a0da')
    def test_two_guarded_mock_operation_boundaries(self):
        guard=HERE/'pure-node-guard.cjs';probe=HERE/'pure-node-guard.test.mjs'
        self.assertEqual(hashlib.sha256(guard.read_bytes()).hexdigest(),'4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028')
        self.assertEqual(hashlib.sha256(probe.read_bytes()).hexdigest(),'a6bc1a6c3e54ae71b853674761415b03761555a8e3e3bd33f473ecfe25158d72')
        with tempfile.TemporaryDirectory(prefix='p03-stage-pure-') as folder:
            local=Path(folder);(local/'case-source.txt').write_bytes(post_member_case_source())
            entry=local/'stage-pure.mjs';entry.write_bytes('import test from \'node:test\';\nimport assert from \'node:assert/strict\';\nimport vm from \'node:vm\';\nimport {readFileSync} from \'node:fs\';\nconst source=readFileSync(new URL(\'./case-source.txt\',import.meta.url),\'utf8\');\nconst block=stage=>{const start=source.indexOf(" console.log(\'P03_ASSEMBLED_STAGE \'+JSON.stringify({stage:\'"+stage+"\',edge:\'before\'}));");const end=source.indexOf("edge:\'after\'}));",start)+"edge:\'after\'}));".length;assert.ok(start>=0&&end>start);return source.slice(start,end);};\ntest(\'negative prepare source sends once and records after only for accepted result\',async()=>{\n for(const mode of [\'valid\',\'wrong_status\',\'throw\']){const rows=[];let calls=0;\n const ctx={api:async()=>{calls++;if(mode===\'throw\')throw Error(\'PRIVATE\');return {status:mode===\'valid\'?503:200,value:{code:\'SERVICE_RIGHT_NOT_CONNECTED\'}};}};\n const result=vm.runInNewContext(\'(async()=>{\'+block(\'composition-default-prepare\')+\'})()\', {ctx,denied:{},check:(v)=>{if(!v)throw Error(\'PRIVATE\');},console:{log:x=>rows.push(x)}});\n if(mode===\'valid\')await result;else await assert.rejects(result);\n assert.equal(calls,1);assert.equal(rows.length,mode===\'valid\'?2:1);assert.ok(rows.every(x=>!x.includes(\'PRIVATE\')));\n }\n});\ntest(\'fixture apply source preserves one synchronous call and no after on failure\',()=>{\n for(const fail of [false,true]){let calls=0;const rows=[];const context={ctx:{apply:()=>{calls++;if(fail)throw Error(\'PRIVATE\');}},console:{log:x=>rows.push(x)}};\n if(fail)assert.throws(()=>vm.runInNewContext(block(\'composition-fixture-apply\'),context));else vm.runInNewContext(block(\'composition-fixture-apply\'),context);\n assert.equal(calls,1);assert.equal(rows.length,fail?1:2);assert.ok(rows.every(x=>!x.includes(\'PRIVATE\')));\n }\n});\n'.encode())
            env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','TEMP','TMP']}
            for script,count in [(probe,4),(entry,2)]:
                result=subprocess.run([shutil.which('node'),'--test-reporter=tap','--require',str(guard),str(script)],env=env,capture_output=True,timeout=60)
                output=result.stdout.decode('utf8')+result.stderr.decode('utf8')
                self.assertEqual(result.returncode,0,output)
                self.assertTrue(valid_guarded_pure_output(output,count),output)


class CanonicalNegativePrepare(unittest.TestCase):
    def test_actual_e0_validators_and_server_reject_old_body_before_parent_and_accept_canonical(self):
        guard=HERE/'pure-node-guard.cjs';probe=HERE/'pure-node-guard.test.mjs';entry=HERE/'canonical-validator.test.cjs'
        self.assertEqual(hashlib.sha256(guard.read_bytes()).hexdigest(),'4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028')
        self.assertEqual(hashlib.sha256(probe.read_bytes()).hexdigest(),'a6bc1a6c3e54ae71b853674761415b03761555a8e3e3bd33f473ecfe25158d72')
        self.assertEqual(hashlib.sha256(entry.read_bytes()).hexdigest(),'bd92e5cd50b19d63a556e74351f49511a9d8a639a165ca7ff7174d7943e6089e')
        self.assertEqual(hashlib.sha256((HERE/'fixtures/validator-e0-source.json').read_bytes()).hexdigest(),'b3f545fe86f0f7150657809f3fdb2f2f1e602d750505a83dbc7bca85a8bfb048')
        proposed=post_member_case_source()
        literal=b"import {validateTicketRequest} from '../../../lib/consultation/tickets.ts';\n"
        self.assertEqual(proposed.count(literal),1)
        old=proposed.replace(literal,b'')
        line=next(line for line in old.splitlines(keepends=True) if b'const denied=' in line)
        self.assertIn(b'const denied=validateTicketRequest({',line);self.assertTrue(line.endswith(b'});\n'))
        oldline=line.replace(b'const denied=validateTicketRequest({',b'const denied={')[:-4]+b'};\n'
        old=old.replace(line,oldline)
        self.assertEqual(hashlib.sha256(old).hexdigest(),'3a030ee8a7026e9107c203579b8306693a6356f39647a7cc6f121e31a4020af2')
        with tempfile.TemporaryDirectory(prefix='p03-canonical-pure-') as folder:
            local=Path(folder);(local/'base-case.mjs').write_bytes(old);(local/'proposed-case.mjs').write_bytes(proposed)
            env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','TEMP','TMP']}
            for script,extra,count in [(probe,[],4),(entry,[str(local)],3)]:
                result=subprocess.run([shutil.which('node'),'--test-reporter=tap','--require',str(guard),str(script),*extra],env=env,capture_output=True,timeout=60)
                output=result.stdout.decode('utf8')+result.stderr.decode('utf8')
                self.assertEqual(result.returncode,0,output)
                self.assertTrue(valid_guarded_pure_output(output,count),output)


class SummaryPreparationAwait(unittest.TestCase):
    def test_actual_async_e0_receipt_is_awaited_and_rejection_stops_link_and_rpc(self):
        fixed=HERE/'fixtures/summary-await'
        expected={
            'summary-await.test.cjs':'264797a312a3343d9dc135bf94a531b0093d73ec331564eea4c5f214f1e14162',
            'fixtures/summary-await/canonical-validator-fixture.json':'deb5aab9f73c7ecdec81beb12bea1a51df435df985762434a262e88247d1528a',
            'fixtures/summary-await/capsule-manifest.json':'4e9f29a20ef0512dac57ae5f295d0950551bd477456348f251ab147922db119a',
            'fixtures/summary-await/base-capsule54.tar':'54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255',
            'fixtures/summary-await/await-fixed-f41.tar':'f41acf251bd63dc8f7a938b4f4f4308073c44c3bd9085b4f6978dfacad1d7486',
            'pure-node-guard.cjs':'4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028',
            'pure-node-guard.test.mjs':'a6bc1a6c3e54ae71b853674761415b03761555a8e3e3bd33f473ecfe25158d72',
        }
        for name,digest in expected.items():
            self.assertEqual(hashlib.sha256((HERE/name).read_bytes()).hexdigest(),digest,name)
        with tempfile.TemporaryDirectory(prefix='p03-summary-await-pure-') as folder:
            local=Path(folder)
            for source,name in [
                (HERE/'summary-await.test.cjs','await-regression.test.cjs'),
                (fixed/'capsule-manifest.json','capsule-manifest.json'),
                (fixed/'canonical-validator-fixture.json','canonical-validator-fixture.json'),
                (fixed/'base-capsule54.tar','base-capsule54.tar'),
                (fixed/'await-fixed-f41.tar','sealed-p03-composition-e0-await-v1.tar'),
                (HERE/'pure-node-guard.cjs','pure-node-guard.cjs'),
                (HERE/'pure-node-guard.test.mjs','pure-node-guard.test.mjs'),
            ]:
                (local/name).write_bytes(source.read_bytes())
            env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','TEMP','TMP']}
            compiler=HERE.parents[2]/'node_modules/typescript/lib/typescript.js'
            result=subprocess.run([shutil.which('node'),'--test-reporter=tap','--require',str(local/'pure-node-guard.cjs'),'--import',(local/'pure-node-guard.test.mjs').as_uri(),str(local/'await-regression.test.cjs'),'--typescript-module='+str(compiler)],env=env,capture_output=True,timeout=60)
            output=result.stdout.decode('utf8')+result.stderr.decode('utf8')
            self.assertEqual(result.returncode,0,output)
            self.assertTrue(valid_guarded_pure_output(output,8),output)

class SummaryBoundedFailureProjection(unittest.TestCase):
    def test_frozen_literal_codes_only_and_private_unknown_text_remains_absent(self):
        literal_codes = [
            'p03_composition_http_200', 'p03_composition_http_201',
            'p03_composition_summary_missing', 'p03_composition_published_basis',
            'p03_composition_ticket_link_version', 'p03_composition_foreign_rpc_denial',
            'p03_composition_feedback_session_article_not_unique',
            'p03_composition_feedback_history_summary_not_unique',
            'p03_composition_feedback_rows', 'p03_composition_feedback_financial_change',
            'p09_browser_fixture_capability_not_read_not_ready',
            'p09_browser_fixture_capability_not_read_read_failed',
            'p09_browser_uncertain_ui_not_seen_not_ready',
            'p09_browser_uncertain_ui_not_seen_read_failed',
            'p09_browser_advisor_not_ready_not_ready',
            'p09_browser_advisor_not_ready_read_failed',
            'p09_browser_advisor_reply_not_read_not_ready',
            'p09_browser_advisor_reply_not_read_read_failed',
        ]
        for code in literal_codes:
            raw = ('P03_ASSEMBLED_FAILURE ' + json.dumps({
                'reason': code, 'message': 'PRIVATE_DO_NOT_PROJECT',
            })).encode()
            result = runner.project_failure_log(raw)
            self.assertEqual(result['nativeFailureCode'], code)
            self.assertNotIn('PRIVATE_DO_NOT_PROJECT', json.dumps(result))
            for unknown in [code + '_PRIVATE_DO_NOT_PROJECT', code + '_timeout']:
                raw = ('P03_ASSEMBLED_FAILURE ' + json.dumps({'reason': unknown})).encode()
                result = runner.project_failure_log(raw)
                self.assertIsNone(result['nativeFailureCode'])
                self.assertNotIn('PRIVATE_DO_NOT_PROJECT', json.dumps(result))



class SummaryHistorySelector(unittest.TestCase):
    def test_live_capsule_keeps_await_and_selects_only_same_card_history(self):
        fixed=HERE/'fixtures/summary-history'
        expected={
            'summary-history.test.cjs':'6527463ddce8dce8a6cd9beb082f5e4c630596dbc67a6d41f7a58c219798e782',
            'fixtures/summary-history/actual-component-fixture.json':'aea6e94f487aa1a00188ac9ae7999f2c1622770b35edeb26f53822542279f861',
            'fixtures/summary-history/capsule-manifest.json':'f298faa844508bc5a70b02ddc1d5a921d759b84780fe3dac94079eb5197f22da',
            'fixtures/summary-await/await-fixed-f41.tar':'f41acf251bd63dc8f7a938b4f4f4308073c44c3bd9085b4f6978dfacad1d7486',
        }
        for name,digest in expected.items():
            self.assertEqual(hashlib.sha256((HERE/name).read_bytes()).hexdigest(),digest,name)
        manifest=json.loads((fixed/'capsule-manifest.json').read_bytes())
        fixture=json.loads((fixed/'actual-component-fixture.json').read_bytes())
        live=(HERE/'sealed-p03-composition-e0-v1.tar').read_bytes()
        self.assertEqual(hashlib.sha256(live).hexdigest(),manifest['capsuleSha256'])
        def members(raw):
            with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
                rows=archive.getmembers()
                self.assertTrue(all(r.isfile() for r in rows))
                self.assertEqual(len({r.name for r in rows}),len(rows))
                return {r.name:archive.extractfile(r).read() for r in rows}
        before=members((HERE/'fixtures/summary-await/await-fixed-f41.tar').read_bytes())
        after=members(live)
        self.assertEqual(set(before),set(after))
        prefix='overlay/scripts/testing/consultation-tickets/'
        self.assertEqual(sorted(p for p in before if before[p]!=after[p]),sorted([prefix+'assembled-overlay.json',prefix+'composition-member-phase.mjs']))
        for name,data in after.items():
            self.assertEqual(hashlib.sha256(data).hexdigest(),manifest['members'][name]['sha256'])
            self.assertEqual(len(data),manifest['members'][name]['bytes'])
        base=before[prefix+'composition-member-phase.mjs'].decode()
        current=after[prefix+'composition-member-phase.mjs'].decode()
        self.assertEqual(current,fixture['phase']['candidate'])
        self.assertEqual(base,fixture['phase']['base'])
        self.assertEqual(current.replace(manifest['newLine'],manifest['oldLine']),base)
        self.assertEqual(current.count('const prepared=await preparation.validateTicketPreparationReceipt('),1)
        with tempfile.TemporaryDirectory(prefix='p03-summary-history-pure-') as folder:
            local=Path(folder)
            for source,name in [
                (HERE/'summary-history.test.cjs','history-selector.test.cjs'),
                (fixed/'capsule-manifest.json','capsule-manifest.json'),
                (fixed/'actual-component-fixture.json','actual-component-fixture.json'),
                (HERE/'pure-node-guard.cjs','pure-node-guard.cjs'),
                (HERE/'pure-node-guard.test.mjs','pure-node-guard.test.mjs'),
            ]:
                (local/name).write_bytes(source.read_bytes())
            env={k:v for k,v in os.environ.items() if k.upper() in ['PATH','SYSTEMROOT','TEMP','TMP']}
            result=subprocess.run([shutil.which('node'),'--test-reporter=tap','--require',str(local/'pure-node-guard.cjs'),'--import',(local/'pure-node-guard.test.mjs').as_uri(),str(local/'history-selector.test.cjs'),'--control-root='+str(HERE.parents[2])],env=env,capture_output=True,timeout=60)
            output=result.stdout.decode('utf8')+result.stderr.decode('utf8')
            self.assertEqual(result.returncode,0,output)
            self.assertTrue(valid_guarded_pure_output(output,8),output)

class M1SourceContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=HERE.parents[2]/'scripts/testing/consultation-feedback/install-feedback.py'
        spec=importlib.util.spec_from_file_location('m1_offline_adapter',path)
        cls.adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.adapter)

    def test_dispatch_routes_before_legacy_side_effects(self):
        for name in ('prepare','execute','finalize'):
            with self.subTest(action=name),patch.object(runner,'actual_context',return_value={'test':'binding'}),patch.object(runner,'SELECTED_PROFILE',runner.OWNED_START_A),patch.object(runner,'m1_'+name,return_value='M1_ONLY') as child,patch.object(runner,'paths',side_effect=AssertionError('legacy path reached')):
                self.assertEqual(getattr(runner,name)(),'M1_ONLY');child.assert_called_once_with({'test':'binding'})

    def test_explicit_profile_and_independent_controller_recipe(self):
        saved={k:getattr(runner,k) for k in ('SELECTED_PROFILE','CANDIDATE','TREE')}
        try:
            with self.assertRaises(ValueError):runner.select_profile({'acceptance_profile':runner.OWNED_START_A})
            self.assertEqual(runner.select_profile({'acceptance_profile':runner.OWNED_START_A,'candidate_sha':runner.M1_BASE}),runner.OWNED_START_A)
            binding={'executionAllocationId':'00000000-0000-4000-8000-000000000001','runId':'123','workflowCommit':'a'*40}
            recipe=runner.m1_recipe(binding,self.adapter)
            self.assertEqual(set(recipe['resources']),{'source','copy','restore'})
            self.assertEqual(len({r['name'] for r in recipe['resources'].values()}),3)
            self.assertTrue(all('id' not in r for r in recipe['resources'].values()))
            self.assertEqual(recipe['sourceCommit'],runner.M1_BASE)
            self.assertNotIn('expectedAllocationSha256',recipe)
        finally:
            for key,value in saved.items():setattr(runner,key,value)

    def test_process_is_bounded_redacts_stderr_and_drops_credentials(self):
        import types
        class Child:
            def __init__(self,out=b'ok',err=b'',code=0):self.stdin=io.BytesIO();self.stdout=io.BytesIO(out);self.stderr=io.BytesIO(err);self.code=code;self.killed=False
            def poll(self):return self.code
            def wait(self,timeout=None):return self.code
            def kill(self):self.killed=True
        captured={};child=Child(err=b'PRIVATE_CANARY')
        def create(*args,**kw):captured.update(kw);return child
        with patch.dict(os.environ,{'OPENAI_API_KEY':'PRIVATE_CANARY','DOCKER_HOST':'tcp://forbidden.invalid'}):
            result=self.adapter.bounded_owned_process(['docker','inspect','fixed'],popen=create,max_stdout_bytes=32)
        self.assertEqual(result,{'exitCode':0,'stdout':b'ok','sqlstate':None})
        self.assertNotIn('OPENAI_API_KEY',captured['env']);self.assertEqual(captured['env']['DOCKER_HOST'],'unix:///var/run/docker.sock')
        self.assertNotIn('PRIVATE_CANARY',repr(result))
        overflow=Child(out=b'x'*20)
        with self.assertRaisesRegex(RuntimeError,'m1_process_incomplete'):self.adapter.bounded_owned_process(['docker','inspect','fixed'],popen=lambda *a,**k:overflow,max_stdout_bytes=8)
        self.assertTrue(overflow.killed)
        state=Child(err=b'ERROR:  PT409: PRIVATE_CANARY\n',code=1)
        result=self.adapter.bounded_owned_process(['docker','exec','fixed'],popen=lambda *a,**k:state)
        self.assertEqual(result['sqlstate'],'PT409');self.assertNotIn('PRIVATE_CANARY',repr(result))

    def test_store_walk_is_descriptor_relative_for_every_component(self):
        from pathlib import PurePosixPath
        from types import SimpleNamespace
        fake=SimpleNamespace(O_RDONLY=1,O_DIRECTORY=2,O_NOFOLLOW=4,getuid=lambda:7,open=Mock(side_effect=[10,11,12]),close=Mock(),fstat=lambda fd:SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_uid=7))
        with patch.object(self.adapter,'os',fake),patch.object(self.adapter,'Path',PurePosixPath):
            store=self.adapter.OwnedPrivateStore('/private/evidence')
        self.assertEqual(fake.open.call_args_list[0].args,('/',7))
        self.assertEqual(fake.open.call_args_list[1].kwargs,{'dir_fd':10})
        self.assertEqual(fake.open.call_args_list[2].kwargs,{'dir_fd':11})
        self.assertEqual(store.fd,12)
        fake.open=Mock(side_effect=[10,OSError('symlink')]);fake.close.reset_mock()
        with patch.object(self.adapter,'os',fake),patch.object(self.adapter,'Path',PurePosixPath),self.assertRaises(OSError):self.adapter.OwnedPrivateStore('/private/evidence')
        fake.close.assert_called_with(10)

    def test_store_exclusive_write_fsyncs_file_then_directory(self):
        from types import SimpleNamespace
        store=object.__new__(self.adapter.OwnedPrivateStore);store.fd=12
        writes=[];sync=[]
        fake=SimpleNamespace(O_WRONLY=1,O_CREAT=2,O_EXCL=4,O_NOFOLLOW=8,open=Mock(return_value=20),close=Mock(),fstat=lambda fd:SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_nlink=1),write=lambda fd,v:(writes.append(bytes(v[:2])) or min(2,len(v))),fsync=lambda fd:sync.append(fd))
        with patch.object(self.adapter,'os',fake):store.write_blob_exclusive('intent.json',b'abcdef')
        self.assertEqual(b''.join(writes),b'abcdef');self.assertEqual(sync,[20,12]);self.assertEqual(fake.open.call_args.args[1],15)
        fake.open=Mock(side_effect=FileExistsError('existing'))
        with patch.object(self.adapter,'os',fake),self.assertRaises(FileExistsError):store.write_blob_exclusive('intent.json',b'new')
        with self.assertRaises(RuntimeError):store.name('../outside')

    def test_restore_rejects_role_drift_before_role_write(self):
        e=object.__new__(self.adapter.M1Exercise);e.binding={'test':'binding'}
        archive=b'PGDMPfixture';digest=lambda b:hashlib.sha256(b).hexdigest()
        e.guard=type('Guard',(),{'digest':staticmethod(digest)})();calls=[]
        proof={'binding':e.binding,'state':'BASELINE_ARCHIVED','archiveSha256':digest(archive)}
        class Store:
            def lock_exclusive(self):return contextlib.nullcontext()
            def exists(self,name):return False
            def read(self,name):return proof if name=='m1-backup-readback.json' else {'binding':e.binding,'rolesAndDatabase':{'roles':'initial'}}
            def read_blob(self,*args):return archive
            def write_exclusive(self,*args):raise AssertionError('must not write')
        e.io=Store()
        def query(sql,role):
            calls.append(sql)
            if sql==self.adapter.M1_EMPTY_CATALOG_QUERY:return 't'
            if self.adapter.M1_RELATIONS_QUERY in sql:return '[]'
            return json.dumps({'roles':'changed'})
        e.query=query
        with self.assertRaisesRegex(RuntimeError,'m1_initial_roles_changed'):e.restore_target('copy')
        self.assertNotIn(self.adapter.M1_ROLE_SQL,calls)
        self.assertTrue(self.adapter.M1_ROLE_SQL.startswith('BEGIN;') and self.adapter.M1_ROLE_SQL.endswith('COMMIT;'))

    def test_restore_view_only_target_is_rejected_before_writes(self):
        e=object.__new__(self.adapter.M1Exercise);e.binding={};e.guard=type('Guard',(),{'digest':staticmethod(lambda b:'a'*64)})()
        class Store:
            def lock_exclusive(self):return contextlib.nullcontext()
            def exists(self,n):return False
            def read(self,n):return {'binding':{},'state':'BASELINE_ARCHIVED','archiveSha256':'a'*64}
            def read_blob(self,*a):return b'PGDMP'
            def write_exclusive(self,*a):raise AssertionError('no writes')
        e.io=Store();e.query=lambda *a:json.dumps([{'schema':'public','name':'foreign_view','kind':'v'}])
        with self.assertRaisesRegex(RuntimeError,'m1_restore_target_not_empty'):e.restore_target('restore')
        self.assertIn("'v'",self.adapter.M1_RELATIONS_QUERY)

    def test_schema_nonce_normalization_preserves_acl_null_and_empty(self):
        a=b'-- PostgreSQL database dump\n\\restrict ABC123\nALTER TABLE public.t OWNER TO postgres;\n-- PostgreSQL database dump complete\n\\unrestrict ABC123\n'
        normalized=self.adapter.m1_schema_bytes(a)
        self.assertIn(b'OWNER TO postgres',normalized);self.assertNotIn(b'ABC123',normalized)
        with self.assertRaises(RuntimeError):self.adapter.m1_schema_bytes(a.replace(b'unrestrict ABC123',b'unrestrict OTHER'))
        self.assertNotEqual(self.adapter.m1_schema_bytes(b'GRANT SELECT ON t TO anon;\n'),self.adapter.m1_schema_bytes(b'REVOKE ALL ON t FROM anon;\n'))

    def test_io_binds_three_ids_and_rejects_foreign_target_before_transport(self):
        binding={'executionAllocationId':'00000000-0000-4000-8000-000000000001','runId':'123','workflowCommit':'a'*40}
        recipe=runner.m1_recipe(binding,self.adapter);allocation={k:recipe[k] for k in ('purpose','contractVersion','runId','attempt','controllerCommit','sourceCommit','allocationId','databaseMarker')}
        for i,role in enumerate(('source','copy','restore'),1):allocation[role]={**recipe['resources'][role],'id':str(i)*64}
        calls=[]
        def process(argv,body=None,**kw):
            if argv[:3]==['docker','image','inspect']:
                return {'exitCode':0,'stdout':json.dumps([{'Id':self.adapter.M1_IMAGE,'Os':'linux','Architecture':'amd64','RepoDigests':[self.adapter.M1_REPO_DIGEST]}]).encode()}
            calls.append((argv,body));object_id=argv[2] if argv[1]=='inspect' else argv[5];role=next(r for r in ('source','copy','restore') if allocation[r]['id']==object_id);a=allocation[role]
            if argv[1]=='inspect':
                row={'Id':object_id,'Name':'/'+a['name'],'Image':a['image'],'State':{'Running':True,'Health':{'Status':'healthy'}},'HostConfig':{'NetworkMode':'none'},'NetworkSettings':{'Ports':{},'Networks':{'none':{}}},'Config':{'Labels':a['labels'],'Env':['PGDATA=/var/lib/postgresql/data']},'Mounts':[{'Type':'tmpfs','Destination':'/var/lib/postgresql/data','RW':True}]}
                return {'exitCode':0,'stdout':json.dumps([row]).encode(),'sqlstate':None}
            return {'exitCode':0,'stdout':(allocation['databaseMarker'] if body and b'current_setting' in body else 'ok').encode(),'sqlstate':None}
        expected=hashlib.sha256(json.dumps(allocation,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        io_adapter=self.adapter.OwnedDockerIO(object(),allocation,expected,process)
        prefix=['docker','exec','-i','-e','PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s']
        command=prefix+[allocation['copy']['id'],'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
        self.assertEqual(io_adapter.execute(command,b'SELECT 1;')['stdout'],b'ok')
        self.assertEqual(sum(body is not None and b'current_setting' in body for _,body in calls),3)
        calls.clear()
        with self.assertRaises(RuntimeError):io_adapter.execute(prefix+['f'*64]+command[6:],b'SELECT 1;')
        self.assertEqual(calls,[])
        with self.assertRaises(RuntimeError):self.adapter.OwnedDockerIO(object(),allocation,'0'*64,process)

    def test_database_role_settings_require_observed_empty_before_bootstrap(self):
        a=self.adapter
        a.m1_require_supported_settings({'dbRoleSettings':[]})
        for metadata in ({},{'dbRoleSettings':None},{'dbRoleSettings':[{'database':'postgres','role':None,'settings':['private=value']}]}):
            with self.subTest(metadata=metadata),self.assertRaisesRegex(RuntimeError,'m1_db_role_settings_unsupported'):a.m1_require_supported_settings(metadata)
        self.assertIn('pg_db_role_setting',a.M1_ROLES_QUERY)
        self.assertIn("'database',d.datname,'role',r.rolname",a.M1_ROLES_QUERY)
        e=SimpleNamespace(io=SimpleNamespace(lock_exclusive=contextlib.nullcontext,exists=lambda n:False),query=lambda *args:json.dumps({'roles':[{'name':'postgres'}],'dbRoleSettings':[{'database':'postgres','role':None,'settings':[]}]}),persist=Mock())
        with self.assertRaisesRegex(RuntimeError,'m1_db_role_settings_unsupported'):a.m1_capture_initial_roles(e)
        e.persist.assert_not_called()

    def test_failure_projection_is_literal_typed_and_bound_not_raw_cause(self):
        self.assertEqual(runner.m1_failure_projection('backup',RuntimeError('m1_deadline')),{'phase':'backup','code':'m1_deadline'})

        for code in ('m1_full_restore_mismatch','owned_query_failed','m1_image_inspect_failed'):
            self.assertEqual(runner.m1_failure_projection('restore_copy',RuntimeError(code)),{'phase':'restore_copy','code':code})
            self.assertEqual(runner.m1_failure_projection('restore_copy',RuntimeError(code+' PRIVATE_SQL_BODY')),{'phase':'restore_copy','code':None})
        for error in (RuntimeError('PRIVATE token SQL https://secret'),ValueError({'private':'secret'}),Exception('m1_deadline')):
            result=runner.m1_failure_projection('apply_history',error)
            self.assertEqual(result,{'phase':'apply_history','code':None})
            self.assertNotIn('PRIVATE',json.dumps(result))
        binding={'runId':'1'}
        for record in ({'binding':{},'phase':'backup','code':'m1_deadline'},{'binding':binding,'phase':[],'code':None},{'binding':binding,'phase':'backup','code':'PRIVATE'},{'binding':binding,'phase':'backup','code':None,'raw':'secret'}):
            self.assertEqual(runner.m1_failure_readback(record,binding),{'phase':None,'code':None})
        self.assertEqual(runner.m1_failure_readback({'binding':binding,'phase':'backup','code':None},binding),{'phase':'backup','code':None})

    def test_execute_failure_records_first_phase_before_store_close(self):
        binding={'executionAllocationId':'00000000-0000-4000-8000-000000000001','runId':'123','workflowCommit':'a'*40}
        recipe=runner.m1_recipe(binding,self.adapter);records={'m1-recipe.json':recipe,'m1-controller-binding.json':{'binding':binding,'stage':'PREPARED','recipeSha256':hashlib.sha256(json.dumps(recipe,sort_keys=True,separators=(',',':')).encode()).hexdigest()}};events=[]
        class Store:
            def read(self,n):return records[n]
            def exists(self,n):return n in records
            def lock_exclusive(self):return contextlib.nullcontext()
            def write_exclusive(self,n,v):
                if n in records:raise FileExistsError(n)
                records[n]=v;events.append(n)
            def close(self):events.append('closed')
        module=SimpleNamespace(M1_IMAGE=self.adapter.M1_IMAGE,M1_IMAGE_CONTRACT=self.adapter.M1_IMAGE_CONTRACT,OwnedPrivateStore=lambda p:Store(),capacity=lambda p:None)
        with patch.object(runner,'paths',return_value=(Path('.'),Path('.'),Path('.'),Path('.'))),patch.object(runner,'m1_module',return_value=(module,None)),patch.object(runner,'m1_allocate',side_effect=RuntimeError('PRIVATE SQL token')):
            with self.assertRaisesRegex(RuntimeError,'PRIVATE'):runner.m1_execute(binding)
        self.assertEqual(records['m1-failure.json'],{'binding':binding,'phase':'allocation','code':None})
        self.assertLess(events.index('m1-failure.json'),events.index('closed'))
        self.assertNotIn('m1-phase-bootstrap.json',records)
        self.assertNotIn('PRIVATE',json.dumps(records))

    def test_controller_adapter_pin_matches_actual_source(self):
        adapter_path=Path(__file__).resolve().parents[1]/'consultation-feedback'/'install-feedback.py'
        self.assertEqual(runner.M1_ADAPTER_SHA,hashlib.sha256(adapter_path.read_bytes()).hexdigest())

    def test_image_index_config_platform_and_provenance_are_distinct(self):
        a=self.adapter
        valid={'Id':a.M1_IMAGE,'Os':'linux','Architecture':'amd64','RepoDigests':[a.M1_REPO_DIGEST]}
        calls=[]
        def process(argv,**kwargs):
            calls.append(argv)
            return {'exitCode':0,'stdout':json.dumps([row]).encode()}
        row=dict(valid);a.m1_verify_image(process,dict(a.M1_IMAGE_CONTRACT))
        for change in ({'Id':a.M1_IMAGE_INDEX},{'RepoDigests':[]},{'Architecture':'arm64'},{'Os':'windows'}):
            row={**valid,**change}
            with self.subTest(change=change),self.assertRaises(RuntimeError):a.m1_verify_image(process,dict(a.M1_IMAGE_CONTRACT))
        calls.clear()
        with self.assertRaises(RuntimeError):a.m1_verify_image(process,{**a.M1_IMAGE_CONTRACT,'configId':a.M1_IMAGE_INDEX})
        self.assertEqual(calls,[])
        self.assertNotEqual(a.M1_IMAGE_INDEX,a.M1_IMAGE)

    def test_cleanup_attempts_other_bound_resources_after_first_failure(self):
        from types import SimpleNamespace
        binding={'executionAllocationId':'00000000-0000-4000-8000-000000000001','runId':'123','workflowCommit':'a'*40}
        recipe=runner.m1_recipe(binding,self.adapter);pin=hashlib.sha256(json.dumps(recipe,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        rows={'m1-recipe.json':recipe,'m1-execution-result.json':{'binding':binding,'deadlineMet':True,'result':{'state':'PASS_M1_SQL_COPY_ONLY'}}}
        for i,role in enumerate(('source','copy','restore'),1):rows['m1-'+role+'-identity.json']={'role':role,'actual':{'id':str(i)*64},'recipeSha256':pin}
        class Store:
            def read(self,n):return rows[n]
            def exists(self,n):return n in rows
            def write_exclusive(self,n,v):
                if n in rows:raise FileExistsError(n)
                rows[n]=v
            def close(self):pass
        removed=[]
        def process(argv,**kw):
            if argv[1]=='rm':removed.append(argv[-1]);return {'exitCode':1 if argv[-1]=='1'*64 else 0,'stdout':b'','sqlstate':None}
            return {'exitCode':0,'stdout':b'','sqlstate':None}
        module=SimpleNamespace(M1_IMAGE_CONTRACT=self.adapter.M1_IMAGE_CONTRACT,M1_IMAGE=self.adapter.M1_IMAGE,OwnedPrivateStore=lambda p:Store(),bounded_owned_process=process)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(runner,'paths',return_value=(root,root,root/'private',root/'app')),patch.object(runner,'m1_module',return_value=(module,None)),patch.object(runner,'m1_inspect_planned',return_value={}),patch.object(runner,'private_json') as public:
                with self.assertRaises(ValueError):runner.m1_finalize(binding)
        self.assertEqual(removed,['1'*64,'2'*64,'3'*64])
        self.assertEqual(public.call_args.args[1]['status'],'FAIL_M1_NOT_ACCEPTED')
        self.assertEqual(public.call_args.args[1]['cleanup'],'UNCONFIRMED')
        self.assertEqual(public.call_args.args[1]['cleanupFailedRoles'],['source'])


if __name__ == '__main__':
    unittest.main()
