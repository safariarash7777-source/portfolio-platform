"""Read-only, pinned receipt consumer for one existing corrected SQL checkpoint.

No backup/restore, SQL, container mutation, transfer, capture or install operation.
An explicit reviewed launcher supplies binding bytes and their expected SHA256.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess

BASE = Path('/root/portfolio-recovery-backups')
CHECKPOINT = '20261103T222239Z'
ROOT = BASE / CHECKPOINT
SOURCE = 'portfolio-stage-db-1'
TARGET = 'portfolio-recovery-proof-20261103t222239z'
SOURCE_ID = '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
TARGET_ID = '458c668152b9bab455512c440889229452e0f3b23297bda236936fb2d1f8a065'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
PINNED_BINDING_SHA = '390fc73da29c3b53e267c4566eb538ebb0142c6426a032b41e27e969eaa5ac27'  # No future successful binding exists; native gate stays closed
OP = 'private2-reconciliation-20261104/'
EXPECTED_PINS = {'receipt.json': '695848a3f26da875b859c6589952eb9154ed0fae36f365b254b20e881cc793d6', 'source-inventory.private': '5649143950763b044dd46221bb4d86ab0715a384927fc0ef5d0a70c3c7acb32a', 'target-inventory.private': 'e29906a1cd94b962888361a91b96ace6a7c1b8d9472122bbf20358c32fe1178a', 'comparison-before-correction.private.json': '2ca79419e1b2cb1baee866a3cf63f0ab8cdb0205079e900738de492e86a77d9a', 'acl17-reconciliation-20261104/result.json': '39ba68d3d3b4aa14f91d76ae0e372863301761a429f23fab299072468921a327', 'acl17-reconciliation-20261104/strict-core-comparison.json': '74baf16c5cc1841e9de4471b0faf5405caab88848c4ad725e8b1f6c93c95516c', 'acl17-reconciliation-20261104/strict-private-comparison.json': '06d67343800c9dabffe14af24628d7539f04101d611139edb7306ecf6dfad0f5', 'acl17-reconciliation-20261104/intent.json': 'f4d919428ccb6fe310bde105120b0cd64503670fbb2df7f6b6e68f7ba565c412', 'acl17-reconciliation-20261104/private-restored.json': '5f7380c287780edcd3d94ba44da09d5f8f6f6014288d1f74145d4c6b96f9b3d2', 'acl17-reconciliation-20261104/plan.json': 'b6534500bf0acc823c237b88c9482c5cb825f07cde46889a5800cdab3b8781b1', 'private2-reconciliation-20261104/strict-private-comparison.json': '8ee8848b26b9024a3467006ace126ff84c2a5cc78ca5f136f020a76014d5bbce', 'private2-reconciliation-20261104/intent.json': 'be2432cf4724fd4446fb54581234f8cf30e669d808313382b6e000590d6cf990', 'private2-reconciliation-20261104/private-restored.json': 'a9fe3c6837ae92ce03ff007a650e2c92e23b134697e54658e4d6be140634c641', 'private2-reconciliation-20261104/result.json': 'fda8610f0b849a799cf1c3d593d41ab918d687f5f5bf89a9d53a2e392897e106', 'private2-reconciliation-20261104/strict-core-comparison.json': '74baf16c5cc1841e9de4471b0faf5405caab88848c4ad725e8b1f6c93c95516c', 'private2-reconciliation-20261104/plan.json': 'b5e6fa5a890408bef62236cfcd8b55fa5301ca6d5fcafc34d577b4ffc393c1b6'}
ARTIFACTS = frozenset(EXPECTED_PINS)
EXTERNAL = {
    'v04-fresh-checkpoint-20261104/intent.json': '657d3fdd9040f2228d6928339f08523f69f62dc3b8bcbf1134c9725a6c7cd89b',
    'v04-fresh-checkpoint-20261104/native-receipt.json': '695848a3f26da875b859c6589952eb9154ed0fae36f365b254b20e881cc793d6',
    'v04-fresh-checkpoint-20261104/private-before.json': 'a9fe3c6837ae92ce03ff007a650e2c92e23b134697e54658e4d6be140634c641',
    'v04-fresh-checkpoint-20261104/result.json': '129d03372228638911938f8e7b866c7c37db40b469ff2c335da268d1163da104',
}
SQL_SHA = '8998abebb4b8a9805bfd78bd7e9d51f99d183e92388e9430979117cc7a4be327'
PLAN_SHA = '9513e774f31d49b228e4c20ff7316d0b9c2a4594d2a1b40838a44f64006bc39a'
RUNNER_SHA = 'fe94889b0cebf9c546eb1587a0a5bcb4b94b2d34b96665621140e599014ea519'


class Rejected(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def validate_bundle(binding, raw):
    """Pure cross-artifact validation; the runtime separately pins binding bytes."""
    require(binding['schemaVersion'] == 1 and binding['checkpoint'] == CHECKPOINT, 'binding_version_checkpoint')
    require(binding['status'] == 'NOT_READY_FOR_RELEASE_CONSUMPTION'
            and binding['releaseAuthorizedByThisBinding'] is False, 'binding_release_boundary')
    require(binding['sourceId'] == SOURCE_ID and binding['targetId'] == TARGET_ID
            and binding['sourceId'] != binding['targetId'] and binding['image'] == IMAGE, 'binding_identity')
    require(binding['autoRetryBackup'] is False and binding['proofPublicUseAllowed'] is False, 'binding_operation_boundary')
    require(set(binding['artifactsRelativeToCheckpoint']) == ARTIFACTS and set(raw) == ARTIFACTS, 'artifact_allowlist')
    require(binding['artifactsRelativeToCheckpoint'] == EXPECTED_PINS, 'reviewed_all_parent_pins')
    require(binding['helperSha256'] == '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2', 'pinned_helper')
    for name, expected in binding['artifactsRelativeToCheckpoint'].items():
        require(digest(raw[name]) == expected, 'artifact_hash')
    require(digest(raw['receipt.json']) == '695848a3f26da875b859c6589952eb9154ed0fae36f365b254b20e881cc793d6' and digest(raw['source-inventory.private']) == '5649143950763b044dd46221bb4d86ab0715a384927fc0ef5d0a70c3c7acb32a', 'fresh_parent_pins')
    require(binding['dump'] == {'bytes':2415654600,'sha256':'7bd80f0749d0c898def87091584fa6fd0cb0e50f08196dfd76c9f051ce0adfea'}, 'fresh_archive_pin')
    original = json.loads(raw['receipt.json'])
    intent = json.loads(raw[OP+'intent.json'])
    plan = json.loads(raw[OP+'plan.json'])
    result = json.loads(raw[OP+'result.json'])
    core = json.loads(raw[OP+'strict-core-comparison.json'])
    private = json.loads(raw[OP+'strict-private-comparison.json'])
    require(original['status'] == 'failed' and original['startedAt'] == CHECKPOINT, 'original_failure_checkpoint')
    require(original['source'] == SOURCE and original['sourceContainerId'] == SOURCE_ID
            and original['sourceImage'] == IMAGE and original['target'] == TARGET
            and original['privateDirectory'] == str(ROOT), 'original_identity')
    require(original['dumpBytes'] == binding['dump']['bytes']
            and original['dumpSha256'] == binding['dump']['sha256'], 'original_dump_binding')
    require(intent['target'] == TARGET and intent['targetId'] == TARGET_ID
            and intent['sourceId'] == SOURCE_ID and intent['helperSha256'] == binding['helperSha256']
            and intent['planSha256'] == PLAN_SHA and intent['runnerSha256'] == RUNNER_SHA
            and intent['sourceSqlWrites'] is False, 'correction_intent')
    original_hash = digest(raw['receipt.json'])
    require(intent['originalReceiptSha256'] == original_hash
            and result['originalReceiptSha256'] == original_hash, 'original_receipt_link')
    require(result['status'] == 'PASS_OWNED_COPY_PRIVATE2_RECONCILIATION'
            and result['checkpoint'] == CHECKPOINT and result['target'] == TARGET
            and result['targetId'] == TARGET_ID and result['dumpSha256'] == binding['dump']['sha256'], 'correction_identity_status')
    require(all(result[k] is True for k in ('strictCoreEqual', 'strictPrivateEqual', 'targetStopped',
            'sourceIdentityUnchanged', 'sourceHealthyAfter', 'originalFailurePreserved',
            'sourceCatalogUnchanged', 'sourcePrivateUnchanged', 'cleanupConfirmed', 'materializationAndTenGiBReserveAfter')), 'correction_postconditions')
    require(result['sourceSqlWrites'] is False and result['helperReplaced'] is False
            and result['portsPublished'] is False and result['cronEnabled'] is False
            and result['network'] == 'none', 'correction_isolation')
    require(plan['objectCount'] == 2 and plan['objects'] == ['consultation_private','portfolio_private']
            and len(set(plan['objects'])) == 2 and result['objectCount'] == 2
            and plan['sqlSha256'] == SQL_SHA and result['sqlSha256'] == SQL_SHA, 'correction_plan')
    require(core['equal'] is True and core['sourceLines'] == 2084 and core['targetLines'] == 2084
            and core['sourceOnly'] == [] and core['targetOnly'] == [], 'strict_core_comparison')
    require(private['equal'] is True and private['functions'] == 19 and private['schemas'] == 3
            and type(private['relations']) is int and private['relations'] == 0, 'strict_private_comparison')
    parent = json.loads(raw['acl17-reconciliation-20261104/result.json'])
    require(parent['status'] == 'not_accepted' and parent['strictCoreEqual'] is True
            and parent['failureCode'] == 'strict_private_comparison_failed', 'core17_failure_preserved')
    require(digest(raw[OP+'private-restored.json']) == 'a9fe3c6837ae92ce03ff007a650e2c92e23b134697e54658e4d6be140634c641', 'final_private_exact_bytes')
    # No live row-count exception is ever applied to core comparison above.
    return {'originalStatus': 'failed', 'correctionStatus': result['status'],
            'originalReceiptSha256': original_hash, 'correctionReceiptSha256': digest(raw[OP+'result.json'])}


def validate_states(source, target):
    require(source['Id'] == SOURCE_ID and source['Image'] == IMAGE and source['State']['Running'] is True
            and source['State'].get('Health', {}).get('Status') == 'healthy', 'live_source_identity_health')
    require(target['Id'] == TARGET_ID and target['Name'] == '/'+TARGET and target['Image'] == IMAGE
            and target['State']['Running'] is False, 'live_proof_identity_stopped')
    require(target['HostConfig']['NetworkMode'] == 'none' and not target['HostConfig'].get('PortBindings')
            and not any((target['NetworkSettings'].get('Ports') or {}).values()), 'live_proof_offline')
    require(target['Config'].get('Labels', {}).get('portfolio.recovery') == 'isolated-proof'
            and 'cron.launch_active_jobs=off' in (target['Config'].get('Cmd') or []), 'live_proof_owner_cron')
    source_mounts = {m['Source'] for m in source['Mounts']}
    mounts = target['Mounts']
    require(any(m.get('Type') == 'bind' and m.get('Source') == str(ROOT)
                and m.get('Destination') == '/recovery' and m.get('RW') is False for m in mounts), 'live_proof_archive_mount')
    require(all(m.get('Source') not in source_mounts for m in mounts), 'live_proof_source_mount_overlap')


def inspect(name):
    require(name in (SOURCE, TARGET), 'inspect_allowlist')
    process = subprocess.run(['docker', 'inspect', name], capture_output=True, timeout=15)
    require(process.returncode == 0, 'inspect_failed')
    return json.loads(process.stdout)[0]


def opened(base, name, private=True):
    relative = PurePosixPath(name)
    require(not relative.is_absolute() and relative.parts and all(p not in ('.', '..') for p in relative.parts), 'relative_path')
    require(base.resolve(strict=True) == base, 'base_symlink')
    directory = os.open(base, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(directory)
        require(info.st_uid == 0 and info.st_mode & (0o077 if private else 0o022) == 0, 'directory_permissions')
        for component in relative.parts[:-1]:
            next_directory = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = next_directory
            info = os.fstat(directory)
            require(info.st_uid == 0 and info.st_mode & (0o077 if private else 0o022) == 0, 'directory_permissions')
        fd = os.open(relative.parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
                    and info.st_mode & (0o077 if private else 0o022) == 0, 'artifact_permissions')
        except Exception:
            os.close(fd)
            raise
        return os.fdopen(fd, 'rb')
    finally:
        os.close(directory)


def stable_read(base, name):
    with opened(base, name) as stream:
        before = os.fstat(stream.fileno())
        require(before.st_size <= 512*1024, 'small_artifact_limit')
        raw = stream.read(512*1024+1)
        after = os.fstat(stream.fileno())
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                and len(raw) == before.st_size, 'artifact_changed_during_read')
        return raw


def run(binding_bytes, reviewed_binding_sha256):
    require(os.name == 'posix', 'linux_only')
    require(PINNED_BINDING_SHA is not None, 'fresh_success_binding_not_reviewed')
    require(reviewed_binding_sha256 == PINNED_BINDING_SHA
            and digest(binding_bytes) == reviewed_binding_sha256, 'reviewed_binding_hash')
    import fcntl
    binding = json.loads(binding_bytes)
    os.nice(19)
    with opened(BASE, '.cashflow-release.lock', private=False) as lock:
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        source_before, target_before = inspect(SOURCE), inspect(TARGET)
        validate_states(source_before, target_before)
        raw = {name: stable_read(ROOT, name) for name in ARTIFACTS}
        verdict = validate_bundle(binding, raw)
        supplemental = {}
        for name, expected in EXTERNAL.items():
            value = stable_read(BASE, name)
            supplemental[name] = value
            require(digest(value) == expected, 'supplementary_artifact_hash')
            parsed = json.loads(value)
            if name.endswith('private-before.json'):
                require(len(parsed['schemas']) == 3 and len(parsed['functions']) == 19
                        and type(parsed['relations']) is int and parsed['relations'] == 0, 'supplementary_scope')
            elif name.endswith('/result.json'):
                require(parsed['status'] == 'not_accepted', 'old_wrapper_failure_preserved')
        require(json.loads(raw[OP+'private-restored.json']) == json.loads(supplemental['v04-fresh-checkpoint-20261104/private-before.json']), 'private_literal_full_equality')
        with opened(Path('/root/portfolio-recovery-tools'), 'cashflow-native-reviewed.py', private=False) as helper:
            require(digest(helper.read(65537)) == binding['helperSha256'], 'helper_hash')
        with opened(ROOT, 'postgres.dump') as dump:
            before = os.fstat(dump.fileno())
            require(before.st_size == binding['dump']['bytes'], 'dump_size')
            hasher = hashlib.sha256()
            for chunk in iter(lambda: dump.read(1024*1024), b''):
                hasher.update(chunk)
            after = os.fstat(dump.fileno())
            require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                    == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'dump_changed_during_read')
            require(hasher.hexdigest() == binding['dump']['sha256'], 'dump_hash')
        # Re-read small artifacts after the full dump hash, under the same lock.
        require(all(stable_read(ROOT, name) == value for name, value in raw.items()), 'receipts_changed_during_read')
        require(all(stable_read(BASE, name) == value for name, value in supplemental.items()), 'supplementary_changed_during_read')
        validate_states(inspect(SOURCE), inspect(TARGET))
        require(os.statvfs('/').f_bavail * os.statvfs('/').f_frsize >= 13164263020, 'materialization_reserve')
        return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'status': 'PASS_PINNED_SQL_RESTORE_READ_GATE', 'checkpoint': CHECKPOINT, **verdict,
            'bindingSha256': reviewed_binding_sha256, 'sourceId': SOURCE_ID, 'targetId': TARGET_ID,
            'dumpSha256': hasher.hexdigest(), 'dumpBytes': before.st_size,
            'proofStopped': True, 'proofNetwork': 'none', 'proofPortsPublished': False,
            'sourceHealthy': True, 'sqlExecuted': False, 'backupRetried': False,
            'filesTransferred': False, 'captureConsumerIntegrated': False,
            'installerConsumerIntegrated': False, 'releaseAuthorized': False,
            'limits': ['SQL restore attestation only', 'No Storage binary backup',
                       'Supplementary private catalog and globals do not share the exported core snapshot',
                       'Capture/installer must explicitly adopt this versioned attestation before use']}


if __name__ == '__main__':
    raise SystemExit('Explicit reviewed launcher required; no operation performed')
