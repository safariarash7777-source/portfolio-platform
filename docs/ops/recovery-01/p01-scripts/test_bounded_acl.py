import ast
import copy
from pathlib import Path
import re
import unittest

# Extract only pure definitions from actual generated candidate. Never import
# operational module: its top level creates directories and runs Docker.
tree = ast.parse(Path(__file__).with_name('liara-native-backup-restore.py').read_text())
namespace = {'re': re}
pure = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in
        ('normalize_inventory', 'bounded_acl_plan', 'attest_acl_target')]
exec(compile(ast.Module(body=pure, type_ignores=[]), '<candidate-pure>', 'exec'), namespace)
plan, normalize, attest = [namespace[n] for n in ('bounded_acl_plan', 'normalize_inventory', 'attest_acl_target')]

def fixtures():
    source, target = [], []
    for name in ('admin_desk_preference_versions_revision_seq', 'ime_certificate_history_id_seq',
                 'ime_physical_trades_id_seq', 'media_layout_versions_version_seq'):
        prefix = 'table|public.'+name+'|S;owner=postgres;rls=f;forced=f;acl='
        service = ',service_role=U/postgres' if name.startswith('ime_') else ''
        source.append(prefix+'{postgres=rwU/postgres'+service+'}')
        target.append(prefix+'{postgres=rwU/postgres,service_role=rwU/postgres,authenticated=rwU/postgres,anon=rwU/postgres}')
    prefix = 'table|public.media_layout_versions|r;owner=postgres;rls=t;forced=t;acl='
    source.append(prefix+'{postgres=arwdDxtm/postgres}')
    target.append(prefix+'-')
    source.append('schema|cash_flow_private|postgres;{postgres=UC/postgres}')
    target.append('schema|cash_flow_private|postgres;-')
    return normalize('\n'.join(source)), normalize('\n'.join(target))

