"""Pure helper scope tests; no subprocess, HTTP, database, or credential access."""
import importlib.util
import contextlib
import io
import json
import pathlib
import tempfile
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

    def reader_cfg(self):
        run_id = "11111111-1111-4111-8111-111111111111"
        return {**self.cfg, "qaRunId": run_id, "qaPurpose": "consultation-reader",
                "marker": "consultation-reader-" + run_id.replace("-", "") + "-a"}

    def test_fresh_scope_has_exactly_two_ordinary_members_and_no_legacy_overlap(self):
        cfg = self.reader_cfg()
        local = self.local.markers_for_config(cfg)
        self.assertEqual(local, self.remote.markers_for_config(cfg))
        self.assertEqual(len(local), 2)
        self.assertFalse(local & self.remote.ALLOWED_MARKERS)
        self.assertTrue(all(marker.endswith(("-a", "-b")) for marker in local))
        for override in ({"qaRunId": "../escape"}, {"qaRunId": "bad"}, {"qaPurpose": "owner"},
                         {"qaRunId": None}, {"qaRunId": 12}):
            for module in (self.local, self.remote):
                with self.assertRaises(ValueError):
                    module.markers_for_config({**cfg, **override})

    def test_wrong_run_legacy_marker_and_admin_suffix_rejected_before_io(self):
        cfg = self.reader_cfg()
        for marker in (self.cfg["marker"], cfg["marker"][:-1] + "admin", cfg["marker"].replace("1111", "2222")):
            with patch.object(self.remote, "owned", side_effect=AssertionError("IO forbidden")):
                with self.assertRaisesRegex(ValueError, "consultation_marker_not_approved"):
                    self.remote.execute({"config": {**cfg, "marker": marker}, "action": "reconcile-provision"})

    def test_new_provision_cannot_silently_adopt_existing_or_promote_it(self):
        cfg = self.reader_cfg()
        cfg.update(soleWriter=True, writeApprovalMarker=cfg["marker"])
        with patch.object(self.remote, "owned", return_value=[dict(id="existing", role="user", banned=False)]), \
             patch.object(self.remote, "admin", side_effect=AssertionError("write forbidden")):
            with self.assertRaisesRegex(ValueError, "existing_account_requires_reconciliation"):
                self.remote.execute({"config": cfg, "action": "provision"})

    def test_remote_reconciliation_is_readonly_and_never_authorizes_retry(self):
        cfg = self.reader_cfg()
        uid = "00000000-0000-4000-8000-000000000001"
        for rows, state in (([], "absent"), ([dict(id=uid, role="user", banned=False)], "confirmed")):
            with patch.object(self.remote, "owned", return_value=rows), \
                 patch.object(self.remote, "admin", side_effect=AssertionError("write forbidden")), \
                 patch.object(self.remote, "keys", side_effect=AssertionError("credential read forbidden")):
                result = self.remote.execute({"config": cfg, "action": "reconcile-provision"})
                self.assertEqual(result["state"], state)
                self.assertIs(result["writes"], False)
                self.assertIs(result["retryAllowed"], False)
        for row in (dict(id=uid, role="admin", banned=False), dict(id=uid, role="user", banned=True)):
            with patch.object(self.remote, "owned", return_value=[row]):
                with self.assertRaisesRegex(ValueError, "native_profile_not_active_member"):
                    self.remote.execute({"config": cfg, "action": "reconcile-provision"})

    def test_new_ledger_scope_excludes_legacy_and_other_runs(self):
        cfg = self.reader_cfg()
        with patch.object(self.remote, "owned", return_value=[]):
            self.remote.execute({"config": cfg, "action": "reconcile-provision"})
        queries = []
        with patch.object(self.remote, "database", side_effect=lambda q: queries.append(q) or {}):
            self.remote.ledger("00000000-0000-4000-8000-000000000001")
        for marker in self.remote.markers_for_config(cfg):
            self.assertIn(marker, queries[1])
        for marker in self.remote.ALLOWED_MARKERS:
            self.assertNotIn(marker, queries[1])

    def test_unknown_create_keeps_intent_and_reconciles_without_repeating_create(self):
        cfg = self.reader_cfg()
        cfg.update(soleWriter=True, writeApprovalMarker=cfg["marker"], sshTarget="root@62.60.191.24")
        uid = "00000000-0000-4000-8000-000000000001"
        calls = []
        def remote(_cfg, action, **_payload):
            calls.append(action)
            if action == "preflight": return {"controlledCount": 0}
            if action == "provision": raise ConnectionError("unknown")
            if action == "reconcile-provision": return {"state": "confirmed", "id": uid, "writes": False, "retryAllowed": False}
            raise AssertionError("unexpected remote action")
        with tempfile.TemporaryDirectory() as directory, patch.object(self.local, "ROOT", pathlib.Path(directory)):
            config = pathlib.Path(directory) / "config.json"
            config.write_text(json.dumps(cfg), encoding="utf-8")
            def private_directory(): self.local.PRIVATE.mkdir(parents=True, exist_ok=True)
            with patch.object(self.local, "private_directory", side_effect=private_directory), \
                 patch.object(self.local, "remote", side_effect=remote), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(ConnectionError): self.local.run("provision", config)
                intent = self.local.PRIVATE / "provision-intent.json"
                original = intent.read_bytes()
                with self.assertRaisesRegex(ValueError, "prior_attempt_requires_readback"):
                    self.local.run("provision", config)
                self.local.run("reconcile-provision", config)
                self.assertEqual(json.loads(self.local.STATE.read_text())["id"], uid)
                self.assertEqual(intent.read_bytes(), original)
                self.assertEqual(calls, ["preflight", "provision", "reconcile-provision"])
                with self.assertRaisesRegex(ValueError, "prior_attempt_requires_readback"):
                    self.local.run("provision", config)
                self.assertFalse((self.local.PRIVATE / "worker.lock").exists())

    def test_existing_lock_and_prior_session_intent_block_before_remote_io(self):
        cfg = self.reader_cfg()
        cfg.update(sshTarget="root@62.60.191.24")
        with tempfile.TemporaryDirectory() as directory, patch.object(self.local, "ROOT", pathlib.Path(directory)):
            config = pathlib.Path(directory) / "config.json"
            config.write_text(json.dumps(cfg), encoding="utf-8")
            self.local.config_at(config)
            self.local.PRIVATE.mkdir(parents=True)
            self.local.STATE.write_text(json.dumps({"marker": cfg["marker"], "id": "00000000-0000-4000-8000-000000000001", "password": "synthetic"}), encoding="utf-8")
            lock = self.local.PRIVATE / "worker.lock"
            lock.write_text("preserve", encoding="utf-8")
            with patch.object(self.local, "private_directory"), patch.object(self.local, "remote", side_effect=AssertionError("IO forbidden")):
                with self.assertRaisesRegex(ValueError, "acceptance_lock_requires_review"):
                    self.local.run("session", config)
                self.assertEqual(lock.read_text(), "preserve")
                lock.unlink()  # Test-owned fixture only, never an operational reclaim.
                (self.local.PRIVATE / "session-intent.json").write_text("preserve", encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "prior_attempt_requires_readback"):
                    self.local.run("session", config)
                self.assertEqual((self.local.PRIVATE / "session-intent.json").read_text(), "preserve")

    def test_absent_reconciliation_does_not_remove_the_create_intent(self):
        cfg = self.reader_cfg()
        cfg.update(sshTarget="root@62.60.191.24", soleWriter=True, writeApprovalMarker=cfg["marker"])
        with tempfile.TemporaryDirectory() as directory, patch.object(self.local, "ROOT", pathlib.Path(directory)):
            config = pathlib.Path(directory) / "config.json"
            config.write_text(json.dumps(cfg), encoding="utf-8")
            self.local.config_at(config)
            self.local.PRIVATE.mkdir(parents=True)
            self.local.STATE.write_text(json.dumps({"marker": cfg["marker"], "password": "synthetic"}), encoding="utf-8")
            self.local.record_attempt(cfg, "provision")
            intent = self.local.PRIVATE / "provision-intent.json"
            before = intent.read_bytes()
            with patch.object(self.local, "private_directory"), \
                 patch.object(self.local, "remote", return_value={"state": "absent", "writes": False, "retryAllowed": False}) as remote, \
                 contextlib.redirect_stdout(io.StringIO()):
                self.local.run("reconcile-provision", config)
                self.assertEqual(remote.call_args.args[1], "reconcile-provision")
                with self.assertRaisesRegex(ValueError, "prior_attempt_requires_readback"):
                    self.local.run("provision", config)
                self.assertEqual(remote.call_count, 1)
            self.assertEqual(intent.read_bytes(), before)
            self.assertNotIn("id", json.loads(self.local.STATE.read_text()))


if __name__ == "__main__":
    unittest.main()
