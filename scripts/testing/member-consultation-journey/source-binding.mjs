// Offline source gate for the explicitly allocated 341 + 357 integration.
// No HTTP, application launch, database, credentials, or package installation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const LEFT = 'c0eadaba4be1a070d3f93b2c9706e2c13e9a20f3';
const RIGHT = '7752638842c3f4c8a6984e3ec753a6c92aad80fc';
const BASE = '3acbab90d101620591f44ee9967adbac123d4a28';
const MERGE = '109b5078ab9965257d29df363fc1eb25ba6edfa0';
const resolutions = {
  'docs/README.md': '1c0e87d3a1246b23235e763cf4d7a9aa15d5e0e86638193845fa1ce2e5712538',
  'package.json': '67aa6d16afc7b04b161c28be8d4020fc7967ee240bfb0c60510602698b146faa',
};
const reserved = [
  'scripts/testing/member-consultation-journey/',
  'docs/ops/member-consultation-journey-20261031/',
];

function git(args, { env, accepted = [0] } = {}) {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.ok(accepted.includes(result.status), `git ${args[0]} failed; source gate stopped`);
  return result.stdout.trimEnd();
}
function blob(ref, path) {
  const result = spawnSync('git', ['show', `${ref}:${path}`], {
    cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, 'Required source blob unavailable');
  return result.stdout;
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const literalTests = command => [...new Set(command.match(/[A-Za-z0-9_./()\[\]-]+\.test\.(?:[cm]?[jt]sx?|py)/g) ?? [])];

export function verifySourceBinding(candidate = 'HEAD') {
  const candidateSha = git(['rev-parse', '--verify', `${candidate}^{commit}`]);
  assert.equal(git(['show', '-s', '--format=%P', MERGE]), `${LEFT} ${RIGHT}`, 'Merge parents changed');
  assert.equal(git(['merge-base', LEFT, RIGHT]), BASE, 'Source merge base changed');
  git(['merge-base', '--is-ancestor', MERGE, candidateSha]);

  const left = JSON.parse(blob(LEFT, 'package.json'));
  const right = JSON.parse(blob(RIGHT, 'package.json'));
  const current = JSON.parse(blob(candidateSha, 'package.json'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'overrides']) {
    assert.deepEqual(current[field], left[field], `Dependency field changed: ${field}`);
  }
  assert.equal(git(['rev-parse', `${candidateSha}:package-lock.json`]), git(['rev-parse', `${LEFT}:package-lock.json`]), 'Lock changed');
  const registry = literalTests(current.scripts['test:core']);
  const required = [...new Set([...literalTests(left.scripts['test:core']), ...literalTests(right.scripts['test:core'])])];
  for (const path of required) {
    assert.ok(registry.includes(path), `Literal test missing from merged registry: ${path}`);
    git(['cat-file', '-e', `${candidateSha}:${path}`]);
  }
  for (const [path, hash] of Object.entries(resolutions)) {
    assert.equal(sha256(blob(candidateSha, path)), hash, `Root-approved resolution changed: ${path}`);
    assert.equal(sha256(blob(MERGE, path)), hash, `Merge resolution changed: ${path}`);
  }

  // Reconstruct Git's merge using a private index, replacing only the two
  // root-reviewed conflicts. This detects unrelated product edits in the merge.
  const auto = git(['merge-tree', '--write-tree', LEFT, RIGHT], { accepted: [1] });
  const [autoTree] = auto.split('\n');
  assert.match(autoTree, /^[a-f0-9]{40}$/);
  const conflicted = [...new Set([...auto.matchAll(/^\d{6} [a-f0-9]{40} [123]\t(.+)$/gm)].map(match => match[1]))].sort();
  assert.deepEqual(conflicted, Object.keys(resolutions).sort(), 'Unexpected merge conflict set');
  const parent = resolve(tmpdir());
  const temporary = mkdtempSync(join(parent, 'member-source-binding-'));
  assert.equal(dirname(temporary), parent);
  assert.ok(temporary.startsWith(parent + sep));
  try {
    const env = { GIT_INDEX_FILE: join(temporary, 'index') };
    git(['read-tree', autoTree], { env });
    for (const path of Object.keys(resolutions)) {
      const object = git(['rev-parse', `${MERGE}:${path}`]);
      git(['update-index', '--add', '--cacheinfo', `100644,${object},${path}`], { env });
    }
    assert.equal(git(['write-tree'], { env }), git(['rev-parse', `${MERGE}^{tree}`]), 'Merge tree contains an unreviewed resolution');
  } finally {
    // The exact mkdtemp child was verified within the OS temporary directory.
    rmSync(temporary, { recursive: true, force: true });
  }

  const followup = git(['diff', '--name-only', MERGE, candidateSha]).split('\n').filter(Boolean);
  assert.ok(followup.every(path => reserved.some(prefix => path.startsWith(prefix))), 'Follow-up changes an unallocated file');
  return {
    status: 'PASS_SOURCE_BINDING', candidateSha, mergeSha: MERGE,
    sourceParents: [LEFT, RIGHT], sourceMergeBase: BASE,
    exactRootResolutions: resolutions, allSourceLiteralTestsRetained: true,
    registeredLiteralTests: registry.length, requiredLiteralTests: required.length,
    dependenciesAndLockUnchanged: true, reconstructedMergeTreeMatches: true,
    followupFiles: followup,
    productExecution: 'NOT_RUN', targetInstallation: 'NOT_APPLIED',
    serviceRequest: 'NOT_CONNECTED', sameServiceRight: 'NOT_PROVEN',
    arashAcceptance: 'UNOBSERVED',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length <= 3, 'Usage: node source-binding.mjs [candidate]');
    console.log(JSON.stringify(verifySourceBinding(process.argv[2] ?? 'HEAD'), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL_SOURCE_BINDING', reason: error.message }));
    process.exitCode = 1;
  }
}
