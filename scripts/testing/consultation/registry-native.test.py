"""Pure input and transaction-boundary tests. No runtime writes or connections."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('registry', Path(__file__).with_name('registry-native.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RegistryTests(unittest.TestCase):
    def request(self, real=False):
        value = {'action': 'bindReal' if real else 'seedSynthetic',
                 'expectedIds': {role: '00000000-0000-4000-8000-' + str(i).zfill(12) for i, role in enumerate(m.ROLES, 1)}}
        if real:
            value['expectedOwnerEmail'] = 'controlled-owner@example.test'
        return value

    def test_four_exact_actors_and_private_real_input(self):
        self.assertEqual(m.validate(self.request()), self.request())
        self.assertEqual(m.validate(self.request(True)), self.request(True))
        for change in [{'action': 'anything'}, {'extra': 'not allowed'}, {'expectedIds': {'owner': 'bad'}}]:
            with self.assertRaises(ValueError):
                m.validate({**self.request(), **change})

    def test_ambiguous_ids_and_delimiter_injection_fail(self):
        p = self.request()
        p['expectedIds']['a'] = p['expectedIds']['owner']
        with self.assertRaises(ValueError):
            m.validate(p)
        for email in ['a@example.invalid', 'a$registry$@example.test', 'a\nb@example.test']:
            p = self.request(True)
            p['expectedOwnerEmail'] = email
            with self.assertRaises(ValueError):
                m.validate(p)

    def test_atomic_registry_only_mutations_and_retirement_gate(self):
        sql = m.transaction(m.validate(self.request(True)))
        self.assertTrue(sql.startswith('BEGIN;'))
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))
        self.assertIn('LOCK TABLE public.consultation_advisors', sql)
        self.assertIn('email_confirmed_at IS NOT NULL', sql)
        self.assertIn("pr.role='admin'", sql)
        self.assertIn('synthetic admin not retired', sql)
        self.assertIn('auth.sessions', sql)
        self.assertIn('auth.refresh_tokens', sql)
        self.assertNotIn('member_holding', sql)
        self.assertNotIn('member_goals', sql)
        self.assertNotIn('member_cash_flow', sql)
        self.assertNotIn('DELETE ', sql)

    def test_private_email_sql_literal_quoted(self):
        p = self.request(True)
        p['expectedOwnerEmail'] = "o'brien@example.test"
        sql = m.transaction(m.validate(p))
        self.assertIn("o''brien@example.test", sql)


if __name__ == '__main__':
    unittest.main()
