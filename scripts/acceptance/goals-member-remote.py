"""Two separately scoped ordinary members for goals/budget acceptance. One actor per invocation. Execute only through the stdin supervisor.

No browser driver, financial write, schema change, token mint or customer lookup.
Existing Auth keys and native sessions stay in server memory; only safe results
are returned. The historical two-account acceptance helpers remain untouched.
"""
import base64
import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ALLOWED_MARKERS = frozenset(('member-goals-20261023-a', 'member-goals-20261023-b'))
MARKER = "member-goals-20261023-a"
EMAIL = MARKER + "-a@example.invalid"
ORIGIN = "https://portfolio-platform-fawn.vercel.app"
BACKEND = "https://62.60.191.24/liara-preview"
DB = "portfolio-stage-db-1"
AUTH = "portfolio-stage-auth-1"
GATEWAY = "portfolio-stage-gateway-1"
ADMIN = "http://172.19.0.4:9999"


def check(condition, code):
    if not condition:
        raise ValueError(code)


def command(args, source=None):
    result = subprocess.run(args, input=source, text=True, capture_output=True, timeout=40)
    check(result.returncode == 0, "remote_command_failed")
    return result.stdout


def inspect(name):
    check(name in (DB, AUTH, GATEWAY), "container_not_approved")
    result = json.loads(command(["docker", "inspect", name]))[0]
    check(result["State"]["Running"], "container_not_running")
    return result


def database(query):
    return json.loads(command(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres",
        "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
        "BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; " + query + "; COMMIT;"))


def owned(expected=None):
    result = database("SELECT coalesce(json_agg(x),'[]') FROM (SELECT u.id,"
        "u.raw_app_meta_data->>'acceptance_run' AS marker,p.role,"
        "coalesce(u.banned_until>now(),false) AS banned FROM auth.users u "
        "LEFT JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)='" + EMAIL + "') x")
    check(len(result) <= 1 and all(row["marker"] == MARKER for row in result), "owned_identity_collision")
    if expected is not None:
        check(re.fullmatch(r"[a-f0-9-]{36}", expected) is not None, "owned_uuid_shape")
        check(len(result) == 1 and result[0]["id"] == expected, "owned_uuid_mismatch")
    return result


def keys():
    env = dict(value.split("=", 1) for value in inspect(GATEWAY)["Config"]["Env"] if "=" in value)
    values = [env.get("VERIFY_SERVICE_KEY"), env.get("VERIFY_ANON_KEY")]
    check(all(values), "existing_gateway_keys_missing")
    for value, role in zip(values, ("service_role", "anon")):
        part = value.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        check(claims.get("role") == role, "existing_key_role_mismatch")
    return values


def channel():
    current = inspect(AUTH)
    ips = {network.get("IPAddress") for network in current["NetworkSettings"]["Networks"].values()}
    check(urllib.parse.urlsplit(ADMIN).hostname in ips, "auth_admin_endpoint_changed")
    return current


def http(url, method="GET", body=None, headers=None):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError("unexpected_redirect")
    allowed = (BACKEND + "/auth/v1/token?grant_type=password", BACKEND + "/auth/v1/logout?scope=global")
    if url.startswith(ADMIN + "/"):
        channel()  # Recheck running container IP before EVERY admin request.
        suffix = url[len(ADMIN):]
        check((method == "POST" and suffix == "/admin/users") or
            (method == "PUT" and re.fullmatch(r"/admin/users/[a-f0-9-]{36}", suffix)), "admin_request_scope")
    else:
        check(url in allowed and method == "POST", "public_auth_request_scope")
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise ValueError("native_auth_http_" + str(error.code)) from None


def admin(method, suffix, body):
    service, _ = keys()
    return http(ADMIN + suffix, method, body, {"Authorization": "Bearer " + service, "apikey": service})


def ledger(uid):
    check(re.fullmatch(r"[a-f0-9-]{36}", uid) is not None, "owned_uuid_shape")
    return database("SELECT json_build_object("
        "'goalVersions',coalesce((SELECT json_agg(g ORDER BY version) FROM public.member_goals_versions g WHERE user_id='" + uid + "'),'[]'::json),"
        "'versions',coalesce((SELECT json_agg(h ORDER BY version) FROM public.member_holding_versions h WHERE user_id='" + uid + "'),'[]'::json),"
        "'positions',coalesce((SELECT json_agg(p ORDER BY version_id,position_key) FROM public.member_holding_positions p WHERE version_id IN (SELECT id FROM public.member_holding_versions WHERE user_id='" + uid + "')),'[]'::json),"
        "'debts',coalesce((SELECT json_agg(d ORDER BY version_id,debt_key) FROM public.member_debt_positions d WHERE version_id IN (SELECT id FROM public.member_holding_versions WHERE user_id='" + uid + "')),'[]'::json),"
        "'scopes',coalesce((SELECT json_agg(r ORDER BY scope_version) FROM public.member_investment_scope_reviews r WHERE user_id='" + uid + "'),'[]'::json),"
        "'cashFlowVersions',coalesce((SELECT json_agg(v ORDER BY period_start,period_end,version) FROM public.member_cash_flow_versions v WHERE user_id='" + uid + "'),'[]'::json),"
        "'cashFlowEntries',coalesce((SELECT json_agg(e ORDER BY version_id,entry_key) FROM public.member_cash_flow_entries e WHERE version_id IN (SELECT id FROM public.member_cash_flow_versions WHERE user_id='" + uid + "')),'[]'::json))")


