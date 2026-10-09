"""Real Postgres tests; synthetic auth claims only in a disposable test DB.

No HTTP/JWT/owner login acceptance is claimed. CI uses its existing PG service.
--create-container uses only the cached pinned PG image, network none/no ports.
--remote sends source SQL to the already-authorized SSH host via stdin, no secrets.
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import uuid

FILES = [
    "sql/test/supabase_bootstrap.sql", "sql/test/recovery_member_access_fixture.sql",
    "sql/phase5_payments_telegram.sql", "sql/phase11_access_tiers.sql",
    "sql/phase30_contain_create_payment.sql", "sql/recovery_profile_role_guard_20261006.sql",
    "sql/recovery_member_ledger_grants_20261006.sql",
    "sql/recovery_profile_writes_freeze_20261006.sql",
]
# Existing cached postgres:17-alpine image ID; never download or upgrade it.
IMAGE = "sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
A, B, ADMIN, D, E = [c * 8 + "-" + c * 4 + "-" + c * 4 + "-" + c * 4 + "-" + c * 12 for c in "abcde"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--create-container", action="store_true")
    parser.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2] if "SQL_FILES" not in globals() else None
    files = globals().get("SQL_FILES") or {p: (root / p).read_text(encoding="utf-8-sig") for p in FILES}
    if args.remote:
        # Only public source/test fixtures cross SSH. No env, dump or credentials.
        script = "SQL_FILES = " + repr(files) + "\n" + pathlib.Path(__file__).read_text(encoding="utf-8")
        script = script.replace("args = parser.parse_args()", "args = parser.parse_args(['--create-container'])")
        result = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
            "-i", "C:/Users/Asus/.ssh/codex-liara-portfolio", "root@62.60.191.24", "python3", "-"],
            input=script, text=True, encoding="utf-8", capture_output=True, timeout=240)
        print(result.stdout.strip() or json.dumps({"status": "FAIL", "reason": "remote_runner_unavailable"}))
        return result.returncode
    container = "p01-role-proof-" + uuid.uuid4().hex[:12] if args.create_container else None
    database = "p01_role_proof_" + uuid.uuid4().hex[:12]
    container_created = False
    database_created = False
    passed = []
    failed = None

    def command(sql, db=database, allow_error=False):
        base = ["docker", "exec", "-i", container] if container else []
        argv = base + ["psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
        result = subprocess.run(argv, input=sql, capture_output=True, text=True, encoding="utf-8", timeout=30)
        if result.returncode and not allow_error:
            error = re.search(r"ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)", result.stderr)
            if error:
                message = re.sub(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", "FIXTURE_ID", error.group(2))
                raise RuntimeError("SQLSTATE_" + error.group(1) + ":" + message[:160])
            raise RuntimeError("sql_failed")
        return result

    def check(name, sql, expected="t"):
        nonlocal failed
        failed = name
        result = command(sql)
        lines = [s.strip() for s in result.stdout.splitlines() if s.strip()]
        assert lines and lines[-1] == expected, "unexpected_result"
        passed.append(name)

    def actor(role, uid, sql, commit=True):
        claims = json.dumps({"role": role, **({"sub": uid} if uid else {})})
        return "BEGIN; SELECT set_config('request.jwt.claims','" + claims + "',true); SET LOCAL ROLE " + role + "; " + sql + ("; COMMIT;" if commit else "; ROLLBACK;")

    def denied(name, role, uid, sql):
        nonlocal failed
        failed = name
        result = command(actor(role, uid, sql), allow_error=True)
        if result.returncode == 0 or "42501" not in result.stderr:
            state = re.search(r"ERROR:\s+([A-Z0-9]{5}):", result.stderr)
            raise AssertionError("expected_permission_denial:" + (state.group(1) if state else "SQL_SUCCEEDED"))
        passed.append(name)

    try:
        if not container:
            assert os.environ.get('PGHOST') in ('127.0.0.1', 'localhost') and os.environ.get('PGPORT') == '5433', 'explicit_loopback_test_database_required'
        if container:
            memory = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
            assert memory > 512 * 1024, "insufficient_free_memory"
            subprocess.run(["docker", "image", "inspect", IMAGE], capture_output=True, check=True)
            subprocess.run(["docker", "run", "-d", "--name", container, "--network", "none",
                "--memory", "384m", "--cpus", "0.5", "--label", "p01.disposable-role-proof=true",
                "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE], capture_output=True, check=True)
            container_created = True
            for _ in range(45):
                ready = subprocess.run(["docker", "exec", container, "pg_isready", "-U", "postgres"], capture_output=True)
                process = subprocess.run(["docker", "exec", container, "cat", "/proc/1/comm"], capture_output=True, text=True)
                # pg_isready also succeeds on the temporary init server. Wait for
                # the final postgres process, after native role setup completes.
                if ready.returncode == 0 and process.stdout.strip() == "postgres":
                    break
                time.sleep(1)
            else:
                raise RuntimeError("test_container_not_ready")
        command("CREATE DATABASE " + database, db="postgres")
        database_created = True
        for path in FILES[:5]:
            command(files[path])
        command("GRANT ALL ON public.payments,public.entitlements TO anon,authenticated,service_role;")
        command(f"INSERT INTO public.payments(user_id,amount,status,invite_link) VALUES ('{A}',100,'paid','fixture-a'),('{B}',200,'paid','fixture-b'); INSERT INTO public.entitlements(user_id,kind,expires_at) VALUES ('{A}','manual',now()+interval '1 day'),('{B}','manual',now()+interval '1 day');")
        # Prove the original weakness on nonempty synthetic fixtures, then restore.
        check("baseline_self_role_escalation_reproduced", actor("authenticated", B, f"UPDATE public.profiles SET role='admin' WHERE id='{B}'; SELECT public.is_admin()"))
        command(f"UPDATE public.profiles SET role='user' WHERE id='{B}'")
        check("baseline_self_admin_insert_reproduced", actor("authenticated", D, f"INSERT INTO public.profiles(id,role) VALUES ('{D}','admin'); SELECT public.is_admin()"))
        command(f"DELETE FROM public.profiles WHERE id='{D}'")
        command(actor("anon", None, "TRUNCATE public.payments", commit=False))
        check("baseline_truncate_rollback_keeps_rows", "SELECT count(*)=2 FROM public.payments")
        failed = "role_patch_failure_is_atomic"
        broken = command(files[FILES[5]].replace("COMMIT;", "SELECT 1/0; COMMIT;"), allow_error=True)
        assert broken.returncode != 0 and "22012" in broken.stderr
        check("role_patch_failure_is_atomic", "SELECT count(*)=0 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='recovery_profile_role_guard'")
        check("role_patch_failure_preserves_original_policies", "SELECT count(*)=2 AND bool_and(with_check IS NULL OR position('role' in with_check)=0) FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname IN ('profiles_self_insert','profiles_self_update')")
        for _ in range(2):
            command(files[FILES[5]])
        denied("self_update_admin_denied", "authenticated", B, f"UPDATE public.profiles SET role='admin' WHERE id='{B}'")
        denied("self_insert_admin_denied", "authenticated", D, f"INSERT INTO public.profiles(id,role) VALUES ('{D}','admin')")
        denied("definer_rpc_self_admin_denied", "authenticated", B, f"SELECT public.recovery_fixture_rpc_role('{B}','admin')")
        denied("definer_rpc_cross_admin_denied", "authenticated", B, f"SELECT public.recovery_fixture_rpc_role('{A}','admin')")
        denied("definer_rpc_missing_actor_denied", "authenticated", None, f"SELECT public.recovery_fixture_rpc_role('{B}','admin')")
        check("ordinary_self_edit_preserved", actor("authenticated", B, f"UPDATE public.profiles SET full_name='Edited fixture' WHERE id='{B}'; SELECT full_name='Edited fixture' FROM public.profiles WHERE id='{B}'"))
        check("cross_profile_update_denied", actor("authenticated", B, f"WITH changed AS (UPDATE public.profiles SET full_name='Cross edit' WHERE id='{A}' RETURNING id) SELECT count(*)=0 FROM changed"))
        check("self_user_insert_preserved", actor("authenticated", D, f"INSERT INTO public.profiles(id,role) VALUES ('{D}','user'); SELECT role='user' FROM public.profiles WHERE id='{D}'"))
        check("existing_admin_edit_preserved", actor("authenticated", ADMIN, f"UPDATE public.profiles SET full_name='Admin edit' WHERE id='{ADMIN}'; SELECT public.is_admin()"))
        check("authorized_admin_role_change_preserved", actor("authenticated", ADMIN, f"UPDATE public.profiles SET role='admin' WHERE id='{D}'; SELECT role='admin' FROM public.profiles WHERE id='{D}'"))
        command(actor("authenticated", ADMIN, f"UPDATE public.profiles SET role='user' WHERE id='{D}'"))
        check("authorized_service_admin_insert_preserved", actor("service_role", None, f"INSERT INTO public.profiles(id,role) VALUES ('{E}','admin'); SELECT role='admin' FROM public.profiles WHERE id='{E}'"))
        check("authorized_service_rpc_preserved", actor("service_role", None, f"SELECT public.recovery_fixture_rpc_role('{D}','admin'); SELECT role='admin' FROM public.profiles WHERE id='{D}'"))
        command(actor("authenticated", ADMIN, f"UPDATE public.profiles SET role='user' WHERE id='{D}'"))
        for table in ["payments", "entitlements"]:
            check(table + "_nonempty_own_only", actor("authenticated", B, f"SELECT count(*)=1 AND bool_and(user_id='{B}') FROM public.{table}"))
            check(table + "_explicit_cross_read_denied", actor("authenticated", B, f"SELECT count(*)=0 FROM public.{table} WHERE user_id='{A}'"))
            check(table + "_anon_read_denied", actor("anon", None, f"SELECT count(*)=0 FROM public.{table}"))
            check(table + "_admin_read_preserved", actor("authenticated", ADMIN, f"SELECT count(*)=2 FROM public.{table}"))
        check("b_admin_predicate_stays_false", actor("authenticated", B, "SELECT NOT public.is_admin()"))
        check("existing_access_rpc_preserved", actor("authenticated", B, f"SELECT public.fn_user_access('{B}')='full'"))
        check("existing_telegram_rpc_preserved", actor("authenticated", B, "SELECT length(public.generate_telegram_link_code())=6"))
        denied("existing_create_payment_containment_preserved", "authenticated", B, "SELECT public.create_payment(100,'fixture-blocked')")
        denied("payment_verify_user_denied", "authenticated", B, "SELECT public.verify_payment('fixture-server','ref',100,NULL)")
        check("authorized_service_payment_rpc_preserved", actor("service_role", A, "SELECT public.create_payment(100,'fixture-server') IS NOT NULL; SELECT public.verify_payment('fixture-server','fixture-ref',100,NULL) IS NOT NULL"))
        denied("nonadmin_entitlement_grant_denied", "authenticated", B, f"INSERT INTO public.entitlements(user_id,kind,expires_at) VALUES ('{A}','manual',now()+interval '1 day')")
        check("admin_entitlement_grant_preserved", actor("authenticated", ADMIN, f"INSERT INTO public.entitlements(user_id,kind,expires_at) VALUES ('{D}','manual',now()+interval '1 day'); SELECT count(*)=1 FROM public.entitlements WHERE user_id='{D}'"))
        snapshot = command("SELECT json_build_object('payment_rows',(SELECT count(*) FROM public.payments),'entitlement_rows',(SELECT count(*) FROM public.entitlements),'profile_rows',(SELECT count(*) FROM public.profiles))").stdout.strip()
        failed = "grant_patch_failure_is_atomic"
        broken = command(files[FILES[6]].replace("COMMIT;", "SELECT 1/0; COMMIT;"), allow_error=True)
        assert broken.returncode != 0 and "22012" in broken.stderr
        check("grant_patch_failure_is_atomic", "SELECT has_table_privilege('authenticated','public.payments','TRUNCATE')")
        for _ in range(2):
            command(files[FILES[6]])
        for role in ["anon", "authenticated", "service_role"]:
            for table in ["payments", "entitlements"]:
                denied(role + "_" + table + "_truncate_denied", role, B if role == 'authenticated' else None, f"TRUNCATE public.{table}")
                check(role + "_" + table + "_other_dml_grants_preserved", f"SELECT bool_and(has_table_privilege('{role}','public.{table}',p)) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS privileges(p)")
        check("all_counts_preserved_after_grant_patch", "SELECT json_build_object('payment_rows',(SELECT count(*) FROM public.payments),'entitlement_rows',(SELECT count(*) FROM public.entitlements),'profile_rows',(SELECT count(*) FROM public.profiles))", expected=snapshot)
        check("post_grant_existing_paid_read_preserved", actor("authenticated", B, "SELECT count(*)=1 FROM public.payments WHERE status='paid'"))
        check("post_grant_service_failure_rpc_preserved", actor("service_role", A, "SELECT public.create_payment(100,'fixture-after-grant') IS NOT NULL; SELECT public.fail_payment('fixture-after-grant'); SELECT status='failed' FROM public.payments WHERE authority='fixture-after-grant'"))
        check("post_grant_admin_revocation_preserved", actor("authenticated", ADMIN, f"UPDATE public.entitlements SET revoked_at=now() WHERE user_id='{D}'; SELECT bool_and(revoked_at IS NOT NULL) FROM public.entitlements WHERE user_id='{D}'"))
        # Safe application rollback leaves the DB guard and denies the old write.
        denied("old_application_role_write_stays_denied", "authenticated", B, f"UPDATE public.profiles SET role='admin' WHERE id='{B}'")
        command("GRANT UPDATE(full_name), INSERT(full_name) ON public.profiles TO authenticated")
        for _ in range(2):
            command(files[FILES[7]])
        denied("safe_rollback_freeze_denies_profile_write", "authenticated", B, f"UPDATE public.profiles SET full_name='Frozen write' WHERE id='{B}'")
        denied("safe_rollback_definer_role_gap_stays_closed", "authenticated", B, f"SELECT public.recovery_fixture_rpc_role('{B}','admin')")
        check("safe_rollback_own_profile_read_preserved", actor("authenticated", B, f"SELECT count(*)=1 FROM public.profiles WHERE id='{B}'"))
        check("safe_rollback_existing_admin_preserved", actor("authenticated", ADMIN, "SELECT public.is_admin()"))
        check("safe_rollback_service_profile_edit_preserved", actor("service_role", None, f"UPDATE public.profiles SET full_name='Service edit' WHERE id='{B}'; SELECT full_name='Service edit' FROM public.profiles WHERE id='{B}'"))
        check("original_identities_and_roles_preserved", f"SELECT count(*)=3 AND bool_and(role=CASE WHEN id='{ADMIN}' THEN 'admin' ELSE 'user' END) FROM public.profiles WHERE id IN ('{A}','{B}','{ADMIN}')")
        failed = None
        print(json.dumps({"status": "PASS", "checks": len(passed), "passed": passed, "database": "DISPOSABLE_SYNTHETIC", "postgres": command("SHOW server_version").stdout.strip(), "http_auth_acceptance": "NOT_RUN", "main_mutation": False, "network": "none" if container else "CI_SERVICE"}))
        return 0
    except Exception as exc:
        reason = str(exc) if isinstance(exc, (AssertionError, RuntimeError)) else type(exc).__name__
        print(json.dumps({"status": "FAIL", "failed_case": failed, "error_class": type(exc).__name__, "safe_reason": reason, "passed": passed, "main_mutation": False}))
        return 1
    finally:
        if container and container_created:
            subprocess.run(["docker", "rm", "-f", "-v", container], capture_output=True, timeout=30)
        elif not container and database_created:
            command("DROP DATABASE IF EXISTS " + database, db="postgres", allow_error=True)


if __name__ == "__main__":
    sys.exit(main())
