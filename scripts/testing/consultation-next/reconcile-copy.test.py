"""No Docker or remote access: reject unobserved changes before corrective SQL."""
import ast
import importlib.util
from pathlib import Path
import re
import unittest

spec = importlib.util.spec_from_file_location('reconcile', Path(__file__).with_name('reconcile-copy.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
root = Path(__file__).resolve().parents[3]
tree = ast.parse((root / 'docs/ops/recovery-01/p01-scripts/liara-native-backup-restore.py').read_text())
scope = {'re': re}
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'bounded_acl_plan')
exec(compile(ast.Module(body=[node], type_ignores=[]), '<pure-reviewed-plan>', 'exec'), scope)


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.src, self.dst = set(), set()
        for suffix in m.TABLES:
            prefix = 'table|public.consultation_' + suffix + '|r;owner=postgres;rls=t;forced=t;acl='
            self.src.add(prefix + '{postgres=arwdDxtm/postgres}')
            self.dst.add(prefix + '-')

    def test_exact_pairs_one_transaction(self):
        sql, names = m.plan(self.src, self.dst, scope['bounded_acl_plan'])
        self.assertEqual(len(names), 9)
        self.assertEqual(sql.count('BEGIN;'), 1)
        self.assertEqual(sql.count('COMMIT;'), 1)
        self.assertNotIn('DROP', sql)

    def test_changed_rls_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(self.src, {x.replace('rls=t', 'rls=f') for x in self.dst}, scope['bounded_acl_plan'])

    def test_unknown_source_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(self.src | {'unknown'}, self.dst, scope['bounded_acl_plan'])

    def test_extra_target_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(self.src, self.dst | {'unknown'}, scope['bounded_acl_plan'])

    def test_missing_pair_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(self.src, set(), scope['bounded_acl_plan'])


if __name__ == '__main__':
    unittest.main()
