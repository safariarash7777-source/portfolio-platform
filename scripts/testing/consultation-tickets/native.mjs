// Actual Next -> SSR/Auth -> PostgREST -> owned tmpfs PostgreSQL acceptance.
// Existing Linux GitHub runner only; no remote target, fake HTTP response or UI.
import { randomUUID, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { durabilityNative } from './durability-native.mjs';
import { runNativeAuthProfile } from './native-auth-runtime.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const check = (value, code) => { if (!value) throw Error(code); };
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = value => createHash('sha256').update(value).digest('hex');
const load = async file => { const imported = await import(pathToFileURL(resolve(root, file))); return imported.default ?? imported; };
const PERIOD = { startOn: '2026-10-01', endOn: '2026-10-31' }, DATE = '2026-10-29';
const TICKETS = '/api/consultation/tickets';

async function exercise(ctx) {
  const contracts = await load('lib/consultation/contracts.ts');
  const tickets = await load('lib/consultation/tickets.ts');
  const client = await load('lib/consultation/ticketStorageRequest.ts');
  const storage = await load('lib/consultation/ticketStorageContracts.ts');
  const cash = await load('lib/portfolio/cashFlowApiContract.ts');
  const { users, sql, api, pass } = ctx;
  const expect = async (actor, path, body, status = body === undefined ? 200 : 201) => {
    const result = await api(actor, path, body);
    check(result.status === status, 'p03_ticket_http_status_' + status);
    return result.value;
  };
  const consultation = async (actor, relation) => contracts.validateConsultationRead(await expect(actor, '/api/consultation?' + new URLSearchParams({ ...PERIOD, ...(relation ? { relationshipId: relation } : {}) })), { actorId: users[actor].id, ...(relation ? { relationshipId: relation } : {}) });
  const command = async (actor, command) => {
    const request = contracts.validateConsultationRequest({ contractVersion: 'consultation-request.v1', expectedActorId: users[actor].id, clientToken: randomUUID(), command });
    return contracts.validateConsultationReceipt(await expect(actor, '/api/consultation', request), request);
  };
  const selectionPath = selection => TICKETS + '?' + new URLSearchParams(selection);
  const read = async (actor, selection, input) => storage.validateTicketStorageEnvelope(await expect(actor, selectionPath(selection)), await consultation(actor, selection.relationshipId), selection, input);
  const ticketPost = async (actor, input, expectedStatus = 201) => {
    const response = await api(actor, TICKETS, input);
    check(response.status === expectedStatus, 'p03_ticket_command_http_status');
    return expectedStatus === 201 || expectedStatus === 200 ? tickets.validateTicketReceipt(response.value, input) : response.value;
  };
  const fingerprint = () => {
    const tables = ['member_holding_versions', 'member_holding_positions', 'member_debt_positions', 'member_cash_flow_versions', 'member_cash_flow_entries', 'member_goals_versions'];
    return sql('BEGIN READ ONLY;SELECT jsonb_build_object(' + tables.map(name => quote(name) + ",(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'UTF8')),'hex')) FROM public." + name + ' r)').join(',') + ');COMMIT;');
  };
  const position = { position_key: 'p03-synthetic-cash', manual_label: 'Synthetic declared cash', symbol: null, asset_class: 'cash', qty: null, unit: 'item', as_of: DATE, title: 'Synthetic member declaration', ownership_pct: 100, valuation_mode: 'declared', declared_value: 1000000, currency: 'IRT', valuation_source: 'Synthetic member declaration only', valuation_as_of: DATE, valuation_status: 'estimated' };
  const holdingReceipt = await expect('a', '/api/portfolio/holdings', { base_version: 0, client_token: randomUUID(), positions: [position], note: 'P03 owned fixture only' });
  check(holdingReceipt.version === 1 && holdingReceipt.position_count === 1, 'p03_nonzero_holding_receipt');
  const source = { label: 'Synthetic financial statement', observedOn: DATE };
  const payload = { contractVersion: 1, period: PERIOD, accountDefinitions: [{ accountKey: 'synthetic-bank', label: 'Synthetic bank account' }], scopeAccountKeys: ['synthetic-bank'],
    opening: { amountToman: 500000, atStartOn: PERIOD.startOn, source }, coverage: { planned: { status: 'unknown', memberAffirmed: false, source: null }, actual: { status: 'complete', memberAffirmed: true, source } },
    entries: [{ entryKey: 'income', basis: 'actual', kind: 'income', accountKey: 'synthetic-bank', amountToman: 100000, occurredOn: '2026-10-02', source, category: null, note: null }, { entryKey: 'expense', basis: 'actual', kind: 'expense', accountKey: 'synthetic-bank', amountToman: 20000, occurredOn: '2026-10-03', source, category: null, note: null }] };
  const cashInput = cash.validateCashFlowWriteRequest({ contractVersion: 'cash-flow-request.v1', expectedOwnerId: users.a.id, clientToken: randomUUID(), baseVersion: 0, payload });
  const cashReceipt = cash.validateCashFlowReceipt(await expect('a', '/api/personal-finance/cash-flow', cashInput), cashInput);
  const holdingRead = await expect('a', '/api/portfolio/holdings');
  const cashRead = cash.validateCashFlowRead(await expect('a', '/api/personal-finance/cash-flow?' + new URLSearchParams(PERIOD)), { ownerId: users.a.id, period: PERIOD });
  check(holdingRead.positions[0].declared_value === 1000000 && cashRead.report.actual.closingToman === 580000 && cashRead.report.planned.netToman === null, 'p03_nonzero_source_readback');
  sql(`INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(${quote(users.owner.id)},'Synthetic owner advisor',true,true);`);
  const grant = await command('a', { kind: 'grant', advisorId: users.owner.id, clientLabel: 'Synthetic nonzero P03 member' });
  const relation = grant.id, parent = await consultation('a', relation);
  check(parent.dossier.basis.holdingsVersionId === holdingReceipt.version_id && parent.dossier.basis.cashFlowVersionId === cashReceipt.versionId && parent.dossier.basis.goalsVersionId === null, 'p03_exact_financial_basis');
  const beforeFinancial = fingerprint();
  ctx.write('financial-before.json', { holdings: holdingRead, cashflow: cashRead, fingerprint: beforeFinancial }, true);
  pass('nonzero-dossier-and-real-consent', { holdingVersion: holdingReceipt.version_id, cashVersion: cashReceipt.versionId, declaredToman: 1000000, closingToman: 580000, missingPlannedPreserved: true });

  const requestId = randomUUID();
  const opening = tickets.validateTicketRequest({ contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.a.id, clientToken: randomUUID(), command: { kind: 'open', relationshipId: relation, requestId, baseVersion: 0, subject: 'Synthetic native request', text: 'SYNTHETIC_PRIVATE_P03_OPEN_BODY', recommendation: null } });
  check((await ticketPost('a',opening,503)).code==='WRITES_NOT_RELEASED','p03_release_default_ticket_not_closed');
  const releasePreparation=await ctx.postExact('/api/consultation/ticket-attempts',JSON.stringify(opening),{Cookie:users.a.session.cookie,Origin:ctx.origin});
  check(releasePreparation.status===503&&(await releasePreparation.json()).code==='WRITES_NOT_RELEASED','p03_release_default_prepare_not_closed');
  check(sql('SELECT count(*) FROM consultation_ticket_private.requests')==='0'&&sql('SELECT count(*) FROM consultation_ticket_private.prepared_intents')==='0','p03_release_created_rows');
  pass('server-release-default-closed-legacy-financial-and-consent-preserved',{newRequests:0,newPreparations:0,legacyFinancialWritesRetained:true,legacyConsentRetained:true});
  await ctx.setWriteRelease(true); // Explicit owned server environment; no fixture/right grant.
  const initialLookup = await read('a', client.ticketLookupSelection(opening), opening);
  check(initialLookup.capability.state === 'not_connected', 'p03_product_provider_default_closed');
  check(client.prepareTicketStorageAttempt(opening, parent, initialLookup).status === 'blocked', 'p03_product_client_not_promoted');
  const blocked = await ticketPost('a', opening, 503);
  check(blocked.code === 'SERVICE_RIGHT_NOT_CONNECTED', 'p03_db_default_not_connected');
  const ownerBlocked = { ...opening, expectedActorId: users.owner.id, clientToken: randomUUID(), command: { kind: 'advisor_clarification', relationshipId: relation, requestId, baseVersion: 1, text: 'Synthetic owner does not grant a right' } };
  check((await ticketPost('owner', ownerBlocked, 503)).code === 'SERVICE_RIGHT_NOT_CONNECTED', 'p03_admin_profile_not_service_right');
  const closedPreparation = await ctx.postExact('/api/consultation/ticket-attempts', JSON.stringify(opening), { Cookie: users.a.session.cookie, Origin: ctx.origin });
  check(closedPreparation.status === 503 && (await closedPreparation.json()).code === 'SERVICE_RIGHT_NOT_CONNECTED', 'p03_product_preparation_right_not_closed');
  check(sql('SELECT count(*) FROM consultation_ticket_private.requests') === '0', 'p03_blocked_writes_created_rows');
  pass('product-default-closed-in-db-and-api', { memberDenied: true, ownerAdminDenied: true, requestsCreated: 0, realServiceRight: 'NOT_CONNECTED' });

  ctx.apply('scripts/testing/consultation-tickets/owned-fixture.sql');
  // Explicit ops grant to two ACTUAL newly issued identities and the real consent.
  // Neither profiles.role nor JWT metadata constitutes this grant.
  sql(`INSERT INTO consultation_ticket_fixture.allowed(relationship_id,actor_id) VALUES(${quote(relation)},${quote(users.a.id)}),(${quote(relation)},${quote(users.owner.id)});`);
  const permitted = await read('a', client.ticketLookupSelection(opening), opening);
  check(permitted.capability.state === 'owned_fixture' && permitted.capability.runId === ctx.id, 'p03_owned_fixture_binding');
  const prepared = client.prepareTicketStorageAttempt(opening, await consultation('a', relation), permitted);
  check(prepared.status === 'prepared' && prepared.attempt.intent.writeEnabled === false, 'p03_fixture_not_business_right');
  pass('explicit-isolated-db-grant-bound-to-run-and-actors', { runId: ctx.id, actualActors: [users.a.id, users.owner.id], sourceRight: 'NOT_CONNECTED', fixtureImportedInProduct: false });

  let ticketPosts = 0, lostBody = false;
  const actualTransport = actor => async (input, init = {}) => {
    const url = new URL(String(input), ctx.origin), headers = { ...Object.fromEntries(new Headers(init.headers)), Cookie: users[actor].session.cookie, Origin: ctx.origin };
    const result = (init.method ?? 'GET') === 'POST' ? await ctx.post(url.pathname + url.search, JSON.parse(String(init.body)), headers) : await ctx.transport(url.href, { ...init, headers });
    if ((init.method ?? 'GET') === 'POST' && url.pathname === TICKETS) {
      ticketPosts++;
      if (!lostBody) { check(result.status === 201, 'p03_actual_lost_response_not_201'); await result.arrayBuffer(); lostBody = true; throw Error('deliberately discarded real response after HTTP 201'); }
    }
    return result;
  };
  const transport = actualTransport('a');
  check((await client.sendTicketStorageAttempt(prepared.attempt, parent, { currentActorId: users.a.id, transport })).status === 'uncertain', 'p03_discarded_response_not_uncertain');
  check((await client.sendTicketStorageAttempt(prepared.attempt, parent, { currentActorId: users.a.id, unresolvedPrior: true, transport })).status === 'uncertain' && ticketPosts === 1, 'p03_unknown_replayed_post');
  const looked = await client.readTicketStorage(client.ticketLookupSelection(opening), await consultation('a', relation), { input: opening, transport });
  check(looked.status === 'ready', 'p03_actual_lookup_failed');
  const recovered = client.recoverTicketStorageAttempt(prepared.attempt, looked.data, await consultation('a', relation), null);
  check(recovered.status === 'confirmed' && recovered.receipt.version === 1 && ticketPosts === 1, 'p03_actual_effect_not_recovered');
  check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(requestId)}`) === '1', 'p03_unknown_duplicate_event');
  pass('real-lost-response-get-only-exact-recovery', { actualHeader: 201, discardedRealBody: true, ticketPostAttempts: ticketPosts, storedEvents: 1, recoveredEventId: recovered.receipt.id });

  const permissionBefore = sql("SELECT pg_get_functiondef('consultation_ticket_private.permission(uuid,uuid)'::regprocedure)");
  const permissionHash = sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='consultation_ticket_private.permission(uuid,uuid)'::regprocedure");
  ctx.write('fixture-permission-before.json', { definition: permissionBefore, bodyMd5: permissionHash }, true);
  sql("CREATE OR REPLACE FUNCTION consultation_ticket_private.permission(p_relationship uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'synthetic provider unavailable';END $$;");
  const unavailable = await read('a', { mode: 'read', relationshipId: relation, requestId });
  check(unavailable.capability.state === 'unavailable' && tickets.ticketReceiptVisible(unavailable.data, recovered.receipt), 'p03_right_failure_hid_authorized_history');
  check((await ticketPost('a', { ...opening, clientToken: randomUUID() }, 503)).code === 'SERVICE_RIGHT_NOT_CONNECTED', 'p03_provider_failure_write_not_closed');
  sql(permissionBefore);
  check(sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='consultation_ticket_private.permission(uuid,uuid)'::regprocedure") === permissionHash, 'p03_fixture_provider_not_restored_exactly');
  pass('real-provider-failure-preserves-authorized-history', { writeCapability: 'unavailable', independentEventRead: true, originalFixtureProviderRestored: true });

  const logout = await ctx.post('/auth/v1/logout', {}, { Authorization: 'Bearer ' + users.a.session.token, apikey: ctx.anon });
  check(logout.status === 204 || logout.status === 200, 'p03_real_logout_failed');
  users.a.session = await ctx.newSession('a');
  const fresh = await read('a', { mode: 'read', relationshipId: relation, requestId });
  check(fresh.mode === 'read' && tickets.ticketReceiptVisible(fresh.data, recovered.receipt), 'p03_fresh_auth_readback_mismatch');
  pass('real-signout-new-password-session-sdk-getuser-and-readback', { sameActor: users.a.id, exactEventId: recovered.receipt.id, version: 1, browser: 'NOT_RUN' });

  const replay = await ticketPost('a', opening, 200); // Known confirmed effect only.
  check(replay.reused && replay.id === recovered.receipt.id, 'p03_known_replay_changed_effect');
  await ticketPost('a', { ...opening, clientToken: randomUUID() }, 409);
  const forged = await ticketPost('b', opening, 403);
  check(forged.code === 'ACTOR_CHANGED', 'p03_expected_actor_not_authenticated_actor');
  check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(requestId)}`) === '1', 'p03_negative_mutated_ticket');
  pass('known-effect-idempotency-and-actor-cas-guards', { replayOnlyAfterConfirmedRead: true, canonicalReceiptSame: true, duplicateRequestDenied: true, actorFieldCannotGrant: true });

  const common = { relationshipId: relation, requestId, baseVersion: 1 };
  const memberRace = { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.a.id, clientToken: randomUUID(), command: { ...common, kind: 'member_followup', text: 'Synthetic concurrent member followup' } };
  const ownerRace = { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.owner.id, clientToken: randomUUID(), command: { ...common, kind: 'advisor_clarification', text: 'Synthetic concurrent advisor clarification' } };
  const race = await Promise.all([api('a', TICKETS, memberRace), api('owner', TICKETS, ownerRace)]);
  check(race.map(item => item.status).sort().join() === '201,409', 'p03_concurrent_cas_not_exactly_one_winner');
  const afterRace = await read('a', { mode: 'read', relationshipId: relation, requestId });
  check(afterRace.data.history.events.length === 2, 'p03_race_history_count');
  tickets.validateTicketContinuation(fresh.data, afterRace.data, await consultation('a', relation), requestId);
  pass('actual-two-auth-actors-concurrent-cas', { statuses: race.map(item => item.status), versions: [1, 2], prefixRetained: true });

  const advisorParent = await consultation('owner', relation), sessionKey = randomUUID();
  const body = { topic: 'Synthetic P03 case', goal: 'Software acceptance only', clientSummary: 'Synthetic versioned response', rationale: 'Synthetic reason', limitations: 'No real person, advice or source data', reviewOn: '2099-12-31', basis: advisorParent.dossier.basis, researchVersionIds: [], evidence: [{ label: 'Synthetic financial record', url: null, asOf: DATE }], actions: [] };
  const session = await command('owner', { kind: 'save', relationshipId: relation, sessionKey, baseVersion: 0, body, privateNote: 'SYNTHETIC_PRIVATE_ADVISOR_NOTE_NOT_FOR_MEMBER' });
  for (const kind of ['submit', 'approve', 'publish']) {
    const current = (await consultation('owner', relation)).sessions.find(item => item.id === session.id);
    await command('owner', { kind, relationshipId: relation, sessionId: session.id, contentHash: current.contentHash, note: null });
  }
  const published = (await consultation('a', relation)).sessions.find(item => item.id === session.id);
  check(published.state === 'published', 'p03_real_published_session_missing');
  const reference = { sessionId: published.id, version: published.version, contentHash: published.contentHash };
  const linked = { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.owner.id, clientToken: randomUUID(), command: { kind: 'link_recommendation', relationshipId: relation, requestId, baseVersion: 2, recommendation: reference } };
  await ticketPost('owner', { ...linked, command: { ...linked.command, recommendation: { ...reference, contentHash: 'b'.repeat(64) } } }, 409);
  const linkedReceipt = await ticketPost('owner', linked);
  check(linkedReceipt.version === 3, 'p03_exact_link_version');
  pass('real-versioned-submit-approve-publish-and-exact-ticket-link', { sessionId: published.id, sessionVersion: published.version, linkedTicketVersion: 3, wrongHashDenied: true, realPersonalRecommendation: false });

  const ownerReply = { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.owner.id, clientToken: randomUUID(), command: { kind: 'advisor_clarification', relationshipId: relation, requestId, baseVersion: 3, text: 'SYNTHETIC_SHARED_OWNER_RESPONSE_V4' } };
  const answered = await ticketPost('owner', ownerReply);
  const followed = await ticketPost('a', { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.a.id, clientToken: randomUUID(), command: { kind: 'member_followup', relationshipId: relation, requestId, baseVersion: 4, text: 'SYNTHETIC_MEMBER_FOLLOWUP_V5' } });
  const responseRead = await read('a', { mode: 'read', relationshipId: relation, requestId });
  check(answered.version === 4 && followed.version === 5 && responseRead.data.history.events[3].command.text === ownerReply.command.text, 'p03_shared_reply_and_followup_not_real');
  check(!stable(responseRead).includes('SYNTHETIC_PRIVATE_ADVISOR_NOTE_NOT_FOR_MEMBER'), 'p03_private_advisor_note_leak');
  pass('actual-shared-advisor-response-and-member-followup', { versions: [4, 5], sameTextIndependentRead: true, privateNoteAbsent: true });

  for (const actor of ['b', 'admin']) {
    const denied = await api(actor, selectionPath({ mode: 'read', relationshipId: relation, requestId }));
    check(denied.status === 403 && !stable(denied.value).includes(ownerReply.command.text), 'p03_other_actor_history_leak');
  }
  const direct = await ctx.post('/rest/v1/rpc/lookup_consultation_ticket', { p_relationship: relation, p_request: requestId, p_client_token: ownerReply.clientToken }, { Authorization: 'Bearer ' + users.b.session.token, apikey: ctx.anon });
  check(direct.status === 403, 'p03_direct_rpc_other_member_leak');
  check(sql("SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='consultation_ticket_private' AND grantee IN('anon','authenticated','service_role')") === '0', 'p03_private_table_grant');
  pass('other-member-unrelated-admin-and-direct-rpc-denial', { allDenied: true, applicationPrivateTableGrants: 0 });

  const closed = await ticketPost('owner', { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.owner.id, clientToken: randomUUID(), command: { kind: 'close', relationshipId: relation, requestId, baseVersion: 5, reason: 'Synthetic case complete' } });
  check(closed.version === 6, 'p03_close_version');
  await ticketPost('a', { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.a.id, clientToken: randomUUID(), command: { kind: 'member_followup', relationshipId: relation, requestId, baseVersion: 6, text: 'Must not append after close' } }, 409);
  pass('close-appends-terminal-event-without-overwrite', { finalVersion: 6, lateAppendDenied: true });

  sql(`UPDATE public.consultation_advisors SET enabled=false WHERE user_id=${quote(users.owner.id)};`);
  const disabled = await api('owner', selectionPath({ mode: 'lookup', relationshipId: relation, requestId, clientToken: ownerReply.clientToken }));
  check(disabled.status === 403 && !stable(disabled.value).includes(ownerReply.command.text), 'p03_disabled_advisor_receipt_leak');
  await read('a', { mode: 'read', relationshipId: relation, requestId });
  sql(`UPDATE public.consultation_advisors SET enabled=true WHERE user_id=${quote(users.owner.id)};`);
  const secondRelation = (await command('b', { kind: 'grant', advisorId: users.owner.id, clientLabel: 'Synthetic second relation' })).id;
  const wrongRelation = await api('owner', selectionPath({ mode: 'lookup', relationshipId: secondRelation, requestId, clientToken: ownerReply.clientToken }));
  check(wrongRelation.status === 409 && !stable(wrongRelation.value).includes(ownerReply.command.text), 'p03_changed_relation_private_receipt_leak');
  pass('disabled-advisor-and-changed-relation-no-private-receipt', { disabledStatus: 403, changedRelationStatus: 409, memberHistoryRetained: true });

  await command('a', { kind: 'revoke', relationshipId: relation });
  const revokedOwner = await api('owner', selectionPath({ mode: 'lookup', relationshipId: relation, requestId, clientToken: ownerReply.clientToken }));
  check(revokedOwner.status === 403, 'p03_revoked_advisor_private_read');
  const memberHistory = await read('a', { mode: 'read', relationshipId: relation, requestId });
  check(memberHistory.data.history.events.length === 6 && tickets.ticketStatus(memberHistory.data) === 'closed', 'p03_revoked_member_history_lost');
  await ticketPost('a', { contractVersion: 'consultation-ticket-request.v1', expectedActorId: users.a.id, clientToken: randomUUID(), command: { kind: 'member_followup', relationshipId: relation, requestId, baseVersion: 6, text: 'Revoked no write' } }, 403);
  pass('real-revoke-member-history-and-advisor-denial', { memberVersions: 6, advisorDenied: true, memberWriteDenied: true });

  const afterFinancial = fingerprint();
  check(beforeFinancial === afterFinancial, 'p03_ticket_changed_financial_balances_or_versions');
  const finalParent = await consultation('a', relation);
  check(finalParent.dossier?.basis.holdingsVersionId === holdingReceipt.version_id || finalParent.dossier === null, 'p03_financial_basis_changed');
  ctx.write('financial-after.json', { fingerprint: afterFinancial }, true);
  pass('financial-rows-fingerprints-and-original-history-preserved', { fingerprintSha256: digest(afterFinancial), holdingVersions: 1, cashVersions: 1, ticketVersions: 6, modelCalls: 0, targetInstall: 'NOT_APPLIED', uiBrowser: 'NOT_RUN' });
  await durabilityNative(ctx, relation); // The c4 durability scenarios remain unchanged.
  // A distinct unknown outcome crosses the release rollback BEFORE its first
  // receipt read. Keep exact correlation in this private runner, never latest.
  const rollbackRelation=(await command('a',{kind:'grant',advisorId:users.owner.id,clientLabel:'Synthetic release rollback case'})).id;
  sql(`INSERT INTO consultation_ticket_fixture.allowed(relationship_id,actor_id) VALUES(${quote(rollbackRelation)},${quote(users.a.id)});`);
  const rollbackParent=await consultation('a',rollbackRelation);
  const rollbackRequest=tickets.validateTicketRequest({contractVersion:'consultation-ticket-request.v1',expectedActorId:users.a.id,clientToken:randomUUID(),command:{kind:'open',relationshipId:rollbackRelation,requestId:randomUUID(),baseVersion:0,subject:'Synthetic pending rollback',text:'SYNTHETIC_PRIVATE_PENDING_BEFORE_RELEASE_STOP',recommendation:null}});
  const rollbackAttempt=client.prepareTicketStorageAttempt(rollbackRequest,rollbackParent,await read('a',client.ticketLookupSelection(rollbackRequest),rollbackRequest));
  check(rollbackAttempt.status==='prepared','p03_release_rollback_attempt_not_prepared');
  const rollbackBody=rollbackAttempt.attempt.intent.body;
  const preserved=await ctx.postExact('/api/consultation/ticket-attempts',rollbackBody,{Cookie:users.a.session.cookie,Origin:ctx.origin});
  check(preserved.status===201,'p03_release_rollback_original_not_preserved');const savedPreparation=await preserved.json();
  let committedReceipt=null,committedPosts=0;
  const discardDelivery=async(_url,init)=>{committedPosts++;const response=await ctx.postExact(TICKETS,String(init.body),{Cookie:users.a.session.cookie,Origin:ctx.origin});check(response.status===201,'p03_release_rollback_command_not_201');committedReceipt=await response.json();throw Error('deliberately discarded command delivery before release stop');};
  check((await client.sendTicketStorageAttempt(rollbackAttempt.attempt,rollbackParent,{currentActorId:users.a.id,transport:discardDelivery})).status==='uncertain'&&committedPosts===1&&committedReceipt,'p03_release_rollback_original_not_unknown');
  const probe={relationshipId:rollbackRelation,preparationId:savedPreparation.preparationId,clientToken:rollbackRequest.clientToken,bodyHash:savedPreparation.bodyHash,body:rollbackBody,receiptId:committedReceipt.id};
  await ctx.setWriteRelease(false); // Roll back writing, keep this same compatible reader.
  const beforeRecovery=ctx.writeCounts();users.a.session=await ctx.newSession('a');
  const preparedRead=await expect('a','/api/consultation/ticket-attempts?'+new URLSearchParams({mode:'lookup',relationshipId:probe.relationshipId,preparationId:probe.preparationId}));
  check(preparedRead.state==='found'&&preparedRead.prepared.bodyHash===probe.bodyHash&&preparedRead.prepared.body===probe.body&&preparedRead.prepared.clientToken===probe.clientToken,'p03_release_rollback_lost_prepared_original');
  const original=JSON.parse(preparedRead.prepared.body),found=await read('a',client.ticketLookupSelection(original),original);
  check(found.mode==='lookup'&&found.data.attempt.state==='found'&&found.data.attempt.receipt.id===probe.receiptId,'p03_release_rollback_lost_same_receipt');
  check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE id=${quote(probe.receiptId)}`)==='1','p03_release_rollback_effect_not_one');
  check(stable(ctx.writeCounts())===stable(beforeRecovery),'p03_release_rollback_replayed_post');
  pass('closed-rollback-fresh-auth-original-prepared-and-receipt-get-only',{originalBodyHash:probe.bodyHash,unknownBeforeReleaseStop:true,firstReceiptReadAfterStop:true,sameReceipt:true,originalEffect:1,additionalTicketPosts:0,additionalPreparationPosts:0,compatibleReaderRetained:true,productServiceRight:'NOT_CONNECTED'});
}

runNativeAuthProfile('consultation-ticket', exercise).catch(error => {
  const message = String(error?.message ?? '');
  console.error(JSON.stringify({ status: 'FAIL_NATIVE_TICKET', reason: /^[a-zA-Z0-9_-]{1,130}$/.test(message) ? message : 'inspect_owned_private_receipts_no_automatic_replay', targetInstall: 'NOT_APPLIED', automaticRetry: false }));
  process.exitCode = 1;
});
