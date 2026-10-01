"""Publish only curated official FRED vintages; never change annual models/auth."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

EXPECTED = {
    'CPIAUCSL': 'Units: Index 1982-1984=100 , Seasonally Adjusted',
    'M2SL': 'Units: Billions of Dollars , Seasonally Adjusted',
    'GDPC1': 'Units: Billions of Chained 2017 Dollars , Seasonally Adjusted Annual Rate',
    'DFF': 'Units: Percent , Not Seasonally Adjusted',
    'DCOILBRENTEU': 'Units: Dollars per Barrel , Not Seasonally Adjusted',
}

def verify(directory):
    import fred_snapshot
    import numpy as np
    definitions = {item['series_id']: item for item in json.loads(
        (directory / 'fred-series-metadata.json').read_text(encoding='utf-8'))}
    checksums = {}
    for sid, expected in EXPECTED.items():
        definition = definitions[sid]
        if not definition.get('metadata_verified') or ' '.join(definition['units'].split()) != expected:
            raise ValueError('Unit definition changed: ' + sid)
        series = fred_snapshot.load(sid, directory)
        if series.empty or series.attrs['stale']:
            raise ValueError('Missing or stale vintage: ' + sid)
        if sid in ('CPIAUCSL', 'M2SL', 'GDPC1') and (series.dropna() <= 0).any():
            raise ValueError('Nonpositive economic index/aggregate: ' + sid)
        if sid in ('CPIAUCSL', 'M2SL'):
            derived = series.asfreq('MS').pct_change(12, fill_method=None)
            if np.isinf(derived).any():
                raise ValueError('Invalid derived annual change: ' + sid)
        checksums[sid] = series.attrs['sha256']
    return checksums

def remote_publish(stage):
    from source_health import DATA_DIR
    verify(stage)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = DATA_DIR / 'backups' / ('fred-' + stamp)
    backup.mkdir(parents=True)
    # Keep the previous metadata and all vintages before advancing latest.json.
    with tarfile.open(backup / 'previous.tar.gz', 'w:gz') as archive:
        for name in ['official-documents', 'fred-series-metadata.json', 'official-release-health.json']:
            if (DATA_DIR / name).exists():
                archive.add(DATA_DIR / name, arcname=name)
    previous = backup / 'previous.tar.gz'
    (backup / 'checksums.json').write_text(json.dumps({previous.name: hashlib.sha256(previous.read_bytes()).hexdigest()}))
    for sid in EXPECTED:
        source = stage / 'official-documents' / sid
        target = DATA_DIR / 'official-documents' / sid
        target.mkdir(parents=True, exist_ok=True)
        # Write immutable raw documents first; then atomically switch pointers.
        for document in source.glob('*.csv'):
            destination = target / document.name
            if destination.exists():
                if destination.read_bytes() != document.read_bytes():
                    raise ValueError('Immutable vintage conflict: ' + sid)
            else:
                shutil.copyfile(document, destination)
        temporary = target / ('latest.' + stamp + '.json')
        shutil.copyfile(source / 'latest.json', temporary)
        os.replace(temporary, target / 'latest.json')
    for name in ['fred-series-metadata.json', 'official-release-health.json']:
        temporary = DATA_DIR / (name + '.' + stamp)
        shutil.copyfile(stage / name, temporary)
        os.replace(temporary, DATA_DIR / name)
    result = verify(DATA_DIR)
    print(json.dumps({'status': 'published_verified_fred', 'checksums': result,
                      'annual_excel_updated': False, 'backup': str(backup)}))

def local_publish(force=False):
    root = Path(__file__).parent
    project = root.parents[1]
    dashboard = root / 'fx-dashboard'
    sys.path.insert(0, str(dashboard))
    from source_health import DATA_DIR
    desired = verify(DATA_DIR)
    runtime = os.environ['FX_BUNDLED_PYTHON']
    helper = root / 'vm_command.py'
    def ssh(*args):
        result = subprocess.run([runtime, str(helper), *args], capture_output=True,
                                text=True, encoding='utf-8', timeout=120)
        if result.returncode:
            raise RuntimeError('SSH operation failed; see local maintenance logs')
        return result.stdout.strip()
    # The verifier is a read-only helper, refreshed after container recreation.
    ssh('--upload', str(root / 'verify_us_version.py'), '/tmp/verify_us_version.py')
    current = json.loads(ssh('docker cp /tmp/verify_us_version.py fx-dashboard:/app/verify_us_version.py && docker exec -w /app fx-dashboard python verify_us_version.py'))
    if not force and {sid: row['sha256'] for sid, row in current['series'].items()} == desired:
        print(json.dumps({'status': 'already_published', 'checksums': desired,
                          'annual_excel_updated': False}))
        return
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    package = root / ('fred-validated-' + stamp + '.tar.gz')
    with tarfile.open(package, 'w:gz') as archive:
        for sid in EXPECTED:
            archive.add(DATA_DIR / 'official-documents' / sid, arcname='official-documents/' + sid)
        for name in ['fred-series-metadata.json', 'official-release-health.json']:
            archive.add(DATA_DIR / name, arcname=name)
    remote_archive = '/tmp/fred-validated-' + stamp + '.tar.gz'
    ssh('--upload', str(package), remote_archive)
    ssh('--upload', str(Path(__file__)), '/tmp/publish_verified_fred.py')
    host_stage = '/opt/fx-dashboard/data-health/staging/' + stamp
    container_stage = '/data-health/staging/' + stamp
    command = (f'mkdir -p {host_stage} && tar -xzf {remote_archive} -C {host_stage} && '
               'docker cp /tmp/publish_verified_fred.py fx-dashboard:/app/publish_verified_fred.py && '
               f'docker exec -w /app fx-dashboard python publish_verified_fred.py --remote {container_stage} && '
               'docker exec -w /app fx-dashboard python macro_health.py > /opt/fx-dashboard/data-health/macro-health-last-run.log && '
               'curl -fsS https://62.60.191.24/_stcore/health')
    ssh(command)
    final = json.loads(ssh('docker exec -w /app fx-dashboard python verify_us_version.py'))
    if {sid: row['sha256'] for sid, row in final['series'].items()} != desired:
        raise ValueError('Published version mismatch')
    print(json.dumps({'status': 'published_verified_fred', 'checksums': desired,
                      'annual_excel_updated': False, 'backup_timestamp': stamp}))

if __name__ == '__main__':
    if '--remote' in sys.argv:
        remote_publish(Path(sys.argv[-1]))
    else:
        local_publish()
