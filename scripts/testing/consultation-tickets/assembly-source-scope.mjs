// Offline source versioning only. This grants no application or runtime rights.
import assert from 'node:assert/strict';

export const V1 = 'root928-member6ccb-v1';
export const V2 = 'rootff5c-member4dc-v2';
export const ASSEMBLY_BRANCH = 'codex/p01-p03-member-assembly-20261031';
export const V2_INPUTS = Object.freeze({
  root: Object.freeze({ commit: 'ff5c49ffca82f3338331596e262f8778e5e50960', tree: '93b0bc5d63e39df7a465a3c7e9b839522e0ff309' }),
  member: Object.freeze({ commit: '4dcf3713c3ad2507ed1a5bfee42a52b3c17cfb8a', tree: 'c96d462d72505f2471c54c8e7e5293fe2b39b3d1' }),
  integration: Object.freeze({ commit: '72254d5737daa81262b286092686f44a3e4982bf', tree: '05b6de6c806812e9bb15a880ab9b025063cec47c' }),
});

// Branch names do not select a scope. Only the reviewed source ancestry can
// select v2, including future main/PR descendants. An env value alone cannot.
export function selectAssemblyScope(requested, hasReviewedIntegration) {
  assert.ok(['', V1, V2].includes(requested), 'unknown source test scope');
  if (hasReviewedIntegration) {
    assert.notEqual(requested, V1, 'v2 source cannot downgrade to v1');
    return V2;
  }
  assert.notEqual(requested, V2, 'v2 requires reviewed integration ancestry');
  return requested;
}

export function verifyV2Inputs({ treeOf, isAncestor }) {
  for (const { commit, tree } of Object.values(V2_INPUTS)) {
    assert.equal(treeOf(commit), tree, 'reviewed v2 input tree changed');
    assert.equal(isAncestor(commit), true, 'reviewed v2 input is not an ancestor');
  }
}

export function verifyV2Deployment(actual, rootConfig, memberConfig) {
  const rootStops = rootConfig.git.deploymentEnabled;
  const memberStops = memberConfig.git.deploymentEnabled;
  assert.ok([...Object.values(rootStops), ...Object.values(memberStops)].every(value => value === false), 'reviewed input opened a deployment stop');
  const stops = { ...rootStops, ...memberStops, [ASSEMBLY_BRANCH]: false };
  assert.equal(Object.keys(stops).length, 21, 'v2 reviewed stop union changed');
  const rootSettings = structuredClone(rootConfig), memberSettings = structuredClone(memberConfig);
  delete rootSettings.git.deploymentEnabled;
  delete memberSettings.git.deploymentEnabled;
  assert.deepEqual(rootSettings, memberSettings, 'reviewed non-stop settings differ');
  const expected = structuredClone(rootConfig);
  expected.git.deploymentEnabled = stops;
  assert.deepEqual(actual, expected, 'actual v2 lost, added or opened a stop, or changed settings');
}
