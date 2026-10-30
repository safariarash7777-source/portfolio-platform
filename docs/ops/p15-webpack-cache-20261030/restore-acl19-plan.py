"""Exact observed ACL repair plan for the owned 20261030T215307Z copy.

Reuses the pinned helper's seven-pair planner; never mutates a database here.
All other inventory, roles, definitions, RLS, grants and private metadata remain
part of the strict comparison. No primary target or arbitrary names are inputs.
"""
import copy
import re

CONSULTATION_TABLES = (
    'consultation_actions', 'consultation_advisors', 'consultation_command_receipts',
    'consultation_events', 'consultation_private_notes', 'consultation_publications',
    'consultation_relationships', 'consultation_revocations', 'consultation_sessions',
)
OLD_SEVEN = {
    'public.admin_desk_preference_versions_revision_seq',
    'public.ime_certificate_history_id_seq', 'public.ime_physical_trades_id_seq',
    'public.media_layout_versions_version_seq', 'public.media_layout_versions',
    'cash_flow_private', 'goals_private',
}


def live_source_catalog_check(snapshot, current):
    """Target still matches ALL snapshot rows; live-source append counts may grow.

    Only two independently observed append counters are permitted to increase.
    Every other inventory line, including identities and permissions, must match.
    This is not used in the target-versus-snapshot restoration comparison.
    """
    left, right = set(snapshot), set(current)
    drift = []
    for name in ('public.ir_market_history', 'public.site_agent_runs'):
        prefix = 'rowcount|' + name + '|'
        old = [x for x in left if x.startswith(prefix)]
        new = [x for x in right if x.startswith(prefix)]
        if len(old) != 1 or len(new) != 1:
            raise RuntimeError('live_counter_missing_or_duplicated')
        a, b = old[0][len(prefix):], new[0][len(prefix):]
        if not re.fullmatch(r'[0-9]+', a) or not re.fullmatch(r'[0-9]+', b) or int(b) < int(a):
            raise RuntimeError('live_counter_not_append_only')
        left.remove(old[0]); right.remove(new[0])
        if a != b:
            drift.append({'table': name, 'snapshotRows': int(a), 'currentRows': int(b)})
    if left != right:
        raise RuntimeError('unreviewed_live_source_inventory_drift')
    return drift


def observed_plan(base_plan, source, target, private_source, private_target):
    pairs = {}
    for name in CONSULTATION_TABLES:
        prefix = 'table|public.' + name + '|r;owner=postgres;rls=t;forced=t;acl='
        pairs[prefix + '{postgres=arwdDxtm/postgres}'] = (
            prefix + '-', 'GRANT ALL ON TABLE public.' + name + ' TO postgres;', 'public.' + name)
    name = 'public.consultation_events_event_no_seq'
    prefix = 'table|' + name + '|S;owner=postgres;rls=f;forced=f;acl='
    pairs[prefix + '{postgres=rwU/postgres}'] = (
        prefix + '{anon=rwU/postgres,authenticated=rwU/postgres,postgres=rwU/postgres,service_role=rwU/postgres}',
        'REVOKE ALL ON SEQUENCE ' + name + ' FROM anon,authenticated,service_role;', name)
    only_source, only_target = source - target, target - source
    if len(only_source) != 17 or len(only_target) != 17:
        raise RuntimeError('unexpected_core_difference_count')
    if not set(pairs) <= only_source or not {p[0] for p in pairs.values()} <= only_target:
        raise RuntimeError('unreviewed_consultation_acl_pair')
    old_sql, old_names = base_plan(source - set(pairs), target - {p[0] for p in pairs.values()})
    if set(old_names) != OLD_SEVEN or not old_sql.endswith('COMMIT;'):
        raise RuntimeError('old_seven_pair_plan_changed')

    adjusted = copy.deepcopy(private_target)
    expected = {s['name']: s for s in private_source['schemas']}
    found = {s['name']: s for s in adjusted['schemas']}
    for schema in ('consultation_private', 'portfolio_private'):
        if (schema not in found or schema not in expected
                or expected[schema]['owner'] != 'postgres'
                or expected[schema]['acl'] != ['postgres=UC/postgres']
                or found[schema]['acl'] is not None):
            raise RuntimeError('unreviewed_private_schema_acl_pair')
        found[schema]['acl'] = ['postgres=UC/postgres']
    if adjusted != private_source:
        raise RuntimeError('other_private_inventory_difference')
    additions = [pairs[line][1] for line in sorted(pairs)]
    additions += ['GRANT USAGE,CREATE ON SCHEMA ' + s + ' TO postgres;'
                  for s in ('consultation_private', 'portfolio_private')]
    sql = old_sql[:-len('COMMIT;')] + '\n'.join(additions) + '\nCOMMIT;'
    names = old_names + [pairs[line][2] for line in sorted(pairs)] + ['consultation_private', 'portfolio_private']
    if len(names) != 19 or len(set(names)) != 19:
        raise RuntimeError('unexpected_correction_object_count')
    return sql, names
