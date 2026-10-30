"""Exact-manifest optional Webpack pack cleanup; Linux stdlib, dry-run by default.

Invoke run(manifest, apply=False) after loading this module. No Docker operations,
recursive removals, data-cache removals, service changes, or provider calls.
An existing intent always returns readback, never resumes an uncertain mutation.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat

SOURCES = (
    '/opt/portfolio-accept195/source',
    '/opt/portfolio-auth-next-build-20261002/source',
    '/opt/portfolio-auth219-20261002/profiles/default/source',
    '/opt/portfolio-auth219-20261002/releases/07f05bdf1f1e2c459786e307cf8c3d0fc324eef3/main/source',
    '/opt/portfolio-auth219-20261002/releases/2e44dc1d7008acf0b0c76e8679238514f4f7bab2/main/source',
    '/opt/portfolio-auth219-20261002/releases/9b33fe4dacbddabf96dce0c6a27d8e9a9f03c4f5/main/source',
    '/opt/portfolio-auth219-20261002/source',
    '/opt/portfolio-candidate844-build/source',
    '/opt/portfolio-demo844/source-next-cfa4e21',
    '/opt/portfolio-demo844/source',
    '/opt/portfolio-p04-build-20261002/source',
)
RECEIPT = Path('/var/lib/portfolio-ops/webpack-cache-20261030')
PACK = re.compile(r'(?:client|server|edge-server)-production/(?:index|[0-9]+)\.pack(?:\.(?:gz|br))?(?:\.old)?\Z')


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def available():
    v = os.statvfs('/')
    return v.f_bavail * v.f_frsize


def real_directory(path):
    p = Path(path)
    assert p.is_absolute() and p.resolve(strict=True) == p, 'noncanonical directory'
    for parent in (p, *p.parents):
        assert not parent.is_symlink(), 'symlink ancestor'
    assert p.is_dir(), 'not directory'


def identity(path, expected):
    s = path.lstat()
    assert stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'not single-link regular pack'
    assert (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns) == (
        expected['device'], expected['inode'], expected['bytes'], expected['mtimeNs']
    ), 'manifest identity drift'
    return s


def protected_fingerprint(roots):
    # Hash canonical source files; metadata fingerprint of ALL .next content other
    # than the single optional Webpack cache. No env contents read or exported.
    h = hashlib.sha256()
    count = 0
    for root in roots:
        source = Path(root['sourceRoot'])
        for name, expected in sorted(root['canonicalFiles'].items()):
            path = source / name
            assert path.resolve(strict=True) == path and not path.is_symlink()
            assert digest(path) == expected['sha256'], 'canonical file drift'
            h.update((str(path) + ':' + expected['sha256'] + '\n').encode())
        for directory, dirs, files in os.walk(source / '.next', followlinks=False):
            dirs.sort()
            if Path(directory) == source / '.next/cache':
                dirs[:] = [d for d in dirs if d != 'webpack']
            # Directory mtimes of cache parent can legitimately change; never
            # unlink directories. Fingerprint preserved files and symlinks.
            for name in sorted(files + [d for d in dirs if (Path(directory) / d).is_symlink()]):
                path = Path(directory) / name
                s = path.lstat()
                h.update(json.dumps([str(path), s.st_dev, s.st_ino, s.st_size,
                                     s.st_mtime_ns, s.st_mode], separators=(',', ':')).encode())
                count += 1
    return {'sha256': h.hexdigest(), 'preservedRuntimeFiles': count}


def check_open_files(targets):
    identities = {(r['device'], r['inode']) for _, r in targets}
    found = 0
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            descriptors = list((process / 'fd').iterdir())
        except (FileNotFoundError, ProcessLookupError):
            continue
        for fd in descriptors:
            try:
                s = fd.stat()
            except (FileNotFoundError, ProcessLookupError):
                continue
            if (s.st_dev, s.st_ino) in identities:
                found += 1
    assert found == 0, 'cache packs currently open'
    return found


def write_once(path, value):
    with open(path, 'x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def run(manifest, apply=False):
    os.nice(15)
    roots = manifest['result']['cacheRoots']
    assert manifest['exitCode'] == 0 and len(roots) == len(SOURCES)
    assert {r['sourceRoot'] for r in roots} == set(SOURCES)
    targets = []
    allocated = 0
    for root in roots:
        assert root['cacheRoot'] == root['sourceRoot'] + '/.next/cache/webpack'
        assert root['startScriptClass'] == 'production_next_start'
        assert not root['otherFilesNotEligible']
        real_directory(root['cacheRoot'])
        real_directory(root['sourceRoot'])
        cache = Path(root['cacheRoot'])
        for entry in root['recognizedPacks']:
            assert PACK.fullmatch(entry['relativePath']) and entry['regularCachePack']
            path = cache / entry['relativePath']
            real_directory(path.parent)
            targets.append((path, entry))
    manifest_hash = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    # Outcome-unknown recovery is read-only, with exact requested identity.
    if (RECEIPT / 'intent.json').exists():
        intent = json.loads((RECEIPT / 'intent.json').read_text())
        assert intent['manifestSha256'] == manifest_hash, 'different operation exists'
        return {'mode': 'readback_only', 'intent': intent,
                'result': json.loads((RECEIPT / 'result.json').read_text()) if (RECEIPT / 'result.json').exists() else None,
                'remainingManifestPaths': [str(p) for p, _ in targets if p.exists()],
                'availableBytesNow': available()}
    for path, entry in targets:
        allocated += identity(path, entry).st_blocks * 512
    assert sum(e['bytes'] for _, e in targets) == manifest['result']['totalRecognizedLogicalBytes']
    before = protected_fingerprint(roots)
    opened = check_open_files(targets)
    receipt = {'at': now(), 'manifestSha256': manifest_hash, 'mode': 'apply' if apply else 'dry_run',
               'packs': len(targets), 'logicalBytes': sum(e['bytes'] for _, e in targets),
               'allocatedBytes': allocated, 'openPackDescriptors': opened,
               'availableBytesBefore': available(), 'protectedBefore': before,
               'sourceRoots': list(SOURCES), 'serviceChanges': False,
               'deletesOnlyOptionalWebpackPacks': True}
    if not apply:
        return receipt
    assert available() + allocated >= 10 * 1024 ** 3, 'insufficient projected capacity'
    RECEIPT.mkdir(mode=0o700, parents=True, exist_ok=True)
    assert RECEIPT.resolve(strict=True) == RECEIPT and not RECEIPT.is_symlink()
    os.chmod(RECEIPT, 0o700)
    with open(RECEIPT / 'lock', 'a') as lock:
        os.chmod(RECEIPT / 'lock', 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert not (RECEIPT / 'intent.json').exists(), 'operation already started'
        assert protected_fingerprint(roots) == before
        check_open_files(targets)
        for path, entry in targets:
            identity(path, entry)
        write_once(RECEIPT / 'intent.json', receipt)
        removed = []
        try:
            for path, entry in targets:
                # Pin parent and revalidate final file immediately before unlink;
                # never follow a symlink or recurse through deletion targets.
                real_directory(path.parent)
                parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    identity(path, entry)
                    fresh = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
                    assert (fresh.st_dev, fresh.st_ino) == (entry['device'], entry['inode'])
                    os.unlink(path.name, dir_fd=parent)
                    os.fsync(parent)
                    removed.append(str(path))
                finally:
                    os.close(parent)
            after = protected_fingerprint(roots)
            assert after == before, 'protected runtime fingerprint changed'
            assert not any(p.exists() for p, _ in targets), 'pack readback failed'
            result = {'at': now(), 'status': 'completed', 'removedPaths': removed,
                      'protectedAfter': after, 'protectedUnchanged': True,
                      'availableBytesAfter': available(), 'tenGiBGuard': available() >= 10 * 1024 ** 3,
                      'serviceChanges': False}
        except Exception as error:
            result = {'at': now(), 'status': 'interrupted_no_automatic_retry',
                      'errorClass': type(error).__name__, 'removedPaths': removed,
                      'availableBytesAfter': available(), 'serviceChanges': False}
            write_once(RECEIPT / 'result.json', result)
            raise
        write_once(RECEIPT / 'result.json', result)
        return {'intent': receipt, 'result': result}
