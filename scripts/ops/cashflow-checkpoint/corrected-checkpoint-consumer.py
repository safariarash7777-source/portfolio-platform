"""Read-only adoption of the pinned ACL19 attestation by existing operator tools.

This does not extend the encrypted archive format or authorize an install.
The reviewed gate runs in memory and performs its own lock/live/dump checks.
"""
import base64
import hashlib
import types

GATE_SHA = '9289f162919bd1b2e462d2c823758b7b693f27988562d3554be197c9b65666a3'
BINDING_SHA = '7819e0fb16bbb2c9171099cab07953c3137634d665616af509d4061306af9325'
CONSUMERS = frozenset(('backup-checkpoint.review-corrected.v1',
                       'install-native.review-corrected.v1'))


def require(value, code):
    if not value:
        raise ValueError(code)


def decode(value, maximum):
    require(isinstance(value, str) and len(value) <= maximum * 2, 'payload_size')
    raw = base64.b64decode(value, validate=True)
    require(len(raw) <= maximum, 'payload_size')
    return raw


def load_gate(bundle):
    require(type(bundle) is dict and set(bundle) == {'gate', 'binding'}, 'payload_keys')
    code = decode(bundle['gate'], 65536)
    binding = decode(bundle['binding'], 32768)
    require(hashlib.sha256(code).hexdigest() == GATE_SHA, 'gate_source_changed')
    require(hashlib.sha256(binding).hexdigest() == BINDING_SHA, 'binding_changed')
    module = types.ModuleType('reviewed_corrected_checkpoint_gate')
    exec(compile(code, '/in-memory/checkpoint-read-gate.py', 'exec'), module.__dict__)
    return module, binding


def validate_attestation(result):
    require(type(result) is dict and result.get('status') == 'PASS_PINNED_SQL_RESTORE_READ_GATE',
            'gate_not_passed')
    require(result.get('checkpoint') == '20261030T215307Z'
            and result.get('bindingSha256') == BINDING_SHA
            and result.get('originalStatus') == 'failed'
            and result.get('correctionStatus') == 'PASS_OWNED_COPY_ACL19_RECONCILIATION',
            'receipt_profile_changed')
    require(result.get('sourceId') == '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
            and result.get('targetId') == '833a8447c01570811d6a0ad50cafee00745614b811ef9668acb0d944e04b21f1'
            and result.get('dumpSha256') == '87434f8c53cca9910cdbd953415ffed5e01d3aacb0db8c0702a4e164253c8c17'
            and type(result.get('dumpBytes')) is int and result['dumpBytes'] == 2406546295,
            'gate_identity_changed')
    require(result.get('proofStopped') is True and result.get('proofNetwork') == 'none'
            and result.get('proofPortsPublished') is False and result.get('sourceHealthy') is True,
            'gate_isolation_changed')
    require(all(result.get(key) is False for key in ('sqlExecuted', 'backupRetried',
            'filesTransferred', 'releaseAuthorized', 'captureConsumerIntegrated',
            'installerConsumerIntegrated')), 'gate_boundary_changed')


def review(consumer, bundle):
    require(consumer in CONSUMERS, 'unknown_consumer')
    gate, binding = load_gate(bundle)
    result = gate.run(binding, BINDING_SHA)
    validate_attestation(result)
    return {'status': 'PASS_CORRECTED_CHECKPOINT_CONSUMER_REVIEW',
            'consumer': consumer, 'consumerVersion': 1, 'gateSha256': GATE_SHA,
            'attestation': result, 'readOnlyConsumerIntegrated': True,
            'captureVerifyProfileIntegrated': False, 'legacyApplyPathIntegrated': False,
            'releaseAuthorized': False,
            'limits': ['Read-only consumer mode only; no SQL or encrypted archive transfer',
                       'Legacy seven-file Capture/Verify and old apply path remain unchanged',
                       'No current schema/capacity, Storage binary, deployed reader or service-right acceptance']}


if __name__ == '__main__':
    raise SystemExit('Use an explicitly reviewed existing operator caller; no operation performed')
