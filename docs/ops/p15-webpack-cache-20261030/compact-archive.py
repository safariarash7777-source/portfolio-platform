"""Lossless cold-checkpoint representation migration, never a DB/service operation.

prepare retains the original, verifies the entire decoded stream, materializes an
actual temporary raw file in private tmpfs, and exercises the existing pg_restore
reader. promote removes ONLY the redundant raw representation after revalidation.
materialize restores its exact old pathname before any legacy checkpoint consumer.
Unknown/interrupted attempts only return readback; no automatic mutation retry.
"""
import datetime
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time

BASE = Path('/root/portfolio-recovery-backups')
OPS = BASE / 'archive-compaction-20261030'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
CHECKPOINTS = {
    '20261003T101406Z': (2368435622, 'f725d1b02a820b78c859584ec648100ce208f6d622086d0f29d318c319af9635'),
    '20261006T092801Z': (2369907015, '66c1fa90e750df28818d65fbaffcd00436bf04cc53bf04c3365f2728414ee04b'),
    '20261009T163452Z': (2372409614, 'c7f28334b1818cf92f3d136628abc93f92849a71b6810481f35f34325589cfd2'),
    '20261017T114409Z': (2378622379, '1ed1428213f5e70d60c211984b4b1b1f661962dfe30912992ba3e0fc3059250f'),
}
GUARD = 10 * 1024 ** 3


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def free(path='/'):
    v = os.statvfs(path)
    return v.f_bavail * v.f_frsize


def memory_available():
    return int(next(s for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith('MemAvailable:')).split()[1]) * 1024


def canonical(path):
    assert path.resolve(strict=True) == path and not path.is_symlink(), 'noncanonical path'
    for parent in path.parents:
        assert not parent.is_symlink(), 'symlink ancestor'


