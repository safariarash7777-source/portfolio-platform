"""Versioned read-only adapter; legacy helper remains untouched."""
import base64
import hashlib
import types

GATE_V2_SHA = 'a90996ce371a97701c50d5937fa11f866911f9387cbf9f4a1b130e4563c1fc3a'
BINDING_V2_SHA = '390fc73da29c3b53e267c4566eb538ebb0142c6426a032b41e27e969eaa5ac27'
CONSUMERS_V2 = frozenset(('install-native.review-corrected.v2',))

def require(value, code):
    if not value:
        raise ValueError(code)


def decode(value, maximum):
    require(isinstance(value, str) and len(value) <= maximum * 2, 'payload_size')
    raw = base64.b64decode(value, validate=True)
    require(len(raw) <= maximum, 'payload_size')
    return raw


def load_gate_v2(bundle):
    require(type(bundle) is dict and set(bundle) == {'gate', 'binding'}, 'payload_keys')
    code = decode(bundle['gate'], 65536)
    binding = decode(bundle['binding'], 32768)
    require(hashlib.sha256(code).hexdigest() == GATE_V2_SHA, 'gate_source_changed')
    require(hashlib.sha256(binding).hexdigest() == BINDING_V2_SHA, 'binding_changed')
    module = types.ModuleType('reviewed_corrected_checkpoint_gate')
    exec(compile(code, '/in-memory/checkpoint-read-gate.py', 'exec'), module.__dict__)
    return module, binding


def validate_attestation_v2(result):
    require(type(result) is dict and result.get('status') == 'PASS_PINNED_SQL_RESTORE_READ_GATE',
            'gate_not_passed')
    require(result.get('checkpoint') == '20261103T222239Z'
            and result.get('bindingSha256') == BINDING_V2_SHA
            and result.get('originalStatus') == 'failed'
            and result.get('correctionStatus') == 'PASS_OWNED_COPY_PRIVATE2_RECONCILIATION',
            'receipt_profile_changed')
    require(result.get('sourceId') == '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
            and result.get('targetId') == '458c668152b9bab455512c440889229452e0f3b23297bda236936fb2d1f8a065'
            and result.get('dumpSha256') == '7bd80f0749d0c898def87091584fa6fd0cb0e50f08196dfd76c9f051ce0adfea'
            and type(result.get('dumpBytes')) is int and result['dumpBytes'] == 2415654600,
            'gate_identity_changed')
    require(result.get('proofStopped') is True and result.get('proofNetwork') == 'none'
            and result.get('proofPortsPublished') is False and result.get('sourceHealthy') is True,
            'gate_isolation_changed')
    require(all(result.get(key) is False for key in ('sqlExecuted', 'backupRetried',
            'filesTransferred', 'releaseAuthorized', 'captureConsumerIntegrated',
            'installerConsumerIntegrated')), 'gate_boundary_changed')


def review_v2(consumer, bundle):
    require(consumer in CONSUMERS_V2, 'unknown_consumer')
    gate, binding = load_gate_v2(bundle)
    result = gate.run(binding, BINDING_V2_SHA)
    validate_attestation_v2(result)
    return {'status': 'PASS_CORRECTED_CHECKPOINT_CONSUMER_REVIEW',
            'consumer': consumer, 'consumerVersion': 2, 'gateSha256': GATE_V2_SHA,
            'attestation': result, 'readOnlyConsumerIntegrated': True,
            'captureVerifyProfileIntegrated': False, 'legacyApplyPathIntegrated': False,
            'releaseAuthorized': False,
            'limits': ['Read-only consumer mode only; no SQL or encrypted archive transfer',
                       'Legacy seven-file Capture/Verify and old apply path remain unchanged',
                       'No current schema/capacity, Storage binary, deployed reader or service-right acceptance']}


if __name__ == '__main__':
    raise SystemExit('Explicit reviewed caller required; nothing executed')
