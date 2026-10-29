"""Offline Linux/Windows verification only. Never invokes installer.run or commands."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

if not __debug__:
    raise RuntimeError('optimized_python_disables_verification_checks')

PINS = {
    'sql/consultation_workflow.sql': '4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91',
    'sql/consultation_roster.sql': '03ccf7c622640ca508d8f60f6b1e8825de959ab038679c8cd798b87f331b5523',
    'sql/consultation_replies.sql': '57702c0090d643fa3eacd765ac19aecb36acd7254a161524dbe6b9326da4f49a',
    'scripts/testing/consultation-next/install-native.py': '5b5b082907609f8834fdc0f785579a00cda60f4b5ae8512875b5ea2935be6e5f',
    'supabase/migrations/20261029142010_consultation_feedback_states.sql': '32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda',
    'docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql': 'aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa',
}


def verify(root):
    root = Path(root).resolve(strict=True)
    manifest = json.loads((root / 'MANIFEST.json').read_text(encoding='utf-8'))
    assert manifest['contract'] == 'start-a-transfer.v1'
    assert manifest['sourceSha'] == 'b08687b233d5fe1317748b6adff61653d58dadd8'
    assert manifest['automaticInstall'] is False and manifest['authorizationGranted'] is False
    assert len(manifest['files']) == len(PINS)
    assert {item['path'] for item in manifest['files']} == set(PINS)
    files = {}
    for item in manifest['files']:
        path = root / item['path']
        assert path.resolve(strict=True).is_relative_to(root) and not path.is_symlink()
        raw = path.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == item['sha256'] == PINS[item['path']]
        assert len(raw) == item['size']
        files[item['path']] = raw
    installer_path = root / 'scripts/testing/consultation-next/install-native.py'
    spec = importlib.util.spec_from_file_location('verified_transfer_installer', installer_path)
    installer = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(installer)
    # Even if a future accidental caller includes baseline, the pinned payload builder ignores it.
    def forbidden(*args, **kwargs):
        raise RuntimeError('verification_must_not_execute_commands')
    installer.command = forbidden
    installer.subprocess.run = forbidden
    assert set(installer.SQL_HASHES) == {'sql/consultation_roster.sql', 'sql/consultation_replies.sql'}
    assert installer.BASELINE_SHA == PINS['sql/consultation_workflow.sql']
    sentinel = b'BASELINE_MUST_NEVER_BE_EXECUTED'
    payload = installer.atomic_payload({**files, 'sql/consultation_workflow.sql': sentinel})
    assert sentinel.decode() not in payload
    assert 'consultation_feedback_states' not in payload
    assert 'CREATE TABLE public.consultation_advisors' not in payload
    return {'status': 'VERIFIED_TRANSFER_ONLY', 'baselineInExecutablePayload': False,
            'pr314ExecutableFiles': sorted(installer.SQL_HASHES),
            'pr314PayloadSha256': hashlib.sha256(payload.encode()).hexdigest(),
            'startAMigrationExecuted': False, 'installationExecuted': False}


if __name__ == '__main__':
    assert len(sys.argv) == 2, 'usage: python3 verify-transfer.py EXTRACTED_ARTIFACT'
    print(json.dumps(verify(sys.argv[1]), sort_keys=True))
