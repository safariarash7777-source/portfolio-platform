"""Explicit GHA dispatch only; sealed app/SQL copy, no operational credentials.

Native stdout, state and intents stay in private temp. Only receipt.json is public.
No CLI flag can pretend to be Linux/GHA or retry an executed allocation.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parents[2]
REPOSITORY = 'safariarash7777-source/portfolio-platform'
CANDIDATE = 'f07e0543c46cea88822dc0d400080b5bb94bef91'
TREE = '8e43eab0bd66705b5455713ea15dd5c1d9c5f81a'
CAPSULE = '04899c1754525365daad2fbe2b11bd9c7c1c3a417d751bd36151332aaca7d2f4'
DRIVER = '0103a765d4862c27a22089414c6a59bcb555dac3f36913ddf48b373e751ecb2a'
CHROME = '95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72'
LABEL = 'p03.assembled-native-lab'
PREFIX = 'assembled-member-admin-'
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HEX = re.compile(r'[a-f0-9]{64}')
CHROME_PATH = Path('/opt/google/chrome/chrome')
CHROME_VERSION = re.compile(r'[0-9]{1,4}(?:\.[0-9]{1,4}){3}')
IMAGE_VERSION = re.compile(r'[0-9]{8}\.[0-9]{1,5}\.[0-9]{1,5}')
CHROME_READ_ERRORS = frozenset({'NONE', 'MISSING', 'UNREADABLE', 'UNSAFE_TYPE',
                              'CHANGED_DURING_READ', 'FILE_BOUND', 'VERSION_UNAVAILABLE'})
OVERLAY_NAMES = {'assembled-auth-runtime.mjs', 'assembled-auth-gateway.mjs', 'assembled-native.mjs',
                 'assembled-member-scenario.mjs', 'assembled-observer-policy.mjs',
                 'assembled-overlay-gate.mjs', 'assembled-native-profile.mjs', 'assembled-native-source.json'}


# Failure diagnostics only. Literal codes from the reviewed frozen sources;
# never forward an arbitrary exception/message or a regex-matching user string.
NATIVE_FAILURE_CODES = frozenset({
    'p03_composition_shared_admission_stopped',
    'p03_composition_stopped',
    'p03_composition_result_shape',
    'p03_composition_result_binding',
    'p03_composition_journal_failed_stop',
    'p03_composition_transport_poisoned',
    'p03_composition_transport_rejection_journal_failed',

    "p03_composition_default_form_exposed",
    "p03_composition_default_prepare_not_closed",
    "assembled_stage_invalid",
    "assembled_acceptance_boundary",
    "assembled_canonical_receipts_required",
    "assembled_check_shape",
    "assembled_checkout_not_exact",
    "assembled_checkout_read_failed",
    "assembled_cleanup_incomplete",
    "assembled_cleanup_shape",
    "assembled_driver_contract_changed",
    "assembled_driver_contract_identity",
    "assembled_exact_candidate_required",
    "assembled_existing_linux_ci_required",
    "assembled_explicit_gate_required",
    "assembled_external_gate_required",
    "assembled_extra_bootstrap_set",
    "assembled_financial_history_changed",
    "assembled_git_read_failed",
    "assembled_member_consultation_dom",
    "assembled_member_exact_authorized_basis",
    "assembled_member_holding_not_mounted",
    "assembled_member_holdings_dom",
    "assembled_member_http_status",
    "assembled_member_independent_financial_readback",
    "assembled_member_mobile_overflow",
    "assembled_member_navigation_observation",
    "assembled_member_private_audit",
    "assembled_observation_shape",
    "assembled_overlay_bytes",
    "assembled_overlay_file_set",
    "assembled_overlay_path",
    "assembled_proof_incomplete",
    "assembled_proof_nonzero",
    "assembled_proof_shape",
    "assembled_readback_failed",
    "assembled_receipt_checks",
    "assembled_receipt_identity",
    "assembled_receipt_shape",
    "assembled_registry_readback",
    "assembled_repo_argument_required",
    "assembled_runtime_image_changed",
    "assembled_runtime_images",
    "assembled_runtime_shape",
    "assembled_runtime_target",
    "assembled_runtime_unverified",
    "assembled_source_contract_changed",
    "assembled_source_file_changed",
    "assembled_source_file_set",
    "assembled_source_file_shape",
    "assembled_source_identity",
    "assembled_source_object_changed",
    "assembled_source_object_set",
    "assembled_working_source_changed",
    "browser_operation_failed",
    "net::ERR_ABORTED",
    "net::ERR_CONNECTION_REFUSED",
    "net::ERR_CONNECTION_RESET",
    "net::ERR_EMPTY_RESPONSE",
    "net::ERR_FAILED",
    "net::ERR_NAME_NOT_RESOLVED",
    "net::ERR_TIMED_OUT",
    "p03_legacy_advisor_refresh",
    "p03_legacy_browser_observation_failed",
    "p03_legacy_browser_write",
    "p03_legacy_dom_state",
    "p03_legacy_identity_clear",
    "p03_legacy_page_ready",
    "p03_legacy_reader_source_changed",
    "p03_legacy_receipt_checks",
    "p03_legacy_receipt_chrome",
    "p03_legacy_receipt_cleanup",
    "p03_legacy_receipt_closure",
    "p03_legacy_receipt_flow",
    "p03_legacy_receipt_owned_path",
    "p03_legacy_receipt_private_or_right",
    "p03_legacy_receipt_shape",
    "p03_legacy_signout_clear",
    "p09_browser_advisor_followup_not_read",
    "p09_browser_advisor_not_ready",
    "p09_browser_advisor_reply_not_read",
    "p09_browser_automatic_ticket_post",
    "p09_browser_cdp_probe_unexpected",
    "p09_browser_cdp_version",
    "p09_browser_check_count",
    "p09_browser_check_identity",
    "p09_browser_checks_incomplete",
    "p09_browser_chrome_version",
    "p09_browser_cleanup_incomplete",
    "p09_browser_cleanup_ownership",
    "p09_browser_cleanup_path",
    "p09_browser_cleanup_realpath",
    "p09_browser_closed_draft_or_post",
    "p09_browser_closure_budget",
    "p09_browser_closure_bytes",
    "p09_browser_closure_changed_bytes",
    "p09_browser_closure_changed_path",
    "p09_browser_closure_changed_type",
    "p09_browser_closure_copy_path",
    "p09_browser_closure_count_or_bytes",
    "p09_browser_closure_depth",
    "p09_browser_closure_directory",
    "p09_browser_closure_file",
    "p09_browser_closure_manifest_mismatch",
    "p09_browser_closure_name",
    "p09_browser_closure_path",
    "p09_browser_closure_realpath",
    "p09_browser_closure_symlink_escape",
    "p09_browser_closure_type",
    "p09_browser_command_context_not_destroyed",
    "p09_browser_command_destroy_click",
    "p09_browser_copy_permissions",
    "p09_browser_copy_root_permissions",
    "p09_browser_debug_logging_forbidden",
    "p09_browser_destroy_command_duplicate",
    "p09_browser_destroy_command_effect_count",
    "p09_browser_destroy_command_missing",
    "p09_browser_destroy_fresh_parent_not_ready",
    "p09_browser_destroy_preparation_missing",
    "p09_browser_destroy_real_logout",
    "p09_browser_destroy_replayed_post",
    "p09_browser_destroy_server_body_changed",
    "p09_browser_destroy_server_original_not_confirmed",
    "p09_browser_disabled_private_fallback",
    "p09_browser_disabled_private_text",
    "p09_browser_driver_version",
    "p09_browser_exact_recovery_not_rendered",
    "p09_browser_existing_chrome_missing",
    "p09_browser_financial_fingerprint_changed",
    "p09_browser_financial_independent_readback",
    "p09_browser_first_context_not_closed",
    "p09_browser_fixture_capability_not_read",
    "p09_browser_followup_not_read",
    "p09_browser_fresh_context_not_get_only",
    "p09_browser_fresh_read_not_settled",
    "p09_browser_fresh_sdk_login_missing",
    "p09_browser_gateway_mode",
    "p09_browser_horizontal_overflow",
    "p09_browser_independent_receipt_not_exact",
    "p09_browser_loopback_control",
    "p09_browser_lost_actual_effect_count",
    "p09_browser_lost_response_identity",
    "p09_browser_member_reply_not_read",
    "p09_browser_member_revoke_history",
    "p09_browser_nonzero_basis_missing",
    "p09_browser_options",
    "p09_browser_original_case_reopened",
    "p09_browser_other_actor_or_revoke_post",
    "p09_browser_other_actor_private_fallback",
    "p09_browser_owned_chrome_identity",
    "p09_browser_owned_process",
    "p09_browser_owned_process_cleanup",
    "p09_browser_owned_temp",
    "p09_browser_owned_temp_cleanup",
    "p09_browser_owner_reopen_not_settled",
    "p09_browser_preflight_context_cleanup",
    "p09_browser_preparation_context_not_destroyed",
    "p09_browser_preparation_destroy_click",
    "p09_browser_private_http_cache",
    "p09_browser_private_storage_or_url",
    "p09_browser_product_right_not_closed",
    "p09_browser_profile_mode",
    "p09_browser_profile_outside_owned_temp",
    "p09_browser_real_api_status",
    "p09_browser_real_document_not_200",
    "p09_browser_real_signout_failed",
    "p09_browser_receipt_closure",
    "p09_browser_receipt_flow",
    "p09_browser_receipt_identity",
    "p09_browser_receipt_missing",
    "p09_browser_receipt_owned_path",
    "p09_browser_recovery_not_same_get_only",
    "p09_browser_reload_automatic_post",
    "p09_browser_reload_not_settled",
    "p09_browser_resource_url_not_preserved",
    "p09_browser_response_interception_unsupported",
    "p09_browser_revoked_private_fallback",
    "p09_browser_revoked_private_text",
    "p09_browser_sdk_cookie_invalid",
    "p09_browser_sdk_cookie_missing",
    "p09_browser_second_armed_post",
    "p09_browser_socket_path_budget",
    "p09_browser_source_binary_size",
    "p09_browser_source_chrome_identity",
    "p09_browser_uncertain_ui_not_seen",
    "p09_browser_unknown_draft_or_duplicate",
    "p09_browser_unknown_preparation_auto_post",
    "p09_browser_unknown_preparation_created_command",
    "p09_browser_unknown_preparation_fresh_parent",
    "p09_browser_unknown_preparation_original_body_not_loaded",
    "p09_browser_unknown_preparation_sent_command",
    "p09_browser_versions_not_three",
    "pf10_native_app_readiness",
    "pf10_native_auth_create",
    "pf10_native_auth_issued_identity",
    "pf10_native_auth_issued_tokens",
    "pf10_native_auth_login",
    "pf10_native_auth_manifest_missing",
    "pf10_native_auth_new_uuid",
    "pf10_native_auth_pull_failed",
    "pf10_native_auth_ready",
    "pf10_native_auth_registry_denied",
    "pf10_native_auth_registry_transport",
    "pf10_native_auth_schema",
    "pf10_native_cleanup_owner",
    "pf10_native_container_identity",
    "pf10_native_database_kernel_not_tmpfs",
    "pf10_native_database_marker",
    "pf10_native_database_readiness",
    "pf10_native_db_manifest_missing",
    "pf10_native_db_pull_failed",
    "pf10_native_db_registry_denied",
    "pf10_native_db_registry_transport",
    "pf10_native_dependency_lock",
    "pf10_native_dirty_source",
    "pf10_native_docker_operation_failed",
    "pf10_native_gateway_environment",
    "pf10_native_guest_warmup",
    "pf10_native_head_merge_tree_mismatch",
    "pf10_native_host_bind",
    "pf10_native_host_identity",
    "pf10_native_http_destination",
    "pf10_native_image_digest",
    "pf10_native_incomplete_acceptance",
    "pf10_native_ingress_exposure",
    "pf10_native_ingress_identity",
    "pf10_native_ingress_network",
    "pf10_native_internal_network",
    "pf10_native_member_token_must_come_from_auth",
    "pf10_native_migration_not_in_profile",
    "pf10_native_network_membership",
    "pf10_native_node_manifest_missing",
    "pf10_native_node_pull_failed",
    "pf10_native_node_registry_denied",
    "pf10_native_node_registry_transport",
    "pf10_native_persistent_database",
    "pf10_native_private_filename",
    "pf10_native_private_path_redirect",
    "pf10_native_private_temp_required",
    "pf10_native_requires_existing_linux_ci",
    "pf10_native_rest_manifest_missing",
    "pf10_native_rest_platform_config",
    "pf10_native_rest_platform_manifest",
    "pf10_native_rest_pull_failed",
    "pf10_native_rest_ready",
    "pf10_native_rest_registry_denied",
    "pf10_native_rest_registry_transport",
    "pf10_native_rest_version",
    "pf10_native_scenario_required",
    "pf10_native_sdk_verified_identity",
    "pf10_native_service_port",
    "pf10_native_source_remote",
    "pf10_native_source_sha",
    "pf10_native_unknown_profile",
    "pf10_native_write_outcome_unknown_stop_no_replay",
    "playwright_timeout",
    "selector_ambiguous",
})

CONTROLLER_FAILURE_CODES = frozenset({
    "assembled_composition_invalid",
    "assembled_app_copy_not_exact",
    "assembled_applied_sql_not_exact",
    "assembled_artifact_location",
    "assembled_browser_cleanup_unconfirmed",
    "assembled_browser_owner_marker",
    "assembled_browser_temp_owner",
    "assembled_capsule_changed",
    "assembled_capsule_members",
    "assembled_capsule_path",
    "assembled_capsule_size",
    "assembled_child_birth_unconfirmed",
    "assembled_child_identity",
    "assembled_cleanup_object_identity",
    "assembled_cleanup_owned_resource_required",
    "assembled_control_location",
    "assembled_docker_cleanup_unconfirmed",
    "assembled_docker_object_id",
    "assembled_driver_contract_changed",
    "assembled_event_input_binding",
    "assembled_execute_once_only",
    "assembled_existing_chrome_pin_required",
    "assembled_existing_failure_no_replay",
    "assembled_existing_local_docker_required",
    "assembled_existing_node_required",
    "assembled_existing_receipt_binding",
    "assembled_explicit_dispatch_required",
    "assembled_finalization_failed",
    "assembled_fresh_run_attempt_required",
    "assembled_git_credential_not_allowed",
    "assembled_helper_checkout_changed",
    "assembled_intent_name",
    "assembled_intent_source",
    "assembled_local_command_failed",
    "assembled_native_failed_no_replay",
    "assembled_native_log_bound",
    "assembled_native_not_accepted_see_receipt",
    "assembled_native_not_confirmed",
    "assembled_native_owner_marker",
    "assembled_native_temp_ambiguous",
    "assembled_native_temp_owner",
    "assembled_operation_failed",
    "assembled_private_binding_changed",
    "assembled_private_ownership",
    "assembled_product_post_or_replay",
    "assembled_real_gha_linux_required",
    "assembled_reviewed_allocation_required",
    "assembled_sanitized_receipt_required",
    "assembled_source_remote",
    "assembled_sql_disk_changed",
    "assembled_sql_pin_set",
})

OBSERVED_CHECKS = (
    "browser-owned-nonzero-dossier-real-consent",
    "isolation-attested",
    "four-fresh-auth-users-and-sdk-getuser",
    "assembled-financial-receipts-and-null-readback",
    "assembled-consent-and-authorized-version-basis",
    "immutable-source-default-closed",
    "assembled-real-member-navigation-and-read-only-dom",
    "actual-sdk-same-jwt-own-versus-foreign-rls",
    "expired-source-unverified-dom",
    "active-source-unverified-dom",
    "revoked-source-unverified-dom",
    "advisor-other-client-zero-side-get",
    "actual-sdk-identity-clear",
    "actual-sdk-signout-clear",
    "private-storage-url-and-owned-cleanup",
)


# Proposed additions to the SAME root controller; no independent entrypoint.
COMPOSITION = 'p03-composition-e0-v1'
SELECTED_PROFILE = 'assembled-member-admin-v1'
CAPSULE_FILE = 'sealed-v4b-app-f07.tar'
NATIVE_GLOB = 'assembled-member-admin-native-*'
COMPOSITION_SPEC = {'application': 'e0b930927563d7f9f6d79e848917c4ba0d77ed6f', 'tree': 'c6c67f2a78cd2cf672cf4f489f81e7f14cb041da', 'capsuleSha256': '54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255', 'driverSha256': 'e8b12e8f44e80e6fc41719028769ea126a16a4250f0a6b0e2433d8481b643850', 'overlayNames': ['assembled-auth-gateway.mjs', 'assembled-auth-runtime.mjs', 'assembled-member-scenario.mjs', 'assembled-native-profile.mjs', 'assembled-native-source.json', 'assembled-native.mjs', 'assembled-observer-policy.mjs', 'assembled-overlay-gate.mjs', 'composition-browser-case.mjs', 'composition-contract.mjs', 'composition-contract.test.mjs', 'composition-member-phase.mjs', 'composition-transport.mjs', 'composition-transport.test.mjs']}


def composition_json(raw):
    need(isinstance(raw, bytes) and 0 < len(raw) <= 2 * 1024 * 1024, 'assembled_composition_invalid')
    def unique(pairs):
        row = dict(pairs)
        need(len(row) == len(pairs), 'assembled_composition_invalid')
        return row
    def invalid(_):
        raise ValueError('assembled_composition_invalid')
    return json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=invalid)


def select_profile(inputs):
    global SELECTED_PROFILE, CANDIDATE, TREE, CAPSULE, DRIVER, PREFIX, CAPSULE_FILE, NATIVE_GLOB, OVERLAY_NAMES
    profile = inputs.get('acceptance_profile', 'assembled-member-admin-v1')
    extra = [inputs.get(key, '') for key in ('candidate_sha', 'capsule_sha256', 'driver_sha256')]
    if profile == 'assembled-member-admin-v1':
        need(extra == ['', '', ''] and SELECTED_PROFILE == profile, 'assembled_composition_invalid')
        return profile
    need(profile == COMPOSITION and extra == [COMPOSITION_SPEC[k] for k in ('application', 'capsuleSha256', 'driverSha256')], 'assembled_composition_invalid')
    SELECTED_PROFILE = profile
    CANDIDATE, TREE = COMPOSITION_SPEC['application'], COMPOSITION_SPEC['tree']
    CAPSULE, DRIVER = extra[1:]
    CAPSULE_FILE, PREFIX, NATIVE_GLOB = 'sealed-p03-composition-e0-v1.tar', 'consultation-ticket-', 'consultation-ticket-native-*'
    OVERLAY_NAMES = set(COMPOSITION_SPEC['overlayNames'])
    return profile


def composition_read(local, name):
    # Local private artifacts only. No shell, DB, network or capsule imports.
    path = local / name
    owned(path)
    need(not local.is_symlink() and hasattr(os, 'O_NOFOLLOW'), 'assembled_composition_invalid')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= 2 * 1024 * 1024, 'assembled_composition_invalid')
        raw = bytearray()
        while len(raw) <= before.st_size:
            chunk = os.read(fd, min(65536, before.st_size + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        need(len(raw) == before.st_size and file_identity(before) == file_identity(os.fstat(fd)) == file_identity(path.lstat()), 'assembled_composition_invalid')
        return composition_json(bytes(raw)), sha(bytes(raw))
    finally:
        os.close(fd)


def reconcile_composition(records, run_id, candidate):
    """Pure independent reader: rederive counts from persisted attempts/results."""
    need(isinstance(records, dict) and len(records) <= 256, 'assembled_composition_invalid')
    get = lambda name: records[name]
    intents, results, direct, direct_results = {}, {}, {}, {}
    for name, row in records.items():
        for pattern, target in [(r'composition-intent-(\d{3})\.json', intents), (r'composition-result-(\d{3})\.json', results),
                                (r'intent-(\d{3})\.json', direct), (r'transport-result-(\d{3})\.json', direct_results)]:
            match = re.fullmatch(pattern, name)
            if match:
                target[int(match[1])] = row
    need(set(intents) == set(results) == set(range(1, 27)) and set(direct) == set(direct_results) == set(range(1, 36)), 'assembled_composition_invalid')
    caps = {('a','/api/portfolio/holdings'):2, ('a','/api/personal-finance/cash-flow'):1,
            ('a','/api/consultation'):4, ('owner','/api/consultation'):5,
            ('a','/api/consultation/tickets'):3, ('owner','/api/consultation/tickets'):2,
            ('a','/api/consultation/ticket-attempts'):5, ('owner','/api/consultation/ticket-attempts'):2,
            ('owner','/api/consultation/replies'):2}
    counts, statuses, tokens, products = Counter(), Counter(), set(), {}
    for index, row in intents.items():
        need(isinstance(row, dict) and set(row)=={'kind','ordinal','actor','path','body','bodySha256','token'} and row['kind']=='intent' and type(row['ordinal']) is int and row['ordinal']==index and isinstance(row['body'],str), 'assembled_composition_invalid')
        body = composition_json(row['body'].encode())
        token=body.get('clientToken',body.get('client_token'))
        key=(row['actor'],row['path'])
        need(key in caps and row['token']==token and isinstance(token,str) and UUID.fullmatch(token) and sha(row['body'].encode())==row['bodySha256'], 'assembled_composition_invalid')
        identity=(*key,token)
        need(identity not in tokens, 'assembled_composition_invalid');tokens.add(identity);counts[key]+=1
        result=results[index]
        need(isinstance(result,dict) and set(result)=={'kind','ordinal','status'} and result['kind']=='result' and type(result['ordinal']) is int and result['ordinal']==index and type(result['status']) is int and result['status'] in (200,201,409,503), 'assembled_composition_invalid')
        statuses[result['status']]+=1
        products[(row['path'],token)] = (body,result['status'])
    need(counts==Counter(caps) and statuses[200]+statuses[201]==24 and statuses[409]==1 and statuses[503]==1, 'assembled_composition_invalid')
    auth=Counter();matched=set()
    for index,row in direct.items():
        need(isinstance(row,dict) and set(row)=={'path','body','sha'} and row['sha']==candidate and isinstance(row['path'],str), 'assembled_composition_invalid')
        result=direct_results[index]
        need(isinstance(result,dict) and set(result)=={'ordinal','path','status','sha'} and type(result['ordinal']) is int and result['ordinal']==index and result['path']==row['path'] and result['sha']==candidate and type(result['status']) is int, 'assembled_composition_invalid')
        path=row['path'];body=row['body']
        if path.startswith('/api/'):
            need(isinstance(body,dict), 'assembled_composition_invalid')
            key=(path,body.get('clientToken',body.get('client_token')))
            need(key not in matched and key in products and products[key]==(body,result['status']), 'assembled_composition_invalid');matched.add(key)
        else:
            need(path in ('/auth/v1/admin/users','/auth/v1/token?grant_type=password','/auth/v1/logout','/rest/v1/rpc/lookup_consultation_ticket_attempt'), 'assembled_composition_invalid')
            allowed=(403,) if path.startswith('/rest/') else ((200,204) if path.endswith('/logout') else (200,201))
            need(result['status'] in allowed, 'assembled_composition_invalid');auth[path]+=1
    need(len(matched)==17 and auth==Counter({'/auth/v1/admin/users':4,'/auth/v1/token?grant_type=password':9,'/auth/v1/logout':4,'/rest/v1/rpc/lookup_consultation_ticket_attempt':1}), 'assembled_composition_invalid')
    transport=get('transport-observation.json');proof=get('composition-observed.json');db=get('composition-database-observation.json');binding=get('composition-binding.json')
    need(transport.get('sha')==candidate and transport.get('runId')==run_id and transport.get('schema')=='p03-owned-transport.v1' and transport.get('poisoned') is False and type(transport.get('rejected')) is int and transport['rejected']==0 and type(transport.get('authorizedPostRequests')) is int and transport['authorizedPostRequests']==35 and type(transport.get('sdkReads')) is int and 9<=transport['sdkReads']<=36, 'assembled_composition_invalid')
    need(proof.get('sha')==candidate and proof.get('appSha')==candidate and proof.get('runId')==run_id and proof.get('schema')=='p03-composition-observed.v1' and binding.get('runId')==run_id and binding.get('appSha')==candidate and binding.get('appTree')==COMPOSITION_SPEC['tree'], 'assembled_composition_invalid')
    ids=binding.get('authCreatedIds');actors=binding.get('actors')
    need(isinstance(ids,list) and len(ids)==4 and len(set(ids))==4 and all(isinstance(i,str) and UUID.fullmatch(i) for i in ids) and isinstance(actors,list) and len(actors)==4 and {a['id'] for a in actors}==set(ids) and all(a['run']==run_id for a in actors), 'assembled_composition_invalid')
    need(db.get('databaseMarker')==run_id and type(db.get('authUsers')) is int and db['authUsers']==4, 'assembled_composition_invalid')
    for key,value in {'requests':2,'ticketEvents':5,'preparedIntents':6,'summaryEvents':3,'publications':1,'feedback':3,'replyVersions':1,'holdingVersions':2,'cashFlowVersions':1}.items():
        need(type(db.get(key)) is int and db[key]==value, 'assembled_composition_invalid')
    need(len(db.get('relationships',[]))==len(db.get('sessions',[]))==1, 'assembled_composition_invalid')
    rel=db['relationships'][0];session=db['sessions'][0];summary=proof['summary']
    need(rel['clientId'] in ids and rel['advisorId'] in ids and rel['clientId']!=rel['advisorId'] and rel['revoked'] is True and session['relationshipId']==rel['id']==summary['replyReceipt']['command']['relationshipId'] and session['id']==summary['sessionId'] and session['contentHash']==summary['contentHash'] and isinstance(session['contentHash'],str) and HEX.fullmatch(session['contentHash']) and type(session['version']) is int and session['version']==1, 'assembled_composition_invalid')
    for identifier in (rel['id'],session['id'],summary['requestId']):
        need(isinstance(identifier,str) and UUID.fullmatch(identifier), 'assembled_composition_invalid')
    links=db.get('requestLinks');recommendations=db.get('recommendationLinks')
    need(isinstance(links,list) and len(links)==2 and len({r['requestId'] for r in links})==2 and all(r['relationshipId']==rel['id'] for r in links) and summary['requestId'] in {r['requestId'] for r in links}, 'assembled_composition_invalid')
    need(isinstance(recommendations,list) and len(recommendations)==1 and recommendations[0]['requestId']==summary['requestId'] and type(recommendations[0]['version']) is int and recommendations[0]['version']==3 and recommendations[0]['recommendation']=={'sessionId':session['id'],'version':1,'contentHash':session['contentHash']}, 'assembled_composition_invalid')
    actor_map={'a':rel['clientId'],'owner':rel['advisorId']}
    holding_rows=db.get('holdingOwnership')
    need(isinstance(holding_rows,list) and len(holding_rows)==2 and all(type(r.get('version')) is int for r in holding_rows) and {r['version'] for r in holding_rows}=={1,2}, 'assembled_composition_invalid')
    for row in intents.values():
        body=composition_json(row['body'].encode())
        if row['path']=='/api/portfolio/holdings':
            # This API derives ownership from the authenticated session, not a body field.
            need(row['actor']=='a' and 'expectedActorId' not in body and 'expectedOwnerId' not in body and type(body.get('base_version')) is int and body['base_version'] in (0,1), 'assembled_composition_invalid')
            matches=[h for h in holding_rows if h.get('clientToken')==body.get('client_token')]
            need(len(matches)==1 and matches[0]['userId']==actor_map['a'] and matches[0]['version']==body['base_version']+1, 'assembled_composition_invalid')
        else:
            field='expectedOwnerId' if row['path']=='/api/personal-finance/cash-flow' else 'expectedActorId'
            need(body.get(field)==actor_map[row['actor']], 'assembled_composition_invalid')
    need(proof.get('unknownScope')=='P03-ticket-only' and proof.get('p09HistoricalAcceptanceTransferred') is False and proof.get('p09UnknownSave')=='NOT_COVERED_MISSING_JOURNAL' and type(proof.get('modelCalls')) is int and proof['modelCalls']==0 and type(proof.get('workbookPosts')) is int and proof['workbookPosts']==0, 'assembled_composition_invalid')
    expected_browser=['browser-preflight-before-provision','real-member-page-default-right-closed','real-201-discard-live-page-one-post','same-attempt-get-only-recovery','fresh-sdk-context-and-reload-get-only','real-advisor-response-and-member-followup','real-revoke-and-private-fallback-denial','desktop-mobile-and-private-storage-cache-url','unconfirmed-command-destroy-and-server-intent-get-only','unknown-preparation-destroy-no-command','owned-browser-cleanup']
    checks=proof.get('browserChecks')
    need(isinstance(checks,list) and len(checks)==11 and {r['name'] for r in checks}==set(expected_browser) and all(r['status']=='PASS' for r in checks), 'assembled_composition_invalid')
    return {'schemaVersion':'p03-independent-journal.v1','runId':run_id,'sourceCommit':candidate,'productAttempts':26,'positive':24,'denied':2,'directPostAttempts':35,'directProductAttempts':17,'browserProductAttempts':9,'authCreate':4,'authPassword':9,'authLogout':4,'negativeRpc':1,'unresolved':0,'journalMatched':True,'databaseMatched':True,'sqlFilesVerified':19}


def verify_composition_state(data, private):
    need(data and data['migrations']==expected_sql(private), 'assembled_applied_sql_not_exact')
    local=Path(data['local']);records={};digests={}
    with os.scandir(local) as entries:
        for index,entry in enumerate(entries):
            need(index<256,'assembled_composition_invalid')
            if entry.name.startswith(('intent-','transport-result-','composition-')) or entry.name=='transport-observation.json':
                need(entry.name.endswith('.json') and entry.is_file(follow_symlinks=False), 'assembled_composition_invalid')
                records[entry.name],digests[entry.name]=composition_read(local,entry.name)
    independent=reconcile_composition(records,data['id'],CANDIDATE)
    independent.update(dockerContainers=0,dockerNetworks=0,browserTemps=0,fallbackUsed=False)
    independent.update(compositionProofSha256=digests['composition-observed.json'],transportProofSha256=digests['transport-observation.json'])
    return independent


def project_composition(raw, independent, binding):
    need(isinstance(raw,bytes) and len(raw)<=64*1024*1024, 'assembled_composition_invalid')
    rows=[];checks=[]
    for line in raw.splitlines():
        if line.startswith(b'P03_ASSEMBLED_NATIVE_AUTH '):
            rows.append(composition_json(line[len(b'P03_ASSEMBLED_NATIVE_AUTH '):]))
        if line.startswith(b'P03_ASSEMBLED_NATIVE_CHECK '):
            checks.append(composition_json(line[len(b'P03_ASSEMBLED_NATIVE_CHECK '):]))
    need(len(rows)==1, 'assembled_composition_invalid')
    row=rows[0]
    names=['isolation-attested','four-fresh-auth-users-and-sdk-getuser','browser-owned-nonzero-dossier-real-consent','assembled-real-member-navigation-and-read-only-dom','browser-real-consumer-checked','composition-summary-published-exact-link','composition-question-reply-and-feedback','composition-fresh-summary-dom-get-only','composition-feedback-stable-before-basis-change','composition-financial-basis-change-readonly','composition-isolation-revocation-history','composition-auth-api-cdp-counts','composition-owned-browser-cleanup']
    need(len(checks)==13 and {r.get('name') for r in checks}==set(names) and all(r.get('status')=='PASS' for r in checks), 'assembled_composition_invalid')
    need(row.get('sha')==CANDIDATE and row.get('allocationId')==binding['executionAllocationId'] and row.get('status')=='PASS_BOUNDED_P03_COMPOSITION_NATIVE' and row.get('cleanup')=='REMOVED_OWNED_RESOURCES' and type(row.get('scenarios')) is int and row['scenarios']==13, 'assembled_composition_invalid')
    need(independent.get('journalMatched') is True and independent.get('databaseMatched') is True and independent.get('fallbackUsed') is False and independent.get('sourceCommit')==CANDIDATE, 'assembled_composition_invalid')
    for key in ('compositionProofSha256','transportProofSha256'):
        need(isinstance(row.get(key),str) and HEX.fullmatch(row[key]) and row[key]==independent.get(key), 'assembled_composition_invalid')
    safe_independent={}
    for key,value in {'productAttempts':26,'positive':24,'denied':2,'directPostAttempts':35,'directProductAttempts':17,'browserProductAttempts':9,'authCreate':4,'authPassword':9,'authLogout':4,'negativeRpc':1,'unresolved':0,'sqlFilesVerified':19,'dockerContainers':0,'dockerNetworks':0,'browserTemps':0}.items():
        need(type(independent.get(key)) is int and independent[key]==value, 'assembled_composition_invalid')
        safe_independent[key]=value
    safe_independent.update(journalMatched=True,databaseMatched=True,fallbackUsed=False)
    return {'status':'PASS_BOUNDED_P03_COMPOSITION_NATIVE','nativeChecks':13,'browserChecks':11,'independent':safe_independent,'targetInstall':'NOT_APPLIED','arashAcceptance':'UNOBSERVED','fullAssembledAcceptance':'NOT_ESTABLISHED','p09UnknownSave':'NOT_COVERED_MISSING_JOURNAL'}


def need(value, code):
    if not value:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def project_chrome_observation(value):
    if not isinstance(value, dict) or value.get('schemaVersion') != 'chrome-runner-observation.v1':
        return None
    result = {'schemaVersion': 'chrome-runner-observation.v1'}
    for key in ['exists', 'isRegular', 'noSymlink', 'knownFixedPath']:
        item = value.get(key)
        result[key] = item if type(item) is bool else None
    digest = value.get('observedSha256')
    digest = digest if isinstance(digest, str) and HEX.fullmatch(digest) else None
    result['observedSha256'] = digest
    result['matchesReviewedSha'] = digest == CHROME if digest is not None else None
    version = value.get('chromeVersion')
    result['chromeVersion'] = (version if result['matchesReviewedSha'] is True
                              and result['noSymlink'] is True and isinstance(version, str)
                              and CHROME_VERSION.fullmatch(version) else None)
    image = value.get('runnerImageVersion')
    result['runnerImageVersion'] = image if isinstance(image, str) and IMAGE_VERSION.fullmatch(image) else None
    # The coordinator must independently compare the same job's Set up job log.
    result['runnerImageVersionAttested'] = False
    error = value.get('readError')
    result['readError'] = error if isinstance(error, str) and error in CHROME_READ_ERRORS else 'UNREADABLE'
    return result


def file_identity(metadata):
    return tuple(getattr(metadata, key) for key in
                 ['st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns'])


def observe_chrome():
    result = {'schemaVersion': 'chrome-runner-observation.v1', 'knownFixedPath': True,
              'exists': None, 'isRegular': None, 'noSymlink': None,
              'observedSha256': None, 'chromeVersion': None,
              'runnerImageVersion': os.environ.get('ImageVersion'), 'readError': 'UNREADABLE'}
    descriptor = None
    try:
        metadata = CHROME_PATH.lstat()
        result.update(exists=True, isRegular=stat.S_ISREG(metadata.st_mode))
        chain = [*reversed(CHROME_PATH.parents), CHROME_PATH]
        if any(stat.S_ISLNK(path.lstat().st_mode) for path in chain):
            result.update(noSymlink=False, readError='UNSAFE_TYPE')
            return project_chrome_observation(result)
        result['noSymlink'] = True
        if not result['isRegular'] or not hasattr(os, 'O_NOFOLLOW'):
            result['readError'] = 'UNSAFE_TYPE'
            return project_chrome_observation(result)
        descriptor = os.open(CHROME_PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or file_identity(before) != file_identity(metadata):
            result['readError'] = 'CHANGED_DURING_READ'
            return project_chrome_observation(result)
        if not 0 < before.st_size <= 512 * 1024 * 1024:
            result['readError'] = 'FILE_BOUND'
            return project_chrome_observation(result)
        digest, total = hashlib.sha256(), 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > before.st_size:
                result['readError'] = 'CHANGED_DURING_READ'
                return project_chrome_observation(result)
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (total != before.st_size or file_identity(before) != file_identity(after)
                or file_identity(after) != file_identity(CHROME_PATH.lstat())
                or any(stat.S_ISLNK(path.lstat().st_mode) for path in chain)):
            result['readError'] = 'CHANGED_DURING_READ'
            return project_chrome_observation(result)
        result.update(observedSha256=digest.hexdigest(), readError='NONE')
        if result['observedSha256'] == CHROME:
            # Execute only the exact reviewed bytes, through the still-open FD.
            # A mismatched browser is never executed, even for --version.
            try:
                version = subprocess.run([str(CHROME_PATH), '--version'],
                                        executable='/proc/self/fd/' + str(descriptor), pass_fds=(descriptor,),
                                        cwd='/', env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'},
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3)
                match = (re.fullmatch(rb'Google Chrome ([0-9]{1,4}(?:\.[0-9]{1,4}){3})\s*', version.stdout)
                         if version.returncode == 0 and len(version.stdout) <= 256 else None)
                if match and file_identity(after) == file_identity(os.fstat(descriptor)):
                    result['chromeVersion'] = match.group(1).decode('ascii')
                else:
                    result['readError'] = 'VERSION_UNAVAILABLE'
            except (OSError, subprocess.SubprocessError):
                result['readError'] = 'VERSION_UNAVAILABLE'
    except FileNotFoundError:
        if result['exists'] is None:
            result.update(exists=False, readError='MISSING')
        else:
            result['readError'] = 'CHANGED_DURING_READ'
    except OSError:
        result['readError'] = 'UNREADABLE'
    finally:
        if descriptor is not None:
            os.close(descriptor)
    return project_chrome_observation(result)


def capture_chrome_prepare_failure():
    binding = actual_context()
    _, _, private, _ = paths()
    state = load_state(binding, private)
    if state.get('stage') == 'PREPARING' and state.get('attempted') is False:
        state['chromePreflight'] = observe_chrome()
        private_json(private / 'state.json', state)


def runner_observation():
    env = os.environ
    need(sys.platform == 'linux' and env.get('RUNNER_OS') == 'Linux'
         and env.get('CI') == 'true' and env.get('GITHUB_ACTIONS') == 'true'
         and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and env.get('GITHUB_REPOSITORY') == REPOSITORY
         and env.get('GITHUB_JOB') == 'runner-observation'
         and env.get('GITHUB_RUN_ATTEMPT') == '1'
         and re.fullmatch(r'[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')),
         'runner_observation_binding_invalid')
    reviewed = env.get('RUNNER_OBSERVATION_REVIEWED_SHA', '')
    event = json.loads(Path(env['GITHUB_EVENT_PATH']).read_bytes())
    need(re.fullmatch(r'[a-f0-9]{40}', reviewed) and reviewed == env.get('GITHUB_SHA')
         and event.get('inputs', {}).get('reviewed_source_sha') == reviewed
         and git(CONTROL, 'rev-parse', 'HEAD') == reviewed
         and git(CONTROL, 'remote', 'get-url', 'origin').removesuffix('.git') == 'https://github.com/' + REPOSITORY,
         'runner_observation_source_unbound')
    credential = subprocess.run(['git', 'config', '--local', '--get-regexp', r'^(credential\.|http\..*extraheader)'],
                                cwd=CONTROL, capture_output=True)
    need(credential.returncode == 1 and not credential.stdout, 'runner_observation_credentials_present')
    observation = observe_chrome()
    return {'schemaVersion': 'assembled-runner-observation.v1', 'status': 'OBSERVATION_ONLY_NOT_NATIVE_ACCEPTANCE',
            'binding': {'repository': REPOSITORY, 'runId': env['GITHUB_RUN_ID'], 'attempt': 1,
                        'job': env['GITHUB_JOB'], 'sourceCommit': reviewed,
                        'runnerImageVersion': observation['runnerImageVersion'], 'runnerImageVersionAttested': False},
            'chrome': observation, 'nativeAttempted': False, 'targetInstall': 'NOT_APPLIED',
            'arashAcceptance': 'UNOBSERVED', 'automaticReplay': False}


def context(env, platform):
    need(platform == 'linux' and env.get('RUNNER_OS') == 'Linux' and env.get('CI') == 'true'
         and env.get('GITHUB_ACTIONS') == 'true', 'assembled_real_gha_linux_required')
    need(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and env.get('GITHUB_REPOSITORY') == REPOSITORY
         and env.get('GITHUB_JOB') == 'assembled-native-bounded', 'assembled_explicit_dispatch_required')
    need(re.fullmatch(r'[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')) and env.get('GITHUB_RUN_ATTEMPT') == '1', 'assembled_fresh_run_attempt_required')
    allocation = env.get('ASSEMBLED_ALLOCATION_ID', '')
    reviewed = env.get('ASSEMBLED_REVIEWED_SHA', '')
    need(UUID.fullmatch(allocation) and re.fullmatch(r'[a-f0-9]{40}', reviewed)
         and env.get('GITHUB_SHA') == reviewed, 'assembled_reviewed_allocation_required')
    execution = str(uuid.uuid5(uuid.UUID(allocation), REPOSITORY + '/' + env['GITHUB_RUN_ID'] + '/1/' + reviewed))
    return {'repository': REPOSITORY, 'workflowCommit': reviewed, 'runId': env['GITHUB_RUN_ID'],
            'attempt': 1, 'allocationId': allocation, 'executionAllocationId': execution}


def command(args, cwd=None, env=None, timeout=30, body=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=body, capture_output=True, timeout=timeout)
    need(result.returncode == 0, 'assembled_local_command_failed')
    return result.stdout


def git(repo, *args):
    return command(['git', *args], cwd=repo).decode().strip()


def private_json(path, value, exclusive=False):
    raw = (json.dumps(value, sort_keys=True) + '\n').encode()
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    else:
        temporary = path.with_suffix('.pending')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)


def owned(path, directory=False):
    metadata = path.lstat()
    need(not path.is_symlink() and metadata.st_uid == os.getuid()
         and not metadata.st_mode & 0o077 and (stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode)), 'assembled_private_ownership')


def paths():
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    temp = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    need(CONTROL == workspace / 'control', 'assembled_control_location')
    private = temp / ('assembled-dispatch-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'])
    return workspace, temp, private, workspace / 'assembled-candidate'


def actual_context():
    value = context(os.environ, sys.platform)
    event = composition_json(Path(os.environ['GITHUB_EVENT_PATH']).read_bytes())
    inputs = event.get('inputs', {})
    need(isinstance(inputs,dict), 'assembled_event_input_binding')
    profile=select_profile(inputs)
    if profile==COMPOSITION:
        value.update(acceptanceProfile=profile,candidateCommit=CANDIDATE,capsuleSha256=CAPSULE,driverContractSha256=DRIVER)
    need(inputs.get('assembled_native') in (True, 'true') and inputs.get('allocation_id') == value['allocationId']
         and inputs.get('reviewed_helper_sha') == value['workflowCommit'], 'assembled_event_input_binding')
    need(git(CONTROL, 'rev-parse', 'HEAD') == value['workflowCommit'], 'assembled_helper_checkout_changed')
    return value


def unpack_capsule(raw, destination):
    need(sha(raw) == CAPSULE, 'assembled_capsule_changed')
    expected = {'overlay/scripts/testing/consultation-tickets/' + name for name in OVERLAY_NAMES}
    expected |= {'overlay/scripts/testing/consultation-tickets/assembled-overlay.json', 'apply-overlay.py', 'REVIEW.fa.md'}
    import io
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
        members = archive.getmembers()
        need(len(members) == len(expected) and {m.name for m in members} == expected and all(m.isfile() for m in members), 'assembled_capsule_members')
        need(sum(m.size for m in members) < 256 * 1024, 'assembled_capsule_size')
        for member in members:
            target = destination / member.name
            need(not Path(member.name).is_absolute() and '..' not in Path(member.name).parts, 'assembled_capsule_path')
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open('xb') as handle:
                handle.write(archive.extractfile(member).read())
    manifest = destination / 'overlay/scripts/testing/consultation-tickets/assembled-overlay.json'
    need(sha(manifest.read_bytes()) == DRIVER, 'assembled_driver_contract_changed')
    return json.loads(manifest.read_bytes())


def safe_env(private):
    # No inherited API key, GitHub runtime token, provider token or remote Docker.
    env = {key: os.environ[key] for key in ['PATH', 'LANG', 'CI', 'GITHUB_ACTIONS', 'RUNNER_TEMP'] if key in os.environ}
    env.update(TMPDIR=str(private), DOCKER_CONFIG=str(private / 'docker-client'),
               DOCKER_HOST='unix:///var/run/docker.sock',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null',
               P01_P03_ASSEMBLED_NATIVE_SOURCE_SHA=CANDIDATE)
    return env


def expected_sql(private):
    base = private / 'capsule/overlay/scripts/testing/consultation-tickets'
    source = json.loads((base / 'assembled-native-source.json').read_bytes())
    overlay = json.loads((base / 'assembled-overlay.json').read_bytes())
    pins = {p['path']: p for p in source['files'] + overlay['additionalBootstrap']}
    names = source['bootstrap'] + [p['path'] for p in overlay['additionalBootstrap']]
    need(len(names) == len(set(names)) == (19 if SELECTED_PROFILE==COMPOSITION else 18), 'assembled_sql_pin_set')
    return [{'file': name, 'sha256': pins[name]['sha256']} for name in names]


def prepare():
    binding = actual_context()
    _, temp, private, app = paths()
    private.mkdir(mode=0o700)
    owned(private, True)
    state = {'binding': binding, 'stage': 'PREPARING', 'attempted': False, 'fallbackUsed': False,
             'beforeNative': sorted(p.name for p in temp.glob(NATIVE_GLOB)),
             'beforeBrowser': sorted(p.name for p in temp.glob('p09b-*'))}
    if SELECTED_PROFILE==COMPOSITION:state['compositionStartedMonotonic']=time.monotonic()
    private_json(private / 'state.json', state, True)
    need(git(app, 'rev-parse', 'HEAD') == CANDIDATE and git(app, 'rev-parse', 'HEAD^{tree}') == TREE
         and git(app, 'status', '--porcelain', '--untracked-files=no') == '', 'assembled_app_copy_not_exact')
    for repo in [CONTROL, app]:
        need(git(repo, 'remote', 'get-url', 'origin').removesuffix('.git') == 'https://github.com/' + REPOSITORY, 'assembled_source_remote')
        # checkout persist-credentials=false must leave no operational Git token.
        config = subprocess.run(['git', 'config', '--local', '--get-regexp', r'^(credential\.|http\..*extraheader)'], cwd=repo, capture_output=True)
        need(config.returncode == 1 and not config.stdout, 'assembled_git_credential_not_allowed')
    capsule_dir = private / 'capsule'
    capsule_dir.mkdir(mode=0o700)
    unpack_capsule((HERE / CAPSULE_FILE).read_bytes(), capsule_dir)
    need(Path('/opt/google/chrome/chrome').is_file()
         and sha(Path('/opt/google/chrome/chrome').read_bytes()) == CHROME, 'assembled_existing_chrome_pin_required')
    need(Path('/var/run/docker.sock').is_socket(), 'assembled_existing_local_docker_required')
    docker_dir = private / 'docker-client'
    docker_dir.mkdir(mode=0o700)
    private_json(docker_dir / 'config.json', {'auths': {}}, True)
    specification = importlib.util.spec_from_file_location('sealed_materializer', capsule_dir / 'apply-overlay.py')
    materializer = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(materializer)
    materializer.apply(capsule_dir / 'overlay', app, DRIVER)
    for pin in expected_sql(private):
        need(sha((app / pin['file']).read_bytes()) == pin['sha256'], 'assembled_sql_disk_changed')
    state['stage'] = 'PREPARED'
    private_json(private / 'state.json', state)
    return 'PREPARED_NATIVE_NOT_RUN'


def load_state(binding, private):
    owned(private, True)
    owned(private / 'state.json')
    state = json.loads((private / 'state.json').read_bytes())
    need(state['binding'] == binding, 'assembled_private_binding_changed')
    return state


def birth(pid):
    try:
        raw = Path('/proc/' + str(pid) + '/stat').read_text()
        return raw[raw.rfind(')') + 2:].split()[19]
    except (FileNotFoundError, ProcessLookupError):
        return None


def stop_child(state):
    pid = state.get('pid')
    if pid and state.get('birth') is None:
        need(birth(pid) is None, 'assembled_child_birth_unconfirmed')
        return
    if pid and birth(pid) == state.get('birth'):
        need(os.getpgid(pid) == pid and Path('/proc/' + str(pid)).stat().st_uid == os.getuid(), 'assembled_child_identity')
        os.killpg(pid, signal.SIGTERM)
        for _ in range(50):
            if birth(pid) != state['birth']:
                return
            time.sleep(0.1)
        if birth(pid) == state['birth']:
            os.killpg(pid, signal.SIGKILL)


def claim_execution(private, binding, state):
    need(state['stage'] == 'PREPARED', 'assembled_execute_once_only')
    private_json(private / 'execution-intent.json', {'binding': binding, 'candidate': CANDIDATE, 'driverContract': DRIVER}, True)
    state.update(stage='STARTING', attempted=True)
    private_json(private / 'state.json', state)


def execute():
    binding = actual_context()
    _, _, private, app = paths()
    state = load_state(binding, private)
    claim_execution(private, binding, state)
    node = shutil.which('node')
    need(node, 'assembled_existing_node_required')
    args = [node, '--import', 'tsx', 'scripts/testing/consultation-tickets/assembled-native.mjs', '--execute',
            '--allocation-id', binding['executionAllocationId'], '--driver-contract-sha256', DRIVER]
    if SELECTED_PROFILE==COMPOSITION:
        need(0<=time.monotonic()-state['compositionStartedMonotonic']<22*60,'assembled_composition_invalid')
    with (private / 'native.log').open('xb') as log:
        process = subprocess.Popen(args, cwd=app, env=safe_env(private), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        state.update(pid=process.pid, birth=birth(process.pid), stage='RUNNING')
        private_json(private / 'state.json', state)
        try:
            remaining=25*60
            if SELECTED_PROFILE==COMPOSITION:
                remaining=max(0.001,22*60-(time.monotonic()-state['compositionStartedMonotonic']))
            state['exitCode'] = process.wait(timeout=remaining)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            state['timedOutOrInterrupted'] = True
            stop_child(state)
            state['exitCode'] = process.wait(timeout=10)
        finally:
            state['stage'] = 'EXECUTED'
            private_json(private / 'state.json', state)
    need(state['exitCode'] == 0, 'assembled_native_failed_no_replay')
    return 'NATIVE_EXITED_RECEIPT_NOT_YET_ACCEPTED'


def native_state(temp, private, state):
    new = [p for p in temp.glob(NATIVE_GLOB) if p.name not in state['beforeNative']]
    need(len(new) <= 1, 'assembled_native_temp_ambiguous')
    if not new:
        return None
    path = new[0]
    # Runtime mkdtemp may use default umask; it remains inside the private GHA temp.
    need(not path.is_symlink() and path.parent == temp and path.stat().st_uid == os.getuid(), 'assembled_native_temp_owner')
    data = json.loads((path / 'state.json').read_bytes())
    need(data['sha'] == CANDIDATE and data['local'] == str(path) and isinstance(data['id'], str)
         and data['id'].startswith(PREFIX) and UUID.fullmatch(data['id'][len(PREFIX):]), 'assembled_native_owner_marker')
    return data


def owned_docker_resource(role, row, run_id, query_id):
    need(isinstance(row.get('Id'), str) and HEX.fullmatch(row['Id']) and row['Id'].startswith(query_id), 'assembled_cleanup_object_identity')
    labels = row['Config']['Labels'] if role == 'container' else row['Labels']
    name = row['Name'].lstrip('/')
    allowed = [run_id + '-' + end for end in (['db', 'auth', 'rest', 'ingress', 'rest-version'] if role == 'container' else ['internal', 'edge'])]
    need(labels.get(LABEL) == run_id and name in allowed, 'assembled_cleanup_owned_resource_required')
    return row['Id']


def docker_objects(private, run_id):
    env = safe_env(private)
    def call(args):
        return command(['docker', *args], env=env).decode().strip()
    found = []
    for role, args in [('container', ['ps', '-aq']), ('network', ['network', 'ls', '-q'])]:
        ids = call(args + ['--filter', 'label=' + LABEL + '=' + run_id]).split()
        for object_id in ids:
            need(re.fullmatch(r'[a-f0-9]{12,64}', object_id), 'assembled_docker_object_id')
            row = json.loads(call((['inspect'] if role == 'container' else ['network', 'inspect']) + [object_id]))[0]
            found.append((role, owned_docker_resource(role, row, run_id, object_id)))
    return found, call


def cleanup(temp, private, app, state):
    stop_child(state)
    data = native_state(temp, private, state)
    if data:
        found, call = docker_objects(private, data['id'])
        if found:
            state['fallbackUsed'] = True
            for role, object_id in sorted(found, key=lambda item: item[0] != 'container'):
                call(['rm', '-f', '-v', object_id] if role == 'container' else ['network', 'rm', object_id])
        remaining, _ = docker_objects(private, data['id'])
        need(not remaining, 'assembled_docker_cleanup_unconfirmed')
    new_browser = [p for p in temp.glob('p09b-*') if p.name not in state['beforeBrowser']]
    for path in new_browser:
        need(not path.is_symlink() and path.parent == temp and path.stat().st_uid == os.getuid()
             and re.fullmatch(r'p09b-[A-Za-z0-9]{6}', path.name), 'assembled_browser_temp_owner')
        marker = json.loads((path / 'owner.json').read_bytes())
        need(UUID.fullmatch(marker['owner']), 'assembled_browser_owner_marker')
        state['fallbackUsed'] = True
        # Reuse the sealed original ownership/process/readonly-closure cleanup.
        code = "import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';const {cleanup}=await import(pathToFileURL(process.argv[1]));await cleanup(JSON.parse(readFileSync(0,'utf8')));"
        command([shutil.which('node'), '--input-type=module', '-e', code, str(app / 'scripts/testing/consultation-tickets/browser.mjs')],
                env=safe_env(private), timeout=30,
                body=json.dumps({'local': str(path), 'tempRoot': str(temp), 'owner': marker['owner'], 'contexts': []}).encode())
    need(not [p for p in temp.glob('p09b-*') if p.name not in state['beforeBrowser']], 'assembled_browser_cleanup_unconfirmed')
    private_json(private / 'state.json', state)
    return data


def verify_native_state(data, private):
    if SELECTED_PROFILE==COMPOSITION:return verify_composition_state(data,private)
    need(data and data['migrations'] == expected_sql(private), 'assembled_applied_sql_not_exact')
    local = Path(data['local'])
    posts = Counter()
    tokens = []
    for path in sorted(local.glob('intent-*.json')):
        need(re.fullmatch(r'intent-[0-9]{3}\.json', path.name), 'assembled_intent_name')
        value = json.loads(path.read_bytes())
        need(value['sha'] == CANDIDATE, 'assembled_intent_source')
        route = value['path']
        if route.startswith('/api/'):
            posts[route] += 1
            body = value['body']
            tokens.append(body.get('client_token', body.get('clientToken')))
    need(posts == Counter({'/api/portfolio/holdings': 1, '/api/personal-finance/cash-flow': 1, '/api/consultation': 1})
         and all(isinstance(token, str) and UUID.fullmatch(token) for token in tokens) and len(set(tokens)) == 3, 'assembled_product_post_or_replay')
    return {'runId': data['id'], 'dockerContainers': 0, 'dockerNetworks': 0, 'browserTemps': 0,
            'fallbackUsed': False, 'sqlFilesVerified': 18, 'financialPosts': 2, 'consentPosts': 1, 'replayedProductPosts': 0}


def write_outcome_unknown(state, raw):
    interrupted = state.get('timedOutOrInterrupted') or state.get('stage') in ('STARTING', 'RUNNING')
    interrupted = interrupted or (isinstance(state.get('exitCode'), int) and state['exitCode'] < 0)
    return bool((state.get('attempted') and interrupted) or b'write_outcome_unknown_stop_no_replay' in raw)


def static_controller_error(error, default):
    value = str(error)
    return value if value in CONTROLLER_FAILURE_CODES else default


def static_native_error(value):
    if not isinstance(value, str):
        return None
    if value in NATIVE_FAILURE_CODES:
        return value
    # Frozen wait() composes a fixed stage with a fixed readiness reason.
    # Project only the literal stage, never the raw composed string.
    stages = ('pf10_native_app_readiness', 'pf10_native_auth_ready', 'pf10_native_rest_ready',
              'pf10_native_database_readiness', 'pf10_native_auth_schema',
              'p03_legacy_page_ready', 'p03_legacy_dom_state', 'p03_legacy_advisor_refresh',
              'p03_legacy_identity_clear', 'p03_legacy_signout_clear',
              'assembled_member_holdings_dom', 'assembled_member_consultation_dom')
    for stage in stages:
        if value.startswith(stage + '_'):
            reason = value[len(stage) + 1:]
            if reason in ('not_ready', 'read_failed') or (reason.startswith('pf10_native_') and reason in NATIVE_FAILURE_CODES):
                return stage
    return None


OBSERVED_STAGES = ('composition-financial-before-write', 'composition-context-binding', 'composition-fixture-apply', 'composition-fixture-binding', 'composition-default-prepare', 'composition-default-page', 'rest-baseline-denial', 'rest-own', 'rest-foreign', 'rest-second-own', 'legacy-open', 'legacy-ready', 'legacy-context', 'legacy-cookies', 'legacy-page', 'legacy-routes', 'legacy-document', 'legacy-section-ready', 'legacy-state-ready', 'legacy-service-label', 'legacy-write-disabled', 'legacy-details-open', 'legacy-source-text', 'legacy-images', 'legacy-body', 'member-context', 'member-cookies', 'member-page', 'member-routes', 'member-dashboard', 'member-holdings-link', 'member-holdings-ready', 'member-holdings-body', 'member-dashboard-link', 'member-consultation-link', 'member-consultation-ready', 'member-viewport', 'member-storage-audit', 'member-context-close')


def project_stage_log(raw):
    result = {'stageReadback': 'MISSING', 'lastObservedStage': None,
              'lastObservedStageEdge': None, 'malformedStageRecords': None}
    if raw is None:
        return result
    if not isinstance(raw, bytes) or len(raw) > 64 * 1024 * 1024:
        result['stageReadback'] = 'UNAVAILABLE_OR_TOO_LARGE'
        return result
    result.update(stageReadback='NO_STAGE_RECORDS', malformedStageRecords=False)
    stack = []
    def unique_object(pairs):
        row = dict(pairs)
        if len(row) != len(pairs):
            raise ValueError('stage_duplicate_key')
        return row
    for line in raw.decode('utf8', errors='replace').splitlines():
        prefix = 'P03_ASSEMBLED_STAGE '
        if not line.startswith(prefix):
            continue
        try:
            if len(line) > 1024:
                raise ValueError('stage_bound')
            row = json.loads(line[len(prefix):], object_pairs_hook=unique_object)
            if (not isinstance(row, dict) or set(row) != {'stage', 'edge'}
                    or row['stage'] not in OBSERVED_STAGES or row['edge'] not in ('before', 'after')):
                raise ValueError('stage_shape')
            if row['edge'] == 'before':
                if len(stack) >= 16:
                    raise ValueError('stage_depth')
                stack.append(row['stage'])
            elif not stack or stack.pop() != row['stage']:
                raise ValueError('stage_order')
        except (ValueError, TypeError):
            result.update(stageReadback='UNVERIFIED_STAGE_RECORD', malformedStageRecords=True,
                          lastObservedStage=None, lastObservedStageEdge=None)
            return result
        result.update(stageReadback='OBSERVED', lastObservedStage=row['stage'], lastObservedStageEdge=row['edge'])
    return result


def project_failure_log(raw):
    result = {'logReadback': 'MISSING', 'observedPassedChecks': None,
              'lastObservedPassedCheck': None, 'nativeFailureCode': None,
              'malformedLogRecords': None, 'duplicatePassRecords': None}
    if raw is None:
        return result
    if not isinstance(raw, bytes) or len(raw) > 64 * 1024 * 1024:
        result['logReadback'] = 'UNAVAILABLE_OR_TOO_LARGE'
        return result
    result.update(logReadback='OBSERVED', observedPassedChecks=[],
                  malformedLogRecords=False, duplicatePassRecords=False)
    reasons = []
    prefixes = ('P03_ASSEMBLED_NATIVE_CHECK ', 'P03_ASSEMBLED_FAILURE ')
    for line in raw.decode('utf8', errors='replace').splitlines():
        prefix = next((p for p in prefixes if line.startswith(p)), None)
        if prefix is None:
            continue
        if len(line) > 65536:
            result['malformedLogRecords'] = True
            continue
        try:
            row = json.loads(line[len(prefix):])
            if not isinstance(row, dict):
                raise ValueError('not_a_record')
        except (ValueError, TypeError):
            result['malformedLogRecords'] = True
            continue
        if prefix == prefixes[0]:
            name = row.get('name')
            if name in OBSERVED_CHECKS and row.get('status') == 'PASS':
                if name in result['observedPassedChecks']:
                    result['duplicatePassRecords'] = True
                else:
                    result['observedPassedChecks'].append(name)
                result['lastObservedPassedCheck'] = name
        else:
            reasons.append(static_native_error(row.get('reason')))
    if len(reasons) == 1:
        result['nativeFailureCode'] = reasons[0]
    elif len(reasons) > 1:
        result['malformedLogRecords'] = True
    return result


def project_attested_counts(data, private):
    result = {'observedSqlAppliedCount': None, 'observedProductPostIntents': None,
              'observedFinancialPostIntents': None, 'observedConsentPostIntents': None,
              'observedOtherProductPostIntents': None}
    if not isinstance(data, dict) or data.get('sha') != CANDIDATE:
        return result
    # Caller obtains data only through native_state(): exact own marker/local path.
    try:
        migrations = data.get('migrations')
        expected = expected_sql(private)
        if isinstance(migrations, list) and len(migrations) <= len(expected) and migrations == expected[:len(migrations)]:
            result['observedSqlAppliedCount'] = len(migrations)
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        local = Path(data['local'])
        need(local.is_dir() and not local.is_symlink(), 'assembled_native_temp_owner')
        # scandir failure is unavailable, not an empty successful glob result.
        with os.scandir(local) as entries:
            intent_paths = sorted(local / entry.name for entry in entries
                                  if entry.name.startswith('intent-') and entry.name.endswith('.json'))
        posts = Counter()
        for path in intent_paths:
            need(re.fullmatch(r'intent-[0-9]{3}\.json', path.name), 'assembled_intent_name')
            owned(path)
            value = json.loads(path.read_bytes())
            need(isinstance(value, dict) and set(value) == {'sha', 'path', 'body'}
                 and value['sha'] == CANDIDATE and isinstance(value['path'], str)
                 and value['path'].startswith('/'), 'assembled_intent_source')
            # Intents prove attempted POSTs, never committed financial effects.
            if value['path'].startswith('/api/'):
                posts[value['path']] += 1
        financial = posts['/api/portfolio/holdings'] + posts['/api/personal-finance/cash-flow']
        consent = posts['/api/consultation']
        total = sum(posts.values())
        result.update(observedProductPostIntents=total, observedFinancialPostIntents=financial,
                      observedConsentPostIntents=consent, observedOtherProductPostIntents=total - financial - consent)
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return result


def project_default_prepare_status(data, observation):
    # Failure-only local response observation, never proof of a committed write.
    # Exact ordinal12: attested initial8 Auth POSTs +3 product POSTs +negative prepare.
    if (SELECTED_PROFILE != COMPOSITION or not isinstance(data, dict)
            or data.get('sha') != CANDIDATE or not isinstance(observation, dict)
            or observation.get('stageReadback') != 'OBSERVED'
            or observation.get('malformedStageRecords') is not False
            or observation.get('lastObservedStage') != 'composition-default-prepare'
            or observation.get('lastObservedStageEdge') != 'before'):
        return None
    try:
        local = Path(data['local'])
        binding, _ = composition_read(local, 'composition-binding.json')
        admission, _ = composition_read(local, 'composition-intent-004.json')
        if (not isinstance(binding, dict) or binding.get('schema') != 'p03-composition-binding.v1'
                or binding.get('appSha') != CANDIDATE or binding.get('appTree') != COMPOSITION_SPEC['tree']
                or binding.get('runId') != data.get('id') or binding.get('databaseMarker') != data.get('id')
                or binding.get('local') != str(local) or binding.get('profile') != 'consultation-ticket'
                or not isinstance(binding.get('transportInitial'), dict)
                or type(binding['transportInitial'].get('authorizedPostRequests')) is not int
                or binding['transportInitial']['authorizedPostRequests'] != 8
                or binding['transportInitial'].get('poisoned') is not False
                or not isinstance(admission, dict)
                or set(admission) != {'kind','ordinal','actor','path','body','bodySha256','token'}
                or admission['kind'] != 'intent' or type(admission['ordinal']) is not int
                or admission['ordinal'] != 4 or admission['actor'] != 'a'
                or admission['path'] != '/api/consultation/ticket-attempts'
                or not isinstance(admission['body'], str)
                or sha(admission['body'].encode()) != admission['bodySha256']):
            return None
        admitted_body = composition_json(admission['body'].encode())
        intent, _ = composition_read(local, 'intent-012.json')
        result, _ = composition_read(local, 'transport-result-012.json')
        route = '/api/consultation/ticket-attempts'
        if (not isinstance(intent, dict) or set(intent) != {'sha', 'path', 'body'}
                or intent['sha'] != CANDIDATE or intent['path'] != route
                or json.dumps(intent['body'],sort_keys=True,ensure_ascii=False) != json.dumps(admitted_body,sort_keys=True,ensure_ascii=False)
                or not isinstance(admitted_body, dict) or admitted_body.get('clientToken') != admission['token']
                or not isinstance(binding.get('authCreatedIds'), list)
                or admitted_body.get('expectedActorId') not in binding['authCreatedIds']
                or not isinstance(intent['body'], dict)
                or intent['body'].get('contractVersion') != 'consultation-ticket-request.v1'
                or not isinstance(intent['body'].get('command'), dict)
                or intent['body']['command'].get('kind') != 'open'
                or not isinstance(result, dict) or set(result) != {'ordinal', 'path', 'status', 'sha'}
                or type(result['ordinal']) is not int or result['ordinal'] != 12
                or result['sha'] != CANDIDATE or result['path'] != route
                or type(result['status']) is not int or not 100 <= result['status'] <= 599):
            return None
        return result['status']
    except (OSError, ValueError, KeyError, TypeError):
        return None


def failure_observation(state, temp, private):
    # This path runs even if cleanup raised. It has no cleanup/account/network
    # operations, and cannot change acceptance or replay an operation.
    raw = None
    try:
        path = private / 'native.log'
        if path.exists():
            owned(path)
            raw = path.read_bytes()
    except (OSError, ValueError):
        pass
    result = project_failure_log(raw)
    code = state.get('exitCode')
    code = code if type(code) is int and -255 <= code <= 255 else None
    timed_out = state.get('timedOutOrInterrupted')
    if type(timed_out) is not bool:
        timed_out = False if ('timedOutOrInterrupted' not in state and state.get('stage') == 'EXECUTED'
                              and code is not None and code >= 0) else None
    fallback = state.get('fallbackUsed')
    result.update(actualExitCode=code, timedOutOrInterrupted=timed_out,
                  fallbackUsed=fallback if type(fallback) is bool else None)
    try:
        data = native_state(temp, private, state)
    except (OSError, ValueError, KeyError, TypeError):
        data = None
    result.update(project_attested_counts(data, private))
    result.update(project_stage_log(raw))
    result['observedDefaultPrepareHttpStatus'] = project_default_prepare_status(data, result)
    result['chromePreflight'] = project_chrome_observation(state.get('chromePreflight'))
    return result, raw


def finalize():
    binding = actual_context()
    workspace, temp, private, app = paths()
    state = load_state(binding, private)
    public = workspace / 'assembled-native-artifact'
    public.mkdir(exist_ok=True)
    need(not public.is_symlink(), 'assembled_artifact_location')
    report_path = public / 'receipt.json'
    expected_status='PASS_BOUNDED_P03_COMPOSITION_NATIVE' if SELECTED_PROFILE==COMPOSITION else 'PASS_BOUNDED_ASSEMBLED_NATIVE'
    if report_path.exists():
        previous = json.loads(report_path.read_bytes())
        need(previous.get('binding') == binding, 'assembled_existing_receipt_binding')
        need(previous.get('status') == expected_status, 'assembled_existing_failure_no_replay')
        return previous['status']
    report = {'schemaVersion': 'assembled-native-ci.v1', 'status': 'FAIL_NATIVE_NOT_ACCEPTED', 'binding': binding,
              'source': {'commit': CANDIDATE, 'tree': TREE, 'capsuleSha256': CAPSULE, 'driverContractSha256': DRIVER},
              'nativeAttempted': state['attempted'], 'targetInstall': 'NOT_APPLIED', 'arashAcceptance': 'UNOBSERVED',
              'privateArtifactsUploaded': False, 'automaticReplay': False}
    if SELECTED_PROFILE==COMPOSITION:report['schemaVersion']='p03-composition-native-ci.v1'
    try:
        data = cleanup(temp, private, app, state)
        report['ownedCleanupReadback'] = 'CONFIRMED'
        need(state.get('exitCode') == 0 and not state.get('timedOutOrInterrupted') and not state['fallbackUsed'], 'assembled_native_not_confirmed')
        independent = verify_native_state(data, private)
        raw = (private / 'native.log').read_bytes()
        need(len(raw) <= 64 * 1024 * 1024, 'assembled_native_log_bound')
        payload = {'log': raw.decode('utf8'), 'binding': binding, 'tempRoot': str(temp), 'independent': independent}
        if SELECTED_PROFILE==COMPOSITION:
            need(0<=time.monotonic()-state['compositionStartedMonotonic']<=25*60,'assembled_composition_invalid')
            safe=project_composition(raw,independent,binding)
        else:
            result = command([shutil.which('node'), str(HERE / 'receipt.mjs'), str(app)], env=safe_env(private),
                             body=json.dumps(payload).encode(), timeout=30)
            safe = json.loads(result)
        need(safe.get('status') == expected_status, 'assembled_sanitized_receipt_required')
        report.update(safe)
        report['privateLogSha256'] = sha(raw)
    except Exception as error:
        report['failureCode'] = static_controller_error(error, 'assembled_finalization_failed')
        report.setdefault('ownedCleanupReadback', 'UNCONFIRMED')
        diagnostics, raw = failure_observation(state, temp, private)
        report['failureDiagnostics'] = diagnostics
        report['privateLogSha256'] = sha(raw) if raw is not None else None
        report['writeOutcomeUnknown'] = (True if write_outcome_unknown(state,raw or b'') else None) if SELECTED_PROFILE==COMPOSITION else write_outcome_unknown(state,raw or b'')
    # Only this freshly constructed projection is eligible for upload, never logs.
    private_json(report_path, report, True)
    state['stage'] = 'FINALIZED'
    private_json(private / 'state.json', state)
    need(report['status'] == expected_status, 'assembled_native_not_accepted_see_receipt')
    return report['status']


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'execute', 'finalize', 'observe-runner'])
    args = parser.parse_args()
    try:
        if args.action == 'observe-runner':
            print(json.dumps(runner_observation(), sort_keys=True))
        else:
            print(json.dumps({'status': {'prepare': prepare, 'execute': execute, 'finalize': finalize}[args.action]()}))
    except Exception as error:
        if args.action == 'observe-runner':
            print(json.dumps({'status': 'FAIL_RUNNER_OBSERVATION', 'failureCode': 'runner_observation_unavailable',
                              'nativeAttempted': False, 'automaticReplay': False}))
            sys.exit(1)
        reason = static_controller_error(error, 'assembled_operation_failed')
        if args.action == 'prepare' and reason == 'assembled_existing_chrome_pin_required':
            try:
                capture_chrome_prepare_failure()
            except Exception:
                pass  # Preserve the original failure; never emit raw observation errors.
        print(json.dumps({'status': 'FAIL_NATIVE_NOT_ACCEPTED', 'reason': reason, 'automaticReplay': False}))
        sys.exit(1)