def private_file(path):
    canonical(path)
    s = path.lstat()
    assert stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1 and s.st_mode & 0o077 == 0
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(2 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def once(path, value):
    with path.open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    sync_directory(path.parent)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def other_files(directory):
    # Preserve historical receipt/inventory/globals/cron/log bytes exactly.
    return {p.name: sha(p) for p in sorted(directory.iterdir()) if p.is_file()
            and p.name not in ('postgres.dump', 'postgres.dump.gz', 'RESTORE-RAW-PATH-20261030.json')}


def no_active_consumer(raw):
    for cid in subprocess.check_output(['docker', 'ps', '-aq'], text=True).split():
        c = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
        if c['State']['Running'] or c['State']['Restarting']:
            for mount in c.get('Mounts', []):
                assert not (str(raw) == mount['Source'] or str(raw).startswith(mount['Source'].rstrip('/') + '/')), 'active mounted checkpoint'
    s = raw.stat()
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            descriptors = list((process / 'fd').iterdir())
        except (FileNotFoundError, ProcessLookupError):
            continue
        for descriptor in descriptors:
            try:
                f = descriptor.stat()
            except (FileNotFoundError, ProcessLookupError):
                continue
            assert (s.st_dev, s.st_ino) != (f.st_dev, f.st_ino), 'checkpoint currently open'


def decode(compressed, output=None):
    h, count = hashlib.sha256(), 0
    with gzip.open(compressed, 'rb') as stream:
        for chunk in iter(lambda: stream.read(2 * 1024 * 1024), b''):
            h.update(chunk)
            count += len(chunk)
            if output:
                assert memory_available() > 2 * 1024 ** 3, 'runtime memory floor'
                output.write(chunk)
    return count, h.hexdigest()


def readback(stamp):
    root, raw, compressed, operation = locations(stamp)
    return {'at': now(), 'stamp': stamp, 'rawPresent': raw.exists(), 'gzipPresent': compressed.exists(),
            'availableBytes': free(), 'receipts': {p.name: json.loads(p.read_text()) for p in sorted(operation.glob('*.json'))}}


def locations(stamp):
    assert stamp in CHECKPOINTS, 'checkpoint not allowlisted'
    root = BASE / stamp
    canonical(root)
    return root, root / 'postgres.dump', root / 'postgres.dump.gz', OPS / stamp


def run(stamp, mode, reviewed_source):
    assert mode in ('prepare', 'promote', 'materialize', 'readback')
    os.umask(0o077)
    os.nice(19)
    root, raw, compressed, operation = locations(stamp)
    expected = CHECKPOINTS[stamp]
    if mode == 'readback':
        return readback(stamp)
    OPS.mkdir(mode=0o700, exist_ok=True)
    operation.mkdir(mode=0o700, exist_ok=True)
    canonical(OPS)
    canonical(operation)
    with (BASE / '.cashflow-release.lock').open('rb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (operation / (mode + '-intent.json')).exists():
            return readback(stamp)
        preserved = other_files(root)
        if mode == 'prepare':
            identity = private_file(raw)
            assert identity[2] == expected[0] and not compressed.exists()
            no_active_consumer(raw)
            assert free() > GUARD + 32 * 1024 ** 2, 'disk guard'
            assert free('/dev/shm') > expected[0] + 64 * 1024 ** 2
            assert memory_available() > expected[0] + int(2.5 * 1024 ** 3), 'tmpfs recovery budget'
            once(operation / 'prepare-intent.json', {'at': now(), 'rawIdentity': identity, 'rawBytes': expected[0], 'rawSha256': expected[1], 'otherFiles': preserved})
            tool = operation / 'tool.py'
            with tool.open('x', encoding='utf-8') as stream:
                os.chmod(tool, 0o600)
                stream.write(reviewed_source)
                stream.flush()
                os.fsync(stream.fileno())
            source_hash = hashlib.sha256()
            partial = operation / 'postgres.dump.gz.part'
            started_wall, started_cpu = time.monotonic(), time.process_time()
            with raw.open('rb') as source, partial.open('xb') as target:
                os.chmod(partial, 0o600)
                with gzip.GzipFile(filename='', mode='wb', fileobj=target, compresslevel=1, mtime=0) as encoder:
                    for chunk in iter(lambda: source.read(2 * 1024 * 1024), b''):
                        assert free() > GUARD + 16 * 1024 ** 2, 'peak compression disk guard'
                        source_hash.update(chunk)
                        encoder.write(chunk)
                        # Bound this single compressor to approximately half one CPU.
                        delay = 2 * (time.process_time() - started_cpu) - (time.monotonic() - started_wall)
                        if delay > 0:
                            time.sleep(min(delay, 1))
                target.flush()
                os.fsync(target.fileno())
            assert source_hash.hexdigest() == expected[1] and private_file(raw) == identity
            assert decode(partial) == expected, 'decoded stream differs'
            # Exercise an actual legacy raw-file reader on the fully materialized
            # bytes, in a private RAM copy. No data is exported or restored to DB.
            with tempfile.TemporaryDirectory(prefix='portfolio-archive-read-', dir='/dev/shm') as temp:
                recovery = Path(temp) / 'postgres.dump'
                with recovery.open('xb') as output:
                    os.chmod(recovery, 0o600)
                    assert decode(partial, output) == expected
                    output.flush()
                    os.fsync(output.fileno())
                assert recovery.stat().st_size == expected[0] and sha(recovery) == expected[1]
                with (operation / 'catalog.private').open('xb') as catalog, (operation / 'catalog-errors.private').open('xb') as errors:
                    result = subprocess.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
                        '--log-driver=none', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=0',
                        '--memory=128m', '--cpus=0.5', '--pids-limit=32', '--label=portfolio.archive-reader=20261030',
                        '--name=portfolio-archive-read-' + stamp.lower(),
                        '--mount', 'type=bind,src=' + temp + ',dst=/recovery,readonly',
                        '--entrypoint=pg_restore', IMAGE, '--list', '/recovery/postgres.dump'],
                        stdout=catalog, stderr=errors, timeout=60)
                assert result.returncode == 0, 'legacy raw pg_restore reader failed'
            assert private_file(raw) == identity and other_files(root) == preserved
            assert not compressed.exists()
            os.rename(partial, compressed)
            sync_directory(root)
            once(operation / 'prepared.json', {'at': now(), 'rawIdentity': identity, 'rawBytes': expected[0],
                'rawSha256': expected[1], 'gzipBytes': compressed.stat().st_size, 'gzipSha256': sha(compressed),
                'otherFiles': preserved, 'decodedFullBytesAndHashEqual': True, 'actualTmpfsRawMaterialization': True,
                'legacyPgRestoreListExit': result.returncode, 'databaseRestore': False,
                'toolSha256': sha(tool), 'rawRetained': True, 'availableBytes': free()})
        elif mode == 'promote':
            prepared = json.loads((operation / 'prepared.json').read_text())
            assert private_file(raw) == tuple(prepared['rawIdentity'])
            assert sha(raw) == expected[1] and sha(compressed) == prepared['gzipSha256']
            assert compressed.stat().st_size == prepared['gzipBytes'] and decode(compressed) == expected
            assert other_files(root) == prepared['otherFiles'] and sha(operation / 'tool.py') == prepared['toolSha256']
            no_active_consumer(raw)
            assert free() >= GUARD
            once(operation / 'promote-intent.json', {'at': now(), 'onlyRedundantRawRepresentation': str(raw),
                'retainedGzip': str(compressed), 'rawSha256': expected[1], 'rawBytes': expected[0],
                'materializeCommand': 'python3 ' + str(operation / 'tool.py') + ' ' + stamp + ' materialize',
                'legacyConsumersMustMaterializeExactRawPathBeforeReuse': True})
            once(root / 'RESTORE-RAW-PATH-20261030.json', {
                'rawPath': str(raw), 'gzipPath': str(compressed), 'rawBytes': expected[0],
                'rawSha256': expected[1], 'gzipSha256': prepared['gzipSha256'],
                'materializerSha256': prepared['toolSha256'],
                'command': 'python3 ' + str(operation / 'tool.py') + ' ' + stamp + ' materialize',
                'requiredBeforeLegacyConsumer': True, 'historicalReceiptsUnchanged': True,
                'minimumAvailableBytesBeforeMaterialize': GUARD + expected[0] + 32 * 1024 ** 2})
            # No historical data bytes/receipt are discarded: exact decoded copy
            # and working raw-path materializer exist before this single unlink.
            canonical(root)
            parent = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                assert private_file(raw) == tuple(prepared['rawIdentity'])
                actual = os.stat(raw.name, dir_fd=parent, follow_symlinks=False)
                assert (actual.st_dev, actual.st_ino) == tuple(prepared['rawIdentity'][:2])
                os.unlink(raw.name, dir_fd=parent)
                os.fsync(parent)
            finally:
                os.close(parent)
            assert not raw.exists() and other_files(root) == preserved
            assert sha(compressed) == prepared['gzipSha256'] and decode(compressed) == expected
            once(operation / 'promoted.json', {'at': now(), 'rawPresent': False, 'gzipPresent': True,
                'decodedBytesPreserved': expected[0], 'rawSha256': expected[1], 'otherFilesUnchanged': True,
                'availableBytes': free(), 'servicesChanged': False})
        elif mode == 'materialize':
            assert not raw.exists(), 'legacy raw path already exists'
            prepared = json.loads((operation / 'prepared.json').read_text())
            assert sha(compressed) == prepared['gzipSha256']
            assert free() >= GUARD + expected[0] + 32 * 1024 ** 2, 'materialization peak capacity'
            once(operation / 'materialize-intent.json', {'at': now(), 'rawPath': str(raw), 'rawSha256': expected[1], 'rawBytes': expected[0]})
            temporary = operation / 'postgres.dump.materializing'
            with temporary.open('xb') as output:
                assert decode(compressed, output) == expected
                output.flush()
                os.fsync(output.fileno())
            assert sha(temporary) == expected[1] and not raw.exists()
            os.rename(temporary, raw)
            sync_directory(root)
            once(operation / 'materialized.json', {'at': now(), 'rawPresent': True, 'rawBytes': raw.stat().st_size,
                'rawSha256': sha(raw), 'gzipRetained': True, 'legacyExactPathRestored': True})
        return readback(stamp)


if __name__ == '__main__':
    source = globals().get('_reviewed_source') or Path(__file__).read_text(encoding='utf-8')
    print(json.dumps(run(sys.argv[1], sys.argv[2], source)))
