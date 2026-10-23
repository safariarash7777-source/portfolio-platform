"""Pure helper scope tests; no subprocess, HTTP, database, or credential access."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.remote = load("native-member-remote")
        self.local = load("native-member")
        self.cfg = dict(marker="consultation-20261024-a", origin=self.remote.ORIGIN,
                        backend=self.remote.BACKEND, dbContainer=self.remote.DB,
                        authAdminBase=self.remote.ADMIN)

    def test_exact_four_markers_and_private_ignored_root(self):
        self.assertEqual(self.remote.ALLOWED_MARKERS, self.local.ALLOWED_MARKERS)
        self.assertEqual(len(self.local.ALLOWED_MARKERS), 4)
        self.assertIn(".local-goals-members", self.local.PRIVATE.parts)
        self.assertTrue((self.local.ROOT / "package.json").is_file())

    def test_unknown_markers_and_destinations_fail_before_io(self):
        for override in ({"marker": "real-member"}, {"backend": "https://example.com"},
                         {"origin": "https://example.com"}, {"dbContainer": "other"}):
            with patch.object(self.remote, "command", side_effect=AssertionError("IO forbidden")):
                with self.assertRaises(ValueError):
                    self.remote.execute({"config": {**self.cfg, **override}, "action": "preflight"})

    def test_retired_account_session_fails_before_login(self):
        uid = "00000000-0000-4000-8000-000000000001"
        with patch.object(self.remote, "owned", return_value=[dict(id=uid, role="user", banned=True)]), \
             patch.object(self.remote, "keys", side_effect=AssertionError("secret read forbidden")):
            with self.assertRaisesRegex(ValueError, "retired_account_cannot_be_reopened"):
                self.remote.execute({"config": self.cfg, "action": "session", "id": uid})

    def test_member_marker_cannot_accept_promoted_admin(self):
        uid = "00000000-0000-4000-8000-000000000001"
        with patch.object(self.remote, "owned", return_value=[dict(id=uid, role="admin", banned=False)]):
            with self.assertRaisesRegex(ValueError, "controlled_member_missing"):
                self.remote.execute({"config": self.cfg, "action": "session", "id": uid})

    def test_consultation_history_only_exact_synthetic_relations(self):
        uid = "00000000-0000-4000-8000-000000000001"
        queries = []
        with patch.object(self.remote, "database", side_effect=lambda query: queries.append(query) or {}):
            self.remote.ledger(uid)
        self.assertEqual(len(queries), 2)
        query = queries[1]
        self.assertIn("r.client_id IN (SELECT id FROM synthetic) AND r.advisor_id IN (SELECT id FROM synthetic)", query)
        self.assertIn("lower(email)", query)
        for name in ("Relationships", "Sessions", "Events", "Actions", "Publications", "Revocations", "PrivateNotes", "Receipts"):
            self.assertIn("consultation" + name, query)
        for marker in self.remote.ALLOWED_MARKERS:
            self.assertIn(marker, query)

    def test_provision_needs_exact_coordinator_gate(self):
        with patch.object(self.remote, "owned", side_effect=AssertionError("IO forbidden")):
            with self.assertRaisesRegex(ValueError, "provision_not_coordinated"):
                self.remote.execute({"config": self.cfg, "action": "provision"})


if __name__ == "__main__":
    unittest.main()
