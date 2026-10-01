import fs from 'node:fs';import cp from 'node:child_process';import {createHash} from 'node:crypto';
const out='../portfolio-followup06-integration/docs/ops/seasonal-program/followup-06-auth-storage-evidence/';
const r=JSON.parse(fs.readFileSync(out+'independent.json')),ui=JSON.parse(fs.readFileSync(out+'independent-ui-followup.json')),f=JSON.parse(fs.readFileSync(out+'fixtures.json'));
fs.writeFileSync(out+'independent-attempt-01.json',JSON.stringify(r,null,2)+'\n');
for(const u of ui){const row=r.scenarios.find(x=>x.id==='ledger-preserved-'+u.role);row.observed.immediatePreHydrationUIVisible=row.observed.UIVisible;row.observed.UIVisible=u.UIVisible;row.observed.UIFollowup={at:u.at,nativeLoginHTTP:u.nativeLoginHTTP,url:u.URL,waitCondition:'waitFor visible synthetic asset text (15s timeout)',UIVisible:u.UIVisible,targetReadWarning:u.hasError};row.status=JSON.stringify(row.observed.before)===JSON.stringify(row.observed.after)&&u.UIVisible?'PASS':'FAIL';row.measurementCorrection='Initial body.innerText immediately after reload preceded React data rendering. A fresh real UI login with explicit visible-element wait confirmed the personal asset and debt UI; original observation retained.';}
const env=JSON.parse(fs.readFileSync(out+'environment.json'));r.repositorySQLWitness=env.steps.map(x=>({file:x.file,reportedApplied:x.status,sourceSha256:createHash('sha256').update(fs.readFileSync(x.file)).digest('hex'),reportedSha256:x.sha256,sourceHashMatches:createHash('sha256').update(fs.readFileSync(x.file)).digest('hex')===x.sha256}));
r.finalCatalog={at:new Date().toISOString(),observation:cp.execFileSync('docker',['exec','-i','followup06-accept-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:"select schemaname,tablename,policyname,cmd from pg_policies where schemaname='storage' order by policyname;select count(*) from public.entitlements where user_id='90fbdf83-2522-4362-90c3-fde6755e6653' and revoked_at is null and starts_at <= now() and expires_at > now();",encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()};
r.counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(k=>[k,r.scenarios.filter(x=>x.status===k).length]));r.completedAt=new Date().toISOString();r.conclusion='Independent technical review reproduced two NEXT-04 defects. Independent agent review does not satisfy human research sign-off. No code/schema fix, merge or other environment mutation.';
fs.writeFileSync(out+'independent.json',JSON.stringify(r,null,2)+'\n');
const descriptions={
'current-membership-and-foreign-isolation':'Revoked A, expired, cancelled, nonmember and B→A: list200/zero rows; download403; authenticated REST200/zero; RPC200/allowed=false; native Storage400. Active B→B: list200/one, download200, REST200/one, RPCallowed=true, native200 with exact36-byte digest.',
'guest-http-contract':'FAIL: unauthenticated list503 and download503, both generic service-unavailable errors. Expected401. Native confidentiality still holds. Owner NEXT-04.',
'native-guest-private-bucket':'Native guest authenticated/private path400 and public/private path400; no file bytes permitted.',
'admin-resource-contract':'FAIL: admin without entitlement lists each C1/C2 resource200/one row; each download503 and native Storage400. Expected list/download authorization consistency, without permission failure reported as outage. Owner NEXT-04.',
'non-admin-command-denied':'Member B attempted real access-grant API;403.',
'temporary-audited-grant':'Admin real-session grant command200 with new audit grant UUID; reason and idempotency UUID supplied. Only synthetic A/C1; removed afterward.',
'positive-real-storage-and-signing':'A list200/one; signing200; native200 and signed anonymous bearer200, both36 bytes and digest773ee1169339e5c25cda05f6c75296a6daeaf02c81a435a60083984598cc8128. API TTL60 seconds; URL retained only in memory.',
'publication-existing-C1-audience':'Existing publication f223fd74…: newly entitled A200; B/expired/cancelled/nonmember/guest404. No PRIVATE marker in any response. A direct research REST200/zero.',
'explicit-revoke-and-capability-window':'Admin revoke200; next A download403, listzero, native400, moduleallowed=false, publication404. Previously signed bearer still200 within TTL; expected bounded capability semantics, not immediate token revocation.',
'personal-ledger-foreign-denial':'B authenticated REST for A personal holding versions200/zero.',
'provider-signed-url-expiry':'Actual provider fetch of the same previously valid bearer URL returned400 at65 seconds. URL/token not saved.'};
const rows=r.scenarios.map(x=>{let detail=descriptions[x.id];if(x.id.startsWith('login-'))detail='Fresh browser context and actual UI login: native token200, native auth/user200 matched account UUID; /dashboard/holdings return. No session injection.';if(x.id.startsWith('ledger-preserved-'))detail='Authenticated holding versions, asset positions and debt positions all200; before/after row counts and SHA-256 digests identical. Fresh UI login followed by explicit asset-visible wait confirmed asset/debt display. Initial premature text check is retained as a harness observation.';return `| ${x.id} | ${x.roles.join(', ')} | ${x.at} | ${x.status} | ${x.expected.replaceAll('|','/')} | ${detail} |`}).join('\n');
const ledgerRows=Object.entries(r.ledgerBaseline).flatMap(([role,tables])=>tables.map(x=>`| ${role} | ${x.table} | ${x.rows} | ${x.digest} | unchanged |`)).join('\n');
const text=`# FOLLOWUP06 independent Auth/Storage review

Reviewer: independent Codex reviewer agent \`/root/dev07_independent\`, separate from the code author and builder preliminary test. This agent review is not human research sign-off and does not change DEV07's human gate.

Application SHA \`${r.sha}\`, environment \`${r.environment}\`, [local production application](http://127.0.0.1:3299). Build timestamp ${r.manifest.builtAt}. Six fresh browser contexts signed in through the product UI against actual GoTrue v2.197.0. Actual PostgREST14.17, Supabase Postgres17.6 and Storage1.11.2 were exercised. Tests ran ${r.startedAt} to ${r.finishedAt}, with explicit UI-render follow-up through ${ui.at(-1).at}; report completed ${r.completedAt}. All times are UTC.

**Result: ${r.counts.PASS} PASS, ${r.counts.FAIL} FAIL, ${r.counts.BLOCKED} BLOCKED across20 independently recorded checks.** The two failures independently reproduce the preliminary NEXT-04 findings. This report supplies fresh observations rather than accepting the preliminary PASS labels.

Only followup06-accept-db/auth/rest/storage and this entirely synthetic sandbox were used. No app/schema changes, sql/test policies, session injection, merge, Production, Liara, PR173 or DEV07 human sandbox action was performed. Six actual account roles: A(revoked initially), B(active C2), expired, cancelled(C3 cancelled), nonmember and admin(no course entitlement). Guest used a seventh empty context. Passwords came privately from the protected reviewer-only credential file. Issued sessions and signed URL stayed in memory; no token/cookie/HAR/trace/credential screenshot was saved.

## Independent observations

| Check | Roles | UTC time | Result | Expected | Actual UI/HTTP/provider evidence |
|---|---|---|---|---|---|
${rows}

## Reproducible failures and ownership

NEXT-04 F01: In a fresh unauthenticated context, GET /api/cohorts/${f.cohorts.A}/resources and GET /api/cohorts/${f.cohorts.A}/resources/${f.resources.A.id}. Both returned503 with generic course-read failure text; expected401. Native private and public object endpoints returned400 without allowing private bytes, so confidentiality passed while the HTTP contract failed.

NEXT-04 F02: Sign in as the actual admin account without any course grant. Resource list for C1 and C2 returns200 and one resource each. Request the listed resource download endpoint:503 for each. Native Storage authenticated object read:400 for each. Course administrator visibility and download authorization are inconsistent; permission failure is represented as service outage. No role/grant/policy workaround was installed. Findings were sent to root for NEXT-04 ownership, without application fixes by this reviewer.

## Personal ledger preservation

Existing asset and debt history was observed, not re-seeded. A's shared ledger contains3 holding versions/3 asset rows/1 debt row; expired and cancelled each contain2/2/1. Membership grant/revoke, download, publication audience and expiry tests left every row count and digest unchanged. B's direct foreign ledger query remained zero rows. Each affected member UI displayed the synthetic asset2000 Toman, debt100 Toman and net1900 Toman after waiting for actual data rendering.

| Role | Table | Rows | SHA-256 before and after | Result |
|---|---|---|---|---|
${ledgerRows}

The first immediate body-text reads after page.reload occurred before React data rendering. The original false visibility observations remain in independent-attempt-01.json; independent-ui-followup.json records fresh actual UI login and explicit visible-element waits. Final ledger PASS uses unchanged hashes plus those actual rendered observations. A target-portfolio read warning(PORTFOLIO_TARGET) was also visible while personal assets/debts remained usable; this review did not assign a code defect or modify prerequisites for that separate target feature.

## Provider expiry and cleanup

Positive A bytes were36 and matched fixture SHA-256 above for both native Storage and anonymous signed bearer. Signing advertised60 seconds. Following actual admin revoke, new resource and publication requests were denied immediately while the prior signed bearer remained valid within its bounded TTL. The same URL was denied by the actual provider at65 seconds(HTTP400). No URL token is in the report/evidence. Temporary grant ${r.scenarios.find(x=>x.id==='temporary-audited-grant').observed.grantRef} was revoked through the real admin API(200); final catalog confirms no currently active A grant. Browser contexts were closed.

## Environment witness and limits

App HEAD and frozen manifest matched2605a0f. environment.json records16 actual repository SQL files, fresh native service migrations and no restored data/test scaffold. The reviewer independently recomputed all16 source hashes; the exact match results and actual Storage catalog SELECT policies are in independent.json. Behavioral permission tests above are the access evidence; source hashes alone are not treated as authorization proof.

The retained publication UUID is \`${r.publicationVersionId}\`; its receipt was read from preliminary metadata but its current audience responses were independently requested through fresh real Auth sessions. The preliminary creator's automated research approval is technical, not a human approval. This review created no research approval or publication.

Evidence: [independent.json](./independent.json), [original measurement attempt](./independent-attempt-01.json), [UI follow-up](./independent-ui-followup.json), [environment](./environment.json), and [own review harness](./independent.mjs). CI was not rerun by this reviewer; this report makes no new CI/merge claim. Acceptance remains failed for the two NEXT-04 contracts.
`;
fs.writeFileSync(out+'independent.md',text);console.log(JSON.stringify({counts:r.counts,sourceHashes:r.repositorySQLWitness.every(x=>x.sourceHashMatches),catalog:r.finalCatalog,report:out+'independent.md'}));