class CorrectionTests(unittest.TestCase):
    def test_all_inventory_schema_predicates_cover_financial_private_schemas(self):
        # Literal extraction is offline: never import this operational module.
        inventory = next(ast.literal_eval(n.value) for n in tree.body
                         if isinstance(n, ast.Assign)
                         and any(isinstance(t, ast.Name) and t.id == 'INVENTORY' for t in n.targets))
        predicates = re.findall(r'\b(?:n\.)?(?:nspname|schemaname)\s+IN\s*\(([^)]+)\)', inventory)
        self.assertEqual(len(predicates), 11, 'Review every inventory selector when adding a new one')
        expected = {'public', 'auth', 'storage', 'identity_private', 'cash_flow_private', 'goals_private'}
        for predicate in predicates:
            names = re.findall(r"'([^']+)'", predicate)
            self.assertEqual(set(names), expected)
            self.assertEqual(len(names), len(expected))
    def test_exact_six_discrepancies(self):
        src, dst = fixtures()
        sql, names = plan(src, dst)
        self.assertEqual(len(names), 6)
        self.assertEqual(sql.count('REVOKE ALL ON SEQUENCE'), 4)
        self.assertEqual(sql.count('GRANT USAGE ON SEQUENCE'), 2)
        self.assertIn('GRANT ALL ON TABLE public.media_layout_versions TO postgres;', sql)
        self.assertIn('GRANT USAGE,CREATE ON SCHEMA cash_flow_private TO postgres;', sql)
        self.assertTrue(sql.startswith('BEGIN;') and sql.endswith('COMMIT;'))
    def test_equal_inventory_is_noop(self):
        src, _ = fixtures()
        self.assertEqual(plan(src, src), ('', []))
    def test_all_64_subsets_of_known_pairs(self):
        src, dst = fixtures()
        target_by_id = {s.split('|')[1]: s for s in dst}
        for mask in range(64):
            selected = {target_by_id[line.split('|')[1]] if mask & (1 << i) else line
                        for i, line in enumerate(sorted(src))}
            _, names = plan(src, selected)
            self.assertEqual(len(names), mask.bit_count())
    def test_schema_pair_is_exact_not_general_schema_acl_repair(self):
        src, dst = fixtures()
        source_row = 'schema|cash_flow_private|postgres;{postgres=UC/postgres}'
        target_row = 'schema|cash_flow_private|postgres;-'
        for changed in [source_row.replace('cash_flow_private', 'goals_private'),
                        source_row.replace('UC/postgres', 'U/postgres'),
                        source_row.replace('UC/postgres', 'UC*/postgres'),
                        source_row.replace('UC/postgres}', 'UC/postgres,authenticated=U/postgres}'),
                        source_row.replace('|postgres;', '|anon;')]:
            with self.subTest(source=changed):
                with self.assertRaises(RuntimeError): plan(src - {source_row} | {changed}, dst)
        for changed in [target_row.replace('cash_flow_private', 'goals_private'),
                        'schema|cash_flow_private|postgres;{anon=UC/postgres}',
                        target_row.replace('|postgres;', '|anon;')]:
            with self.subTest(target=changed):
                with self.assertRaises(RuntimeError): plan(src, dst - {target_row} | {changed})
    def test_permission_grantor_owner_rls_and_extra_drift_rejected(self):
        src, dst = fixtures()
        for before, after in [('rwU/postgres','rwU*/postgres'), ('/postgres','/supabase_admin'),
                              ('owner=postgres','owner=anon'), ('rls=t','rls=f'),
                              ('forced=t','forced=f'), ('service_role=rwU','service_role=U')]:
            with self.subTest(before=before):
                changed = {line.replace(before, after) for line in dst}
                with self.assertRaises(RuntimeError): plan(src, changed)
    def test_source_intent_change_rejected(self):
        src, dst = fixtures()
        with self.assertRaises(RuntimeError): plan({s.replace('service_role=U','service_role=rwU') for s in src}, dst)
    def test_unrelated_row_count_change_rejected(self):
        src, dst = fixtures()
        with self.assertRaises(RuntimeError): plan(src|{'rowcount|auth.users|2'}, dst|{'rowcount|auth.users|3'})
    def test_missing_added_object_rejected(self):
        src, dst = fixtures()
        with self.assertRaises(RuntimeError): plan(src, dst|{'table|public.unknown|r;acl=-'})
        with self.assertRaises(RuntimeError): plan(src, set())
    def test_privilege_order_is_not_erased(self):
        src, dst = fixtures()
        with self.assertRaises(RuntimeError): plan({s.replace('rwU', 'Uwr') for s in src}, dst)
    def test_quote_normalization_fails_closed(self):
        with self.assertRaises(RuntimeError): normalize('table|x|acl={"role,a"=r/postgres}')
    def test_isolation_identity_guards(self):
        target = 'portfolio-recovery-proof-20261023t123955z'
        state = {'Name': '/'+target, 'Image':'pinned', 'State':{'Running':True},
                 'HostConfig':{'NetworkMode':'none','PortBindings':{}},
                 'Config':{'Labels':{'portfolio.recovery':'isolated-proof'}},
                 'Mounts':[{'Destination':'/recovery','Source':'/private/root','RW':False,'Type':'bind'}]}
        attest(state, 'source', target, 'pinned', '/private/root')
        cases = [('Name','/source'), ('Image','other'), ('State',{'Running':False}),
                 ('HostConfig', {'NetworkMode':'bridge'}),
                 ('HostConfig', {'NetworkMode':'none','PortBindings':{'5432/tcp':[{}]}}),
                 ('Config', {}), ('Mounts', [])]
        for key, value in cases:
            altered=copy.deepcopy(state); altered[key]=value
            with self.subTest(key=key):
                with self.assertRaises(RuntimeError): attest(altered, 'source', target, 'pinned', '/private/root')
        with self.assertRaises(RuntimeError): attest(state, target, target, 'pinned', '/private/root')

if __name__ == '__main__': unittest.main(verbosity=2)
