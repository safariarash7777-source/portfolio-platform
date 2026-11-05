import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { V1, V2, V2_INPUTS, selectAssemblyScope, verifyV2Inputs, verifyV2Deployment } from './assembly-source-scope.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const object = (ref, path) => JSON.parse(execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }));
const rootConfig = object(V2_INPUTS.root.commit, 'vercel.json');
const memberConfig = object(V2_INPUTS.member.commit, 'vercel.json');
const actual = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'));
const pins = Object.values(V2_INPUTS);
const validInputs = () => ({ treeOf: commit => pins.find(pin => pin.commit === commit)?.tree, isAncestor: () => true });

test('source ancestry selects v2 for current and future descendants without branch or env activation', () => {
  assert.equal(selectAssemblyScope('', true), V2);
  assert.equal(selectAssemblyScope(V2, true), V2);
  assert.equal(selectAssemblyScope('', false), '');
  assert.equal(selectAssemblyScope(V1, false), V1);
});
for (const requested of ['main', 'codex/arbitrary', 'rootff5c-member4dc-v2-extra', 'true']) test(`unknown source scope is rejected: ${requested}`, () => {
  assert.throws(() => selectAssemblyScope(requested, true), /unknown source test scope/);
});
test('an environment value cannot activate v2 on unbound source, and v2 cannot downgrade', () => {
  assert.throws(() => selectAssemblyScope(V2, false), /requires reviewed integration ancestry/);
  assert.throws(() => selectAssemblyScope(V1, true), /cannot downgrade/);
});
test('every v2 input requires its exact tree and ancestry independently', () => {
  verifyV2Inputs(validInputs());
  for (const pin of pins) {
    const badTree = validInputs(); badTree.treeOf = commit => commit === pin.commit ? '0'.repeat(40) : pins.find(item => item.commit === commit)?.tree;
    assert.throws(() => verifyV2Inputs(badTree), /input tree changed/);
    const unrelated = validInputs(); unrelated.isAncestor = commit => commit !== pin.commit;
    assert.throws(() => verifyV2Inputs(unrelated), /not an ancestor/);
  }
});
test('the actual merged deployment settings retain the exact reviewed 21-stop union', () => {
  verifyV2Deployment(actual, rootConfig, memberConfig);
});
for (const [name, mutate] of [
  ['missing stop', config => { delete config.git.deploymentEnabled[Object.keys(config.git.deploymentEnabled)[0]]; }],
  ['extra stop', config => { config.git.deploymentEnabled['codex/unreviewed'] = false; }],
  ['opened stop', config => { config.git.deploymentEnabled[Object.keys(config.git.deploymentEnabled)[0]] = true; }],
  ['unknown stop value', config => { config.git.deploymentEnabled[Object.keys(config.git.deploymentEnabled)[0]] = null; }],
  ['cron change', config => { config.crons[0].schedule = '* * * * *'; }],
  ['extra git setting', config => { config.git.extra = true; }],
]) test(`v2 rejects ${name}`, () => {
  const changed = structuredClone(actual); mutate(changed);
  assert.throws(() => verifyV2Deployment(changed, rootConfig, memberConfig));
});
test('a true input stop cannot be hidden by a false stop in the other input', () => {
  const changed = structuredClone(rootConfig);
  changed.git.deploymentEnabled[Object.keys(memberConfig.git.deploymentEnabled)[0]] = true;
  assert.throws(() => verifyV2Deployment(actual, changed, memberConfig), /input opened/);
});
test('the CI scope is literal v2, independent of branch, and ancestry is not truncated', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /P03_SOURCE_SCOPE: rootff5c-member4dc-v2/);
  assert.doesNotMatch(workflow, /P03_SOURCE_SCOPE:.*(?:github\.head_ref|root928-member6ccb-v1)/);
  const quality = workflow.slice(workflow.indexOf('\n  quality:'), workflow.indexOf('\n  relay:'));
  assert.match(quality, /fetch-depth: 0/);
  assert.match(quality, /fetch-tags: false/);
});
