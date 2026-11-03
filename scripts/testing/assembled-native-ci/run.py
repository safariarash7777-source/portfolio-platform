"""Explicit GHA dispatch only; sealed app/SQL copy, no operational credentials.

Native stdout, state and intents stay in private temp. Only receipt.json is public.
No CLI flag can pretend to be Linux/GHA or retry an executed allocation.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parents[2]
REPOSITORY = 'safariarash7777-source/portfolio-platform'
CANDIDATE = '4dcf3713c3ad2507ed1a5bfee42a52b3c17cfb8a'
TREE = 'c96d462d72505f2471c54c8e7e5293fe2b39b3d1'
CAPSULE = 'f5020a6afebcc685b2e713a7f895646f2a5718ee04b72c846edccec41adb86fc'
DRIVER = '4c661f7d3cf8aa75f1185e7496c35a4ca766501af9be25d227fbab2e75160a9c'
CHROME = '95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72'
LABEL = 'p03.assembled-native-lab'
PREFIX = 'assembled-member-admin-'
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HEX = re.compile(r'[a-f0-9]{64}')
OVERLAY_NAMES = {'assembled-auth-runtime.mjs', 'assembled-auth-gateway.mjs', 'assembled-native.mjs',
                 'assembled-member-scenario.mjs', 'assembled-observer-policy.mjs',
                 'assembled-overlay-gate.mjs', 'assembled-native-profile.mjs', 'assembled-native-source.json'}


def need(value, code):
    if not value:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def context(env, platform):
    need(platform == 'linux' and env.get('RUNNER_OS') == 'Linux' and env.get('CI') == 'true'
         and env.get('GITHUB_ACTIONS') == 'true', 'assembled_real_gha_linux_required')
    need(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and env.get('GITHUB_REPOSITORY') == REPOSITORY
         and env.get('GITHUB_JOB') == 'assembled-native-bounded', 'assembled_explicit_dispatch_required')
    need(re.fullmatch(r'[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')) and env.get('GITHUB_RUN_ATTEMPT') == '1', 'assembled_fresh_run_attempt_required')
    allocation = env.get('ASSEMBLED_ALLOCATION_ID', '')
    reviewed = env.get('ASSEMBLED_REVIEWED_SHA', '')
    need(UUID.fullmatch(allocation) and re.fullmatch(r'[a-f0-9]{40}', reviewed)
         and env.get('GITHUB_SHA') == reviewed, 'assembled_reviewed_allocation_required')
    execution = str(uuid.uuid5(uuid.UUID(allocation), REPOSITORY + '/' + env['GITHUB_RUN_ID'] + '/1/' + reviewed))
    return {'repository': REPOSITORY, 'workflowCommit': reviewed, 'runId': env['GITHUB_RUN_ID'],
            'attempt': 1, 'allocationId': allocation, 'executionAllocationId': execution}


def command(args, cwd=None, env=None, timeout=30, body=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=body, capture_output=True, timeout=timeout)
    need(result.returncode == 0, 'assembled_local_command_failed')
    return result.stdout


def git(repo, *args):
    return command(['git', *args], cwd=repo).decode().strip()


def private_json(path, value, exclusive=False):
    raw = (json.dumps(value, sort_keys=True) + '\n').encode()
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    else:
        temporary = path.with_suffix('.pending')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)


def owned(path, directory=False):
    metadata = path.lstat()
    need(not path.is_symlink() and metadata.st_uid == os.getuid()
         and not metadata.st_mode & 0o077 and (stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode)), 'assembled_private_ownership')


def paths():
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    temp = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    need(CONTROL == workspace / 'control', 'assembled_control_location')
    private = temp / ('assembled-dispatch-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'])
    return workspace, temp, private, workspace / 'assembled-candidate'


def actual_context():
    value = context(os.environ, sys.platform)
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_bytes())
    inputs = event.get('inputs', {})
    need(inputs.get('assembled_native') in (True, 'true') and inputs.get('allocation_id') == value['allocationId']
         and inputs.get('reviewed_helper_sha') == value['workflowCommit'], 'assembled_event_input_binding')
    need(git(CONTROL, 'rev-parse', 'HEAD') == value['workflowCommit'], 'assembled_helper_checkout_changed')
    return value


def unpack_capsule(raw, destination):
    need(sha(raw) == CAPSULE, 'assembled_capsule_changed')
    expected = {'overlay/scripts/testing/consultation-tickets/' + name for name in OVERLAY_NAMES}
    expected |= {'overlay/scripts/testing/consultation-tickets/assembled-overlay.json', 'apply-overlay.py', 'REVIEW.fa.md'}
    import io
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
        members = archive.getmembers()
        need(len(members) == len(expected) and {m.name for m in members} == expected and all(m.isfile() for m in members), 'assembled_capsule_members')
        need(sum(m.size for m in members) < 256 * 1024, 'assembled_capsule_size')
        for member in members:
            target = destination / member.name
            need(not Path(member.name).is_absolute() and '..' not in Path(member.name).parts, 'assembled_capsule_path')
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open('xb') as handle:
                handle.write(archive.extractfile(member).read())
    manifest = destination / 'overlay/scripts/testing/consultation-tickets/assembled-overlay.json'
    need(sha(manifest.read_bytes()) == DRIVER, 'assembled_driver_contract_changed')
    return json.loads(manifest.read_bytes())


def safe_env(private):
    # No inherited API key, GitHub runtime token, provider token or remote Docker.
    env = {key: os.environ[key] for key in ['PATH', 'LANG', 'CI', 'GITHUB_ACTIONS', 'RUNNER_TEMP'] if key in os.environ}
    env.update(TMPDIR=str(private), DOCKER_CONFIG=str(private / 'docker-client'),
               DOCKER_HOST='unix:///var/run/docker.sock',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null',
               P01_P03_ASSEMBLED_NATIVE_SOURCE_SHA=CANDIDATE)
    return env


def expected_sql(private):
    base = private / 'capsule/overlay/scripts/testing/consultation-tickets'
    source = json.loads((base / 'assembled-native-source.json').read_bytes())
    overlay = json.loads((base / 'assembled-overlay.json').read_bytes())
    pins = {p['path']: p for p in source['files'] + overlay['additionalBootstrap']}
    names = source['bootstrap'] + [p['path'] for p in overlay['additionalBootstrap']]
    need(len(names) == len(set(names)) == 18, 'assembled_sql_pin_set')
    return [{'file': name, 'sha256': pins[name]['sha256']} for name in names]


def prepare():
    binding = actual_context()
    _, temp, private, app = paths()
    private.mkdir(mode=0o700)
    owned(private, True)
    state = {'binding': binding, 'stage': 'PREPARING', 'attempted': False, 'fallbackUsed': False,
             'beforeNative': sorted(p.name for p in temp.glob('assembled-member-admin-native-*')),
             'beforeBrowser': sorted(p.name for p in temp.glob('p09b-*'))}
    private_json(private / 'state.json', state, True)
    need(git(app, 'rev-parse', 'HEAD') == CANDIDATE and git(app, 'rev-parse', 'HEAD^{tree}') == TREE
         and git(app, 'status', '--porcelain', '--untracked-files=no') == '', 'assembled_app_copy_not_exact')
    for repo in [CONTROL, app]:
        need(git(repo, 'remote', 'get-url', 'origin').removesuffix('.git') == 'https://github.com/' + REPOSITORY, 'assembled_source_remote')
        # checkout persist-credentials=false must leave no operational Git token.
        config = subprocess.run(['git', 'config', '--local', '--get-regexp', r'^(credential\.|http\..*extraheader)'], cwd=repo, capture_output=True)
        need(config.returncode == 1 and not config.stdout, 'assembled_git_credential_not_allowed')
    capsule_dir = private / 'capsule'
    capsule_dir.mkdir(mode=0o700)
    unpack_capsule((HERE / 'sealed-v2.tar').read_bytes(), capsule_dir)
    need(Path('/opt/google/chrome/chrome').is_file()
         and sha(Path('/opt/google/chrome/chrome').read_bytes()) == CHROME, 'assembled_existing_chrome_pin_required')
    need(Path('/var/run/docker.sock').is_socket(), 'assembled_existing_local_docker_required')
    docker_dir = private / 'docker-client'
    docker_dir.mkdir(mode=0o700)
    private_json(docker_dir / 'config.json', {'auths': {}}, True)
    specification = importlib.util.spec_from_file_location('sealed_materializer', capsule_dir / 'apply-overlay.py')
    materializer = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(materializer)
    materializer.apply(capsule_dir / 'overlay', app, DRIVER)
    for pin in expected_sql(private):
        need(sha((app / pin['file']).read_bytes()) == pin['sha256'], 'assembled_sql_disk_changed')
    state['stage'] = 'PREPARED'
    private_json(private / 'state.json', state)
    return 'PREPARED_NATIVE_NOT_RUN'


def load_state(binding, private):
    owned(private, True)
    owned(private / 'state.json')
    state = json.loads((private / 'state.json').read_bytes())
    need(state['binding'] == binding, 'assembled_private_binding_changed')
    return state


def birth(pid):
    try:
        raw = Path('/proc/' + str(pid) + '/stat').read_text()
        return raw[raw.rfind(')') + 2:].split()[19]
    except (FileNotFoundError, ProcessLookupError):
        return None


def stop_child(state):
    pid = state.get('pid')
    if pid and state.get('birth') is None:
        need(birth(pid) is None, 'assembled_child_birth_unconfirmed')
        return
    if pid and birth(pid) == state.get('birth'):
        need(os.getpgid(pid) == pid and Path('/proc/' + str(pid)).stat().st_uid == os.getuid(), 'assembled_child_identity')
        os.killpg(pid, signal.SIGTERM)
        for _ in range(50):
            if birth(pid) != state['birth']:
                return
            time.sleep(0.1)
        if birth(pid) == state['birth']:
            os.killpg(pid, signal.SIGKILL)


def claim_execution(private, binding, state):
    need(state['stage'] == 'PREPARED', 'assembled_execute_once_only')
    private_json(private / 'execution-intent.json', {'binding': binding, 'candidate': CANDIDATE, 'driverContract': DRIVER}, True)
    state.update(stage='STARTING', attempted=True)
    private_json(private / 'state.json', state)


def execute():
    binding = actual_context()
    _, _, private, app = paths()
    state = load_state(binding, private)
    claim_execution(private, binding, state)
    node = shutil.which('node')
    need(node, 'assembled_existing_node_required')
    args = [node, '--import', 'tsx', 'scripts/testing/consultation-tickets/assembled-native.mjs', '--execute',
            '--allocation-id', binding['executionAllocationId'], '--driver-contract-sha256', DRIVER]
    with (private / 'native.log').open('xb') as log:
        process = subprocess.Popen(args, cwd=app, env=safe_env(private), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        state.update(pid=process.pid, birth=birth(process.pid), stage='RUNNING')
        private_json(private / 'state.json', state)
        try:
            state['exitCode'] = process.wait(timeout=25 * 60)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            state['timedOutOrInterrupted'] = True
            stop_child(state)
            state['exitCode'] = process.wait(timeout=10)
        finally:
            state['stage'] = 'EXECUTED'
            private_json(private / 'state.json', state)
    need(state['exitCode'] == 0, 'assembled_native_failed_no_replay')
    return 'NATIVE_EXITED_RECEIPT_NOT_YET_ACCEPTED'


def native_state(temp, private, state):
    new = [p for p in temp.glob('assembled-member-admin-native-*') if p.name not in state['beforeNative']]
    need(len(new) <= 1, 'assembled_native_temp_ambiguous')
    if not new:
        return None
    path = new[0]
    # Runtime mkdtemp may use default umask; it remains inside the private GHA temp.
    need(not path.is_symlink() and path.parent == temp and path.stat().st_uid == os.getuid(), 'assembled_native_temp_owner')
    data = json.loads((path / 'state.json').read_bytes())
    need(data['sha'] == CANDIDATE and data['local'] == str(path) and isinstance(data['id'], str)
         and data['id'].startswith(PREFIX) and UUID.fullmatch(data['id'][len(PREFIX):]), 'assembled_native_owner_marker')
    return data


def owned_docker_resource(role, row, run_id, query_id):
    need(isinstance(row.get('Id'), str) and HEX.fullmatch(row['Id']) and row['Id'].startswith(query_id), 'assembled_cleanup_object_identity')
    labels = row['Config']['Labels'] if role == 'container' else row['Labels']
    name = row['Name'].lstrip('/')
    allowed = [run_id + '-' + end for end in (['db', 'auth', 'rest', 'ingress'] if role == 'container' else ['internal', 'edge'])]
    need(labels.get(LABEL) == run_id and name in allowed, 'assembled_cleanup_owned_resource_required')
    return row['Id']


def docker_objects(private, run_id):
    env = safe_env(private)
    def call(args):
        return command(['docker', *args], env=env).decode().strip()
    found = []
    for role, args in [('container', ['ps', '-aq']), ('network', ['network', 'ls', '-q'])]:
        ids = call(args + ['--filter', 'label=' + LABEL + '=' + run_id]).split()
        for object_id in ids:
            need(re.fullmatch(r'[a-f0-9]{12,64}', object_id), 'assembled_docker_object_id')
            row = json.loads(call((['inspect'] if role == 'container' else ['network', 'inspect']) + [object_id]))[0]
            found.append((role, owned_docker_resource(role, row, run_id, object_id)))
    return found, call


def cleanup(temp, private, app, state):
    stop_child(state)
    data = native_state(temp, private, state)
    if data:
        found, call = docker_objects(private, data['id'])
        if found:
            state['fallbackUsed'] = True
            for role, object_id in sorted(found, key=lambda item: item[0] != 'container'):
                call(['rm', '-f', '-v', object_id] if role == 'container' else ['network', 'rm', object_id])
        remaining, _ = docker_objects(private, data['id'])
        need(not remaining, 'assembled_docker_cleanup_unconfirmed')
    new_browser = [p for p in temp.glob('p09b-*') if p.name not in state['beforeBrowser']]
    for path in new_browser:
        need(not path.is_symlink() and path.parent == temp and path.stat().st_uid == os.getuid()
             and re.fullmatch(r'p09b-[A-Za-z0-9]{6}', path.name), 'assembled_browser_temp_owner')
        marker = json.loads((path / 'owner.json').read_bytes())
        need(UUID.fullmatch(marker['owner']), 'assembled_browser_owner_marker')
        state['fallbackUsed'] = True
        # Reuse the sealed original ownership/process/readonly-closure cleanup.
        code = "import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';const {cleanup}=await import(pathToFileURL(process.argv[1]));await cleanup(JSON.parse(readFileSync(0,'utf8')));"
        command([shutil.which('node'), '--input-type=module', '-e', code, str(app / 'scripts/testing/consultation-tickets/browser.mjs')],
                env=safe_env(private), timeout=30,
                body=json.dumps({'local': str(path), 'tempRoot': str(temp), 'owner': marker['owner'], 'contexts': []}).encode())
    need(not [p for p in temp.glob('p09b-*') if p.name not in state['beforeBrowser']], 'assembled_browser_cleanup_unconfirmed')
    private_json(private / 'state.json', state)
    return data


def verify_native_state(data, private):
    need(data and data['migrations'] == expected_sql(private), 'assembled_applied_sql_not_exact')
    local = Path(data['local'])
    posts = Counter()
    tokens = []
    for path in sorted(local.glob('intent-*.json')):
        need(re.fullmatch(r'intent-[0-9]{3}\.json', path.name), 'assembled_intent_name')
        value = json.loads(path.read_bytes())
        need(value['sha'] == CANDIDATE, 'assembled_intent_source')
        route = value['path']
        if route.startswith('/api/'):
            posts[route] += 1
            body = value['body']
            tokens.append(body.get('client_token', body.get('clientToken')))
    need(posts == Counter({'/api/portfolio/holdings': 1, '/api/personal-finance/cash-flow': 1, '/api/consultation': 1})
         and all(isinstance(token, str) and UUID.fullmatch(token) for token in tokens) and len(set(tokens)) == 3, 'assembled_product_post_or_replay')
    return {'runId': data['id'], 'dockerContainers': 0, 'dockerNetworks': 0, 'browserTemps': 0,
            'fallbackUsed': False, 'sqlFilesVerified': 18, 'financialPosts': 2, 'consentPosts': 1, 'replayedProductPosts': 0}


def finalize():
    binding = actual_context()
    workspace, temp, private, app = paths()
    state = load_state(binding, private)
    public = workspace / 'assembled-native-artifact'
    public.mkdir(exist_ok=True)
    need(not public.is_symlink(), 'assembled_artifact_location')
    report_path = public / 'receipt.json'
    if report_path.exists():
        previous = json.loads(report_path.read_bytes())
        need(previous.get('binding') == binding, 'assembled_existing_receipt_binding')
        need(previous.get('status') == 'PASS_BOUNDED_ASSEMBLED_NATIVE', 'assembled_existing_failure_no_replay')
        return previous['status']
    report = {'schemaVersion': 'assembled-native-ci.v1', 'status': 'FAIL_NATIVE_NOT_ACCEPTED', 'binding': binding,
              'source': {'commit': CANDIDATE, 'tree': TREE, 'capsuleSha256': CAPSULE, 'driverContractSha256': DRIVER},
              'nativeAttempted': state['attempted'], 'targetInstall': 'NOT_APPLIED', 'arashAcceptance': 'UNOBSERVED',
              'privateArtifactsUploaded': False, 'automaticReplay': False}
    try:
        data = cleanup(temp, private, app, state)
        report['ownedCleanupReadback'] = 'CONFIRMED'
        need(state.get('exitCode') == 0 and not state.get('timedOutOrInterrupted') and not state['fallbackUsed'], 'assembled_native_not_confirmed')
        independent = verify_native_state(data, private)
        raw = (private / 'native.log').read_bytes()
        need(len(raw) <= 64 * 1024 * 1024, 'assembled_native_log_bound')
        payload = {'log': raw.decode('utf8'), 'binding': binding, 'tempRoot': str(temp), 'independent': independent}
        result = command([shutil.which('node'), str(HERE / 'receipt.mjs'), str(app)], env=safe_env(private),
                         body=json.dumps(payload).encode(), timeout=30)
        safe = json.loads(result)
        need(safe.get('status') == 'PASS_BOUNDED_ASSEMBLED_NATIVE', 'assembled_sanitized_receipt_required')
        report.update(safe)
        report['privateLogSha256'] = sha(raw)
    except Exception as error:
        report['failureCode'] = str(error) if re.fullmatch(r'assembled_[a-z_]+', str(error)) else 'assembled_finalization_failed'
        report.setdefault('ownedCleanupReadback', 'UNCONFIRMED')
        if (private / 'native.log').exists():
            raw = (private / 'native.log').read_bytes()
            report['writeOutcomeUnknown'] = b'write_outcome_unknown_stop_no_replay' in raw
    # Only this freshly constructed projection is eligible for upload, never logs.
    private_json(report_path, report, True)
    state['stage'] = 'FINALIZED'
    private_json(private / 'state.json', state)
    need(report['status'] == 'PASS_BOUNDED_ASSEMBLED_NATIVE', 'assembled_native_not_accepted_see_receipt')
    return report['status']


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'execute', 'finalize'])
    args = parser.parse_args()
    try:
        print(json.dumps({'status': {'prepare': prepare, 'execute': execute, 'finalize': finalize}[args.action]()}))
    except Exception as error:
        reason = str(error) if re.fullmatch(r'assembled_[a-z_]+', str(error)) else 'assembled_operation_failed'
        print(json.dumps({'status': 'FAIL_NATIVE_NOT_ACCEPTED', 'reason': reason, 'automaticReplay': False}))
        sys.exit(1)
