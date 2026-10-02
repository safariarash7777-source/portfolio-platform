// Read-only installer inventory. Does not connect to or mutate any database.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { createHash } from 'node:crypto';
const [checkout, ledgerFile, output] = process.argv.slice(2);
const expected = '31c44ab635b672b589b7833bcbc78b41d36f1e75';
if (!checkout || !ledgerFile || !output) throw Error('Supply pinned checkout, existing191 ledger and output');
const sha = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
if (sha !== expected) throw Error('Unexpected application SHA');
const ledger = fs.readFileSync(ledgerFile, 'utf8');
const rows = [...ledger.matchAll(/^\|([^|]+)\|APPLIED_NATIVE_SANDBOX_ONLY\|`([a-f0-9]{64})`\|/gm)];
if (rows.length !== 18) throw Error('Expected exactly18 canonical prerequisites');
const files = rows.map((m, i) => {
  const worktree = fs.readFileSync(path.join(checkout, m[1]));
  const worktreeHash = createHash('sha256').update(worktree).digest('hex');
  if (worktreeHash !== m[2]) throw Error('Schema input drift: ' + m[1]);
  const canonical = cp.execFileSync('git', ['show', expected + ':' + m[1]], { cwd: checkout });
  if (!Buffer.from(worktree.toString().replace(/\r\n/g, '\n')).equals(canonical)) throw Error('Schema content differs beyond CRLF: ' + m[1]);
  const gitBlob = cp.execFileSync('git', ['rev-parse', expected + ':' + m[1]], { cwd: checkout, encoding: 'utf8' }).trim();
  return { order: i + 1, file: m[1], sha256: createHash('sha256').update(canonical).digest('hex'),
    worktreeCRLFSha256: worktreeHash, gitBlob, inputEncoding: 'Git blob / LF', status: 'VERIFIED_INPUT_NOT_APPLIED' };
});
const result = { recordedAt: new Date().toISOString(), sha, files,
  scope: 'Only a fresh synthetic isolated backend; native Auth/Storage schemas must exist separately',
  source: 'Order from verified191 ledger; exact pinned Git blobs (LF); legacy Windows hashes retained and verified equivalent after CRLF normalization',
  migrationExecuted: 0, liveDatabaseAccess: false, status: 'PREPARED_AWAITING_ISOLATED_TARGET' };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, verifiedInputs: files.length, migrationExecuted: 0, sha }));
