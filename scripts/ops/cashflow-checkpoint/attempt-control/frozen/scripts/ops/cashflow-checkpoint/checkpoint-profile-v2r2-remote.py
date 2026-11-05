"""Explicit failed-checkpoint profile. Import is pure; run needs a pinned caller.

No backup, restore, SQL, file mutation, key creation or service-right operation.
Native execution of this candidate requires separate operator authorization.
"""
import base64
import datetime
import hashlib
import json
import os
import stat
import sys
import types

POLICY_SHA = '6a1c0113a53a7ac4d8f1cc07e2514fec07f13ec7bd5c4d2987e87120102837cc'
CONSUMER_SHA = '18dcdff88cb8d41f8c5ee9e8236e0fdba9e7a212ef8c1044769165cc8010ac2c'


class ReconcileRequired(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise ReconcileRequired(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def policy_bytes(raw):
    require(type(raw) is bytes and digest(raw) == POLICY_SHA, 'policy_pin')
    value = json.loads(raw)
    require(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode() == raw,
            'policy_canonical_bytes')
    return value


def classify_child_probe(open_child, close_child):
    """Only the child open's ENOENT is absence; parent checks occur outside."""
    try:
        fd = open_child()
    except FileNotFoundError:
        return True
    close_child(fd)
    raise ReconcileRequired('final_appeared')


def absent(gate):
    root = gate.ROOT
    require(root.resolve(strict=True) == root, 'root_symlink')
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        before = os.fstat(directory)
        require(before.st_uid == 0 and before.st_mode & 0o077 == 0, 'root_owner_mode')
        classify_child_probe(lambda: os.open('comparison.private.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                             dir_fd=directory), os.close)
        current = os.stat(root, follow_symlinks=False)
        require((before.st_dev, before.st_ino) == (current.st_dev, current.st_ino), 'root_replaced')
    finally:
        os.close(directory)


def signature(s):
    return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_uid, s.st_mode


def source_pair(gate, role):
    require(role['origin'] in ('checkpoint', 'external'), 'source_origin')
    return (gate.ROOT if role['origin'] == 'checkpoint' else gate.BASE), role['name']


def present_record(role, raw, owner):
    return {'role': role['role'], 'name': role['name'], 'origin': role['origin'],
            'state': 'present', 'length': len(raw), 'sha256': digest(raw), 'owner': owner}


def check_expected(role, record):
    require(record['role'] == role['role'] and record['name'] == role['name']
            and record['origin'] == role['origin'], 'role_identity')
    if role['expectedLength'] is not None:
        require(record['length'] == role['expectedLength'], 'role_length')
    if role['expectedSha256'] is not None:
        require(record['sha256'] == role['expectedSha256'], 'role_hash')


def metadata(gate, consumer, binding, policy):
    # ENOENT and all small pinned inputs are checked BEFORE the full dump gate.
    absent(gate)
    records = []
    for i, role in enumerate(policy['roles']):
        if i == 5:
            records.append({'role': role['role'], 'name': role['name'], 'origin': role['origin'],
                'state': 'absent', 'length': None, 'sha256': None, 'owner': None,
                'observation': {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'method': 'OWNED_PARENT_CHILD_ENOENT_SHARED_LOCK',
                    'neverCreated': None, 'historicalNotDeleted': None}})
        elif i == 0:
            with gate.opened(*source_pair(gate, role)) as f:
                s = os.fstat(f.fileno())
                require(s.st_size == role['expectedLength'], 'dump_stat_length')
            records.append({'role': role['role'], 'name': role['name'], 'origin': role['origin'],
                'state': 'present', 'length': s.st_size, 'sha256': role['expectedSha256'], 'owner': 0})
        elif role['origin'] != 'memory':
            base, name = source_pair(gate, role)
            raw = gate.stable_read(base, name)
            record = present_record(role, raw, 0)
            check_expected(role, record)
            records.append(record)
        elif i == 15:
            record = present_record(role, binding, None)
            check_expected(role, record)
            records.append(record)
        else:
            records.append(None)
    attestation = gate.run(binding, consumer.BINDING_SHA)
    consumer.validate_attestation(attestation)
    require(attestation['dumpSha256'] == records[0]['sha256']
            and attestation['dumpBytes'] == records[0]['length'], 'gate_dump_binding')
    raw_attestation = json.dumps(attestation, separators=(',', ':')).encode('utf8')
    records[16] = present_record(policy['roles'][16], raw_attestation, None)
    for i, role in enumerate(policy['roles']):
        if i not in (0, 5) and role['origin'] != 'memory':
            raw = gate.stable_read(*source_pair(gate, role))
            require(len(raw) == records[i]['length'] and digest(raw) == records[i]['sha256'],
                    'small_artifact_changed_during_gate')
    absent(gate)
    return {'artifacts': records, 'attestationBase64': base64.b64encode(raw_attestation).decode(),
            'policySha256': POLICY_SHA, 'readiness': False, 'releaseAuthorized': False}


def run(packet, mode, index=-1, length=0, expected_hash=''):
    require(os.name == 'posix', 'linux_only')
    import fcntl
    require(type(packet) is dict and set(packet) == {'consumer', 'gate', 'binding', 'policy'}, 'packet_keys')
    policy = policy_bytes(base64.b64decode(packet['policy'], validate=True))
    code = base64.b64decode(packet['consumer'], validate=True)
    require(digest(code) == CONSUMER_SHA, 'consumer_pin')
    consumer = types.ModuleType('pinned_r2_consumer')
    exec(compile(code, '/in-memory/corrected-checkpoint-consumer.py', 'exec'), consumer.__dict__)
    gate, binding = consumer.load_gate({'gate': packet['gate'], 'binding': packet['binding']})
    require(policy['parentBindingSha256'] == consumer.BINDING_SHA, 'parent_binding')
    require(mode in ('metadata', 'file'), 'mode')
    with gate.opened(gate.BASE, '.cashflow-release.lock', private=False) as lock:
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        gate.validate_states(gate.inspect(gate.SOURCE), gate.inspect(gate.TARGET))
        if mode == 'metadata':
            result = metadata(gate, consumer, binding, policy)
            gate.validate_states(gate.inspect(gate.SOURCE), gate.inspect(gate.TARGET))
            print(json.dumps(result, separators=(',', ':')))
            return
        require(type(index) is int and 0 <= index < 15 and index != 5
                and type(length) is int and length >= 0, 'file_index_length')
        role = policy['roles'][index]
        require(role['requiredState'] == 'present' and role['origin'] != 'memory', 'absent_not_stream')
        check_expected(role, {'role': role['role'], 'name': role['name'], 'origin': role['origin'],
                             'length': length, 'sha256': expected_hash})
        absent(gate)
        with gate.opened(*source_pair(gate, role)) as f:
            before = os.fstat(f.fileno())
            require(before.st_size == length, 'stream_size')
            h = hashlib.sha256(); count = 0
            for chunk in iter(lambda: f.read(65536), b''):
                count += len(chunk)
                require(count <= length, 'stream_overflow')
                h.update(chunk); sys.stdout.buffer.write(chunk)
            require(count == length and h.hexdigest() == expected_hash
                    and signature(before) == signature(os.fstat(f.fileno())), 'stream_changed')
        absent(gate)
        gate.validate_states(gate.inspect(gate.SOURCE), gate.inspect(gate.TARGET))


if __name__ == '__main__':
    raise SystemExit('Reviewed explicit caller required; no operation performed')