def session_counts(uid):
    return database("SELECT json_build_object('sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='" + uid + "'),"
        "'refreshTokens',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id='" + uid + "'),"
        "'activeRefresh',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id='" + uid + "' AND revoked IS FALSE))")


def execute(request):
    global MARKER, EMAIL
    cfg = request["config"]
    check(cfg.get("marker") in ALLOWED_MARKERS, "goals_marker_not_approved")
    MARKER = cfg["marker"]
    EMAIL = MARKER + "-a@example.invalid"
    check(cfg.get("marker") == MARKER and cfg.get("origin") == ORIGIN and cfg.get("backend") == BACKEND,
        "destination_or_marker_mismatch")
    check(cfg.get("dbContainer") == DB and cfg.get("authAdminBase") == ADMIN, "approved_channel_mismatch")
    action = request["action"]
    if action == "preflight":
        db, auth_container = inspect(DB), channel()
        keys()
        result = database("SELECT json_build_object('database',current_database(),'version',current_setting('server_version'),"
            "'goals',to_regclass('public.member_goals_versions') IS NOT NULL,"
            "'holdings',to_regclass('public.member_holding_versions') IS NOT NULL,"
            "'debts',to_regclass('public.member_debt_positions') IS NOT NULL,"
            "'scope',to_regclass('public.member_investment_scope_reviews') IS NOT NULL,"
            "'cashFlowVersions',to_regclass('public.member_cash_flow_versions') IS NOT NULL,"
            "'cashFlowEntries',to_regclass('public.member_cash_flow_entries') IS NOT NULL)")
        check(result["database"] == "postgres" and result["version"].startswith("17."), "database_identity")
        check(result["goals"] and result["holdings"] and result["debts"] and result["scope"] and result["cashFlowVersions"] and result["cashFlowEntries"], "existing_financial_contract_missing")
        result.update({"dbContainer": DB, "dbContainerId": db["Id"], "authContainerId": auth_container["Id"],
            "authAdminBase": ADMIN, "existingKeyRolesVerified": True, "controlledCount": len(owned()), "writes": False})
        return result
    check(action in ("provision", "readback", "retire"), "unsupported_action")
    if action == "provision":
        check(cfg.get("soleWriter") is True and cfg.get("writeApprovalMarker") == MARKER,
            "provision_not_coordinated")
        rows = owned()
        reused = bool(rows)
        if not rows:
            password = request.get("password", "")
            check(re.fullmatch(r"[a-zA-Z0-9_-]{32,80}", password) is not None, "password_shape")
            _, user = admin("POST", "/admin/users", {"email": EMAIL, "password": password,
                "email_confirm": True, "app_metadata": {"acceptance_run": MARKER}})
            rows = owned(user.get("id"))
        check(rows[0]["role"] == "user" and not rows[0]["banned"], "native_profile_not_active_member")
        data = ledger(rows[0]["id"])
        check(all(not values for values in data.values()), "provision_expected_empty_ledger")
        return {"id": rows[0]["id"], "role": "user", "reused": reused, "financialRows": 0}
    expected = request.get("id")
    check(isinstance(expected, str) and re.fullmatch(r"[a-f0-9-]{36}", expected) is not None, "owned_uuid_required")
    rows = owned(expected)
    check(len(rows) == 1 and rows[0]["role"] == "user", "controlled_member_missing")
    uid = rows[0]["id"]
    before = ledger(uid)
    if action == "readback":
        return {"id": uid, "role": "user", "ledger": before, "writes": False}
    check(cfg.get("soleWriter") is True and cfg.get("retireApprovalMarker") == MARKER, "retirement_not_coordinated")
    already_banned = rows[0]["banned"]
    logout_status = ban_status = None
    if not already_banned:
        _, anon = keys()
        _, session = http(BACKEND + "/auth/v1/token?grant_type=password", "POST",
            {"email": EMAIL, "password": request["password"]}, {"apikey": anon})
        check(session.get("user", {}).get("id") == uid, "native_login_identity")
        logout_status, _ = http(BACKEND + "/auth/v1/logout?scope=global", "POST", {},
            {"apikey": anon, "Authorization": "Bearer " + session["access_token"]})
        check(logout_status in (200, 204), "native_global_logout_failed")
        ban_status, _ = admin("PUT", "/admin/users/" + uid, {"ban_duration": "876000h"})
    counts = session_counts(uid)
    check(owned(uid)[0]["banned"] and all(value == 0 for value in counts.values()), "retirement_verification_failed")
    check(ledger(uid) == before, "financial_history_changed")
    return {"id": uid, "banned": True, **counts, "historyPreserved": True, "reused": already_banned,
        "globalLogoutStatus": logout_status, "banStatus": ban_status,
        "limitation": "Already-issued access JWTs may remain valid until expiry."}


def main(request):
    try:
        print(json.dumps({"ok": True, "result": execute(request)}, ensure_ascii=False))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z0-9_]{1,100}", str(error)) else "remote_operation_failed"
        print(json.dumps({"ok": False, "error": code}))
