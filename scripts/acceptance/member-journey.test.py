"""Offline safety checks. No SSH/Auth/DB/network and no generated credentials."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("journey_remote", HERE / "member-journey-remote.py")
remote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(remote)
UID = "11111111-1111-4111-8111-111111111111"
CFG = {"marker": remote.MARKER, "origin": remote.ORIGIN, "backend": remote.BACKEND,
    "dbContainer": remote.DB, "authAdminBase": remote.ADMIN, "soleWriter": False}
ROW = {"id": UID, "marker": remote.MARKER, "role": "user", "banned": False}
EMPTY = {"versions": [], "positions": [], "debts": [], "scopes": []}


class JourneySafety(unittest.TestCase):
    def test_provision_needs_explicit_single_writer_and_marker(self):
        with patch.object(remote, "admin") as admin:
            for cfg in (CFG, {**CFG, "soleWriter": True}, {**CFG, "writeApprovalMarker": remote.MARKER}):
                with self.assertRaisesRegex(ValueError, "provision_not_coordinated"):
                    remote.execute({"config": cfg, "action": "provision"})
            admin.assert_not_called()

    def test_foreign_marker_or_missing_uuid_cannot_read_any_ledger(self):
        with patch.object(remote, "ledger") as ledger:
            for req in ({"config": {**CFG, "marker": "old-marker"}, "action": "readback", "id": UID},
                        {"config": CFG, "action": "readback"}):
                with self.assertRaises(ValueError):
                    remote.execute(req)
            ledger.assert_not_called()

    def test_readback_is_exact_uuid_bound_and_does_not_authenticate(self):
        with patch.object(remote, "owned", return_value=[ROW]) as owned, \
             patch.object(remote, "ledger", return_value=EMPTY) as ledger, patch.object(remote, "admin") as admin:
            result = remote.execute({"config": CFG, "action": "readback", "id": UID})
            owned.assert_called_once_with(UID)
            ledger.assert_called_once_with(UID)
            admin.assert_not_called()
            self.assertFalse(result["writes"])

    def test_existing_banned_account_is_never_unbanned_or_password_reset(self):
        with patch.object(remote, "owned", return_value=[{**ROW, "banned": True}]), patch.object(remote, "admin") as admin:
            cfg = {**CFG, "soleWriter": True, "writeApprovalMarker": remote.MARKER}
            with self.assertRaisesRegex(ValueError, "native_profile_not_active_member"):
                remote.execute({"config": cfg, "action": "provision"})
            admin.assert_not_called()

    def test_retire_retry_banned_account_uses_no_login_and_preserves_history(self):
        cfg = {**CFG, "soleWriter": True, "retireApprovalMarker": remote.MARKER}
        with patch.object(remote, "owned", return_value=[{**ROW, "banned": True}]), \
             patch.object(remote, "ledger", return_value=EMPTY), patch.object(remote, "session_counts", return_value={"sessions": 0, "refreshTokens": 0, "activeRefresh": 0}), \
             patch.object(remote, "http") as http, patch.object(remote, "admin") as admin:
            result = remote.execute({"config": cfg, "action": "retire", "id": UID})
            self.assertTrue(result["historyPreserved"])
            self.assertTrue(result["reused"])
            self.assertIsNone(result["globalLogoutStatus"])
            http.assert_not_called()
            admin.assert_not_called()

    def test_internal_auth_ip_is_rechecked_and_never_falls_back(self):
        with patch.object(remote, "inspect", return_value={"NetworkSettings": {"Networks": {"test": {"IPAddress": "172.19.0.99"}}}}):
            with self.assertRaisesRegex(ValueError, "auth_admin_endpoint_changed"):
                remote.channel()

    def test_native_create_confirms_one_email_and_preserves_native_member_role(self):
        cfg = {**CFG, "soleWriter": True, "writeApprovalMarker": remote.MARKER}
        with patch.object(remote, "owned", side_effect=[[], [ROW]]), \
             patch.object(remote, "admin", return_value=(201, {"id": UID})) as admin, \
             patch.object(remote, "ledger", return_value=EMPTY):
            result = remote.execute({"config": cfg, "action": "provision", "password": "p" * 40})
            method, path, payload = admin.call_args.args
            self.assertEqual((method, path), ("POST", "/admin/users"))
            self.assertEqual(payload["email"], remote.EMAIL)
            self.assertTrue(payload["email_confirm"])
            self.assertEqual(payload["app_metadata"], {"acceptance_run": remote.MARKER})
            self.assertNotIn("role", payload)
            self.assertEqual(result["role"], "user")

    def test_native_retire_revokes_then_bans_only_owned_uuid_and_verifies_zero_tokens(self):
        cfg = {**CFG, "soleWriter": True, "retireApprovalMarker": remote.MARKER}
        with patch.object(remote, "owned", side_effect=[[ROW], [{**ROW, "banned": True}]]), \
             patch.object(remote, "ledger", return_value=EMPTY), \
             patch.object(remote, "keys", return_value=["synthetic-service", "synthetic-anon"]), \
             patch.object(remote, "http", side_effect=[(200, {"user": {"id": UID}, "access_token": "synthetic-session"}), (204, None)]) as http, \
             patch.object(remote, "admin", return_value=(200, {})) as admin, \
             patch.object(remote, "session_counts", return_value={"sessions": 0, "refreshTokens": 0, "activeRefresh": 0}):
            result = remote.execute({"config": cfg, "action": "retire", "id": UID, "password": "p" * 40})
            self.assertEqual(http.call_args_list[1].args[0], remote.BACKEND + "/auth/v1/logout?scope=global")
            admin.assert_called_once_with("PUT", "/admin/users/" + UID, {"ban_duration": "876000h"})
            self.assertTrue(result["historyPreserved"])
            self.assertEqual(result["globalLogoutStatus"], 204)
            self.assertEqual(result["banStatus"], 200)

    def test_http_never_sends_key_or_password_to_unapproved_destination(self):
        for url in ("https://example.invalid/auth/v1/token", remote.ADMIN + "/admin/users/foreign/other"):
            with patch.object(remote, "channel"), self.assertRaises(ValueError):
                remote.http(url, "POST", {})


if __name__ == "__main__":
    unittest.main()
