"""Stdin-only remote helper: existing Auth admin channel and owned synthetic rows.

Never run directly against an unreviewed configuration. No DDL, profile repair,
customer lookup, direct SQL financial writes, or token/password output exists.
The supervisor appends main(request) over SSH stdin; credentials never enter argv.
"""
import base64
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = "https://portfolio-platform-fawn.vercel.app"
BACKEND = "https://62.60.191.24/liara-preview"


def gateway_keys(config):
    channel = config["authAdminChannel"]
    container = inspect(channel["keyContainer"])
    values = dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)
    service, anon = values.get("VERIFY_SERVICE_KEY"), values.get("VERIFY_ANON_KEY")
    if not service or not anon:
        raise ValueError("existing_gateway_keys_missing")
    return service, anon


def http(url, method="GET", body=None, headers=None):
    if not any(url.startswith(target + "/") for target in (ORIGIN, BACKEND)):
        raise ValueError("http_destination")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError("unexpected_redirect")
    req = urllib.request.Request(url, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", **(headers or {})})
    try:
        response = urllib.request.build_opener(NoRedirect).open(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    try:
        body = json.loads(raw) if raw else None
    except ValueError:
        # Never print a response body: Auth endpoints may reflect credentials.
        raise ValueError("non_json_http_" + str(response.status) + "_" + urllib.parse.urlsplit(url).path) from None
    return {"status": response.status, "cache": response.headers.get("Cache-Control"),
            "body": body}


def login(config, actor, password, allow_missing_profile=False):
    rows = owned(config, actor)
    if len(rows) != 1 or (rows[0]["role"] != "user" and not (allow_missing_profile and rows[0]["role"] is None)):
        raise ValueError("owned_member_missing")
    _, anon = gateway_keys(config)
    result = http(BACKEND + "/auth/v1/token?grant_type=password", "POST", {
        "email": config["marker"] + "-" + actor.lower() + "@example.invalid",
        "password": password}, {"apikey": anon})
    if result["status"] != 200 or result["body"].get("user", {}).get("id") != rows[0]["id"]:
        raise ValueError("synthetic_native_login_failed")
    session = result["body"]
    if "expires_at" not in session:
        session["expires_at"] = int(time.time()) + int(session["expires_in"])
    storage = "base64-" + base64.urlsafe_b64encode(json.dumps(session, ensure_ascii=False,
        separators=(",", ":")).encode()).decode().rstrip("=")
    chunks = [storage[i:i + 3180] for i in range(0, len(storage), 3180)]
    key = "sb-62-auth-token"
    cookie = "; ".join((key if len(chunks) == 1 else key + "." + str(i)) + "=" + value
                       for i, value in enumerate(chunks))
    # All keys, JWTs and cookies stay in server process memory, never stdout.
    return {"Cookie": cookie}, {"Authorization": "Bearer " + session["access_token"], "apikey": anon}, rows[0]["id"]


def member_home(cookie):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError("unexpected_member_home_redirect")
    request = urllib.request.Request(ORIGIN + "/dashboard", headers=cookie)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=40) as response:
        text = response.read().decode("utf-8")
        # Do not return HTML, serialized props, account email or session data.
        return {"status": response.status, "holdingsLink": "/dashboard/holdings" in text,
                "adminEntryAbsent": "ورود به پنل مدیریت" not in text,
                "knownProfileVisible": "آزمون کنترل‌شده عضو A" in text}


def require(value, pattern, label):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError(label)
    return value


def command(args, text=None):
    result = subprocess.run(args, input=text, text=True, encoding="utf-8",
                            capture_output=True, timeout=40)
    if result.returncode:
        raise ValueError("remote_command_failed")
    return result.stdout.strip()


def database(config, query):
    container = require(config["dbContainer"], r"portfolio-stage-db-1", "db_destination")
    return json.loads(command([
        "docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
        "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
        "BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; " + query + "; COMMIT;"))


def inspect(container):
    require(container, r"[a-zA-Z0-9_.-]{1,100}", "container_name")
    return json.loads(command(["docker", "inspect", container]))[0]


def owned(config, actor):
    marker = require(config["marker"], r"member-primary-20261017-01", "marker")
    if actor not in ("A", "B"):
        raise ValueError("actor")
    email = marker + "-" + actor.lower() + "@example.invalid"
    result = database(config, "SELECT coalesce(json_agg(x),'[]') FROM ("
        "SELECT u.id, u.raw_app_meta_data->>'acceptance_run' AS marker, p.role,"
        "coalesce(u.banned_until>now(),false) AS banned "
        "FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id "
        "WHERE lower(u.email)='" + email + "') x")
    if len(result) > 1 or any(row["marker"] != marker for row in result):
        raise ValueError("synthetic_identity_collision")
    return result


def financial(config, uid):
    require(uid, r"[a-f0-9-]{36}", "owned_id")
    return database(config, "SELECT json_build_object("
        "'versions',coalesce((SELECT json_agg(h ORDER BY version) FROM public.member_holding_versions h WHERE user_id='" + uid + "'),'[]'::json),"
        "'positions',coalesce((SELECT json_agg(p ORDER BY version_id,position_key) FROM public.member_holding_positions p WHERE version_id IN (SELECT id FROM public.member_holding_versions WHERE user_id='" + uid + "')),'[]'::json),"
        "'debts',coalesce((SELECT json_agg(d ORDER BY version_id,debt_key) FROM public.member_debt_positions d WHERE version_id IN (SELECT id FROM public.member_holding_versions WHERE user_id='" + uid + "')),'[]'::json),"
        "'scopes',coalesce((SELECT json_agg(r ORDER BY scope_version) FROM public.member_investment_scope_reviews r WHERE user_id='" + uid + "'),'[]'::json))")


def auth(config, method, suffix, body):
    channel = config["authAdminChannel"]
    target = channel["baseUrl"]
    # Exact endpoint is reviewed by the coordinator; do not follow redirects.
    if target not in config["approvedAuthAdminBases"]:
        raise ValueError("auth_destination")
    current = inspect("portfolio-stage-auth-1")
    endpoint = urllib.parse.urlsplit(target)
    current_ips = {network.get("IPAddress") for network in current["NetworkSettings"]["Networks"].values()}
    if target != "http://172.19.0.4:9999" or endpoint.hostname not in current_ips or not current["State"]["Running"]:
        raise ValueError("internal_auth_identity_or_endpoint_changed")
    if channel.get("keyContainer") != "portfolio-stage-gateway-1" or channel.get("keyVariable") != "VERIFY_SERVICE_KEY":
        raise ValueError("existing_auth_channel_mismatch")
    key, _ = gateway_keys(config)
    request = urllib.request.Request(target.rstrip("/") + suffix,
        data=json.dumps(body).encode(), method=method,
        headers={"Authorization": "Bearer " + key, "apikey": key,
                 "Content-Type": "application/json"})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError("unexpected_auth_redirect")
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        # Auth bodies can contain email or reflected input; never return them.
        raise ValueError("auth_admin_http_" + str(error.code)) from None


def main(request):
    try:
        config = request["config"]
        marker = require(config["marker"], r"member-primary-20261017-01", "marker")
        action = request["action"]
        if action == "preflight":
            db = inspect(config["dbContainer"])
            if not db["State"]["Running"]:
                raise ValueError("database_not_running")
            result = database(config, "SELECT json_build_object("
                "'database',current_database(),'version',current_setting('server_version'),"
                "'holdingsTable',to_regclass('public.member_holding_versions') IS NOT NULL,"
                "'positionsTable',to_regclass('public.member_holding_positions') IS NOT NULL,"
                "'scopeTable',to_regclass('public.member_investment_scope_reviews') IS NOT NULL,"
                "'ownedProfilesContract',EXISTS(SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='profiles' AND column_name='role'))")
            service, anon = gateway_keys(config)
            def role(value):
                segment = value.split(".")[1]
                return json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))["role"]
            if role(service) != "service_role" or role(anon) != "anon":
                raise ValueError("existing_gateway_key_roles_mismatch")
            auth_container = inspect("portfolio-stage-auth-1")
            result.update({"dbContainer": config["dbContainer"], "containerId": db["Id"],
                           "image": db["Image"], "marker": marker,
                           "authContainer": "portfolio-stage-auth-1", "authImage": auth_container["Image"],
                           "gateway": "portfolio-stage-gateway-1", "existingKeyNames": ["VERIFY_SERVICE_KEY", "VERIFY_ANON_KEY"],
                           "existingKeyRolesVerified": True, "jwtMinted": False,
                           "controlledActors": {a: owned(config, a) for a in ("A", "B")},
                           "writes": False})
        elif action == "financial-definitions":
            result = database(config, "SELECT json_build_object('functions',coalesce(("
                "SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,"
                "'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),"
                "'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),"
                "'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,"
                "'source',p.prosrc,'definition',pg_get_functiondef(p.oid),"
                "'definitionMd5',md5(pg_get_functiondef(p.oid)),"
                "'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'))) "
                "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE (n.nspname='public' AND p.proname IN ('record_member_holdings','record_member_debts','record_member_investment_scope')) "
                "OR (n.nspname='portfolio_private' AND p.proname='record_snapshot') "
                "OR (n.nspname='portfolio_scope_private' AND p.proname='record_review')),'[]'::json),"
                "'privateScopeUsage',has_schema_privilege('authenticated','portfolio_scope_private','USAGE'),"
                "'privateFinancialUsage',has_schema_privilege('authenticated','portfolio_private','USAGE'))")
        elif action == "financial-metadata":
            result = database(config, "SELECT json_build_object('functions',coalesce(("
                "SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,"
                "'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,"
                "'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),"
                "'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),"
                "'acl',p.proacl::text,'definitionMd5',md5(pg_get_functiondef(p.oid)))) "
                "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE (n.nspname='public' AND p.proname IN ('record_member_holdings','record_member_debts','record_member_investment_scope')) "
                "OR (n.nspname='portfolio_private' AND p.proname='record_snapshot')),'[]'::json),"
                "'tables',coalesce((SELECT json_agg(json_build_object('table',c.relname,"
                "'rls',c.relrowsecurity,'authSelect',has_table_privilege('authenticated',c.oid,'SELECT'),"
                "'authInsert',has_table_privilege('authenticated',c.oid,'INSERT'),"
                "'authUpdate',has_table_privilege('authenticated',c.oid,'UPDATE'))) "
                "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname='public' AND c.relname IN ('member_holding_versions','member_holding_positions','member_debt_positions','member_investment_scope_reviews')),'[]'::json))")
            result["controlledActors"] = {actor: owned(config, actor) for actor in ("A", "B")}
        elif action == "provision":
            if request.get("writeMarker") != marker:
                raise ValueError("write_gate")
            actor = request["actor"]
            existing = owned(config, actor)
            if existing:
                # Recovery after an unknown create response; never reset a password.
                if existing[0]["role"] != "user":
                    raise ValueError("existing_profile_not_member")
                result = {"id": existing[0]["id"], "reused": True}
            else:
                password = require(request["password"], r"[a-zA-Z0-9_-]{32,80}", "password_shape")
                status, user = auth(config, "POST", "/admin/users", {
                    "email": marker + "-" + actor.lower() + "@example.invalid",
                    "password": password, "email_confirm": True,
                    "app_metadata": {"acceptance_run": marker}})
                require(user.get("id"), r"[a-f0-9-]{36}", "created_identity")
                verified = owned(config, actor)
                if len(verified) != 1 or verified[0]["id"] != user["id"] or verified[0]["role"] != "user":
                    raise ValueError("created_profile_not_native_member")
                result = {"id": user["id"], "reused": False, "status": status}
        elif action in ("read-owned", "independent-read"):
            identities = {}
            for actor in ("A", "B"):
                rows = owned(config, actor)
                if len(rows) != 1 or rows[0]["role"] != "user":
                    raise ValueError("owned_member_missing")
                identities[actor] = rows[0]["id"]
            result = {"marker": marker, "actors": {}}
            for actor, uid in identities.items():
                require(uid, r"[a-f0-9-]{36}", "owned_id")
                result["actors"][actor] = financial(config, uid)
            if action == "independent-read":
                result["api"] = {}
                for actor in ("A", "B"):
                    cookie, _, _ = login(config, actor, request["passwords"][actor])
                    read = http(ORIGIN + "/api/portfolio/holdings", headers=cookie)
                    if read["status"] != 200 or "private" not in (read["cache"] or "") or "no-store" not in read["cache"]:
                        raise ValueError("independent_private_api_read_failed")
                    result["api"][actor] = read
        elif action == "api-first-save":
            if request.get("writeMarker") != marker:
                raise ValueError("write_gate")
            payload = request["payload"]
            if payload.get("base_version") != 0 or len(payload.get("positions", [])) != 1:
                raise ValueError("bounded_first_payload")
            position = payload["positions"][0]
            if position != {"position_key": marker + "-gold", "manual_label": "آزمون کنترل‌شده عضو | " + marker,
                    "asset_class": "gold", "qty": 3, "unit": "گرم", "as_of": "2026-10-17",
                    "ownership_pct": 100, "valuation_mode": "unpriced"}:
                raise ValueError("synthetic_payload_mismatch")
            require(payload.get("client_token"), r"[a-f0-9-]{36}", "persisted_client_token")
            a_cookie, _, a_id = login(config, "A", request["passwords"]["A"])
            b_cookie, b_native, b_id = login(config, "B", request["passwords"]["B"])
            before = financial(config, a_id)
            if len(before["versions"]) > 1 or any(v["client_token"] != payload["client_token"] for v in before["versions"]):
                raise ValueError("unexpected_owned_ledger_state")
            saved = http(ORIGIN + "/api/portfolio/holdings", "POST", payload, a_cookie)
            if saved["status"] not in (200, 201) or saved["body"].get("version") != 1:
                raise ValueError("first_save_not_confirmed_http_" + str(saved["status"]))
            version_id = require(saved["body"].get("version_id"), r"[a-f0-9-]{36}", "server_receipt")
            fresh_cookie, _, _ = login(config, "A", request["passwords"]["A"])
            independent = http(ORIGIN + "/api/portfolio/holdings?version=" + version_id, headers=fresh_cookie)
            after = financial(config, a_id)
            if independent["status"] != 200 or len(after["versions"]) != 1 or len(after["positions"]) != 1:
                raise ValueError("first_independent_read_or_count")
            if after["positions"][0]["qty"] != 3 or after["positions"][0]["declared_value"] is not None:
                raise ValueError("canonical_synthetic_content_mismatch")
            if independent["body"].get("version", {}).get("id") != version_id or independent["body"].get("positions", [{}])[0].get("manual_label") != position["manual_label"] or "private" not in (independent["cache"] or "") or "no-store" not in independent["cache"]:
                raise ValueError("independent_api_content_or_cache_mismatch")
            # Consume then intentionally discard the first response: API replay,
            # not a claim that browser network interruption was exercised.
            replay = http(ORIGIN + "/api/portfolio/holdings", "POST", payload, fresh_cookie)
            if replay["status"] != 200 or replay["body"].get("version_id") != version_id or replay["body"].get("reused") is not True:
                raise ValueError("stable_request_replay_failed")
            native_b_read = http(ORIGIN + "/api/portfolio/holdings", headers=b_cookie)
            foreign_read = http(ORIGIN + "/api/portfolio/holdings?version=" + version_id, headers=b_cookie)
            foreign_rpc = http(BACKEND + "/rest/v1/rpc/record_member_investment_scope", "POST", {
                "p_holding_version_id": version_id, "p_rules_version": "member-selected.v0.1",
                "p_assignments": [{"positionKey": position["position_key"], "use": "excluded"}],
                "p_base_scope_version": 0, "p_client_token": request["foreignToken"]}, b_native)
            foreign_patch = http(BACKEND + "/rest/v1/member_holding_positions?version_id=eq." + version_id,
                                 "PATCH", {"qty": 999}, b_native)
            final = financial(config, a_id)
            checks = {"nativeBRead": native_b_read["status"] == 200,
                "foreignRead404": foreign_read["status"] == 404,
                "foreignRpc403": foreign_rpc["status"] == 403,
                "foreignPatch403": foreign_patch["status"] == 403,
                "foreignContentAbsent": position["manual_label"] not in json.dumps(foreign_read["body"], ensure_ascii=False),
                "AUnchanged": final == after, "BEmpty": len(financial(config, b_id)["versions"]) == 0}
            result = {"marker": marker, "status": "PASS" if all(checks.values()) else "FAIL",
                "checks": checks, "save": saved, "independentRead": independent, "replay": replay,
                "foreignStatuses": {"read": foreign_read["status"], "rpc": foreign_rpc["status"], "patch": foreign_patch["status"]},
                "db": final, "limitation": "Committed API response consumed/discarded then retried; not a real browser dropped-response test."}
        elif action == "media-negative":
            release = "c042a2b4109ff33a5bb8b3e033093ed3c2dcbf23"
            if request.get("reviewedReleaseSha") != release:
                raise ValueError("media_release_gate")
            cookie, _, uid = login(config, "B", request["password"])
            _, anon = gateway_keys(config)
            public_headers = {"apikey": anon, "Authorization": "Bearer " + anon}
            public_url = BACKEND + "/rest/v1/rpc/get_media_layout"
            before = http(public_url, headers=public_headers)
            if before["status"] != 200 or before["body"] != 1:
                raise ValueError("unexpected_public_media_baseline")
            endpoint = ORIGIN + "/api/admin/content/appearance"
            read = http(endpoint, headers=cookie)
            result = {"status": "FAIL", "marker": marker, "actor": "B", "role": "user",
                "reviewedReleaseSha": release, "publicBefore": before,
                "getStatus": read["status"], "patchStatus": None,
                "limitation": "Native HTTP nonadmin route acceptance, not browser UI proof."}
            # Stop before any subsequent request if either guard unexpectedly permits access.
            if read["status"] == 403:
                patch = http(endpoint, "PATCH", {"media_layout": 2}, cookie)
                result["patchStatus"] = patch["status"]
                if patch["status"] == 403:
                    after = http(public_url, headers=public_headers)
                    result["publicAfter"] = after
                    if after["status"] == 200 and after["body"] == 1:
                        result["status"] = "PASS"
            result["accountId"] = uid
        elif action == "api-second-version":
            if request.get("writeMarker") != marker:
                raise ValueError("write_gate")
            first = request["firstPayload"]
            second = request["payload"]
            expected_position = {**first["positions"][0], "title": "اصلاح نسخه دوم | " + marker}
            if second.get("base_version") != 1 or second.get("positions") != [expected_position]:
                raise ValueError("bounded_second_payload")
            require(second.get("client_token"), r"[a-f0-9-]{36}", "persisted_second_token")
            cookie, native, uid = login(config, "A", request["password"])
            home = member_home(cookie)
            if home["status"] != 200 or not home["holdingsLink"] or not home["adminEntryAbsent"] or not home["knownProfileVisible"]:
                raise ValueError("native_member_home_http_failed")
            before = financial(config, uid)
            if len(before["versions"]) not in (1, 2) or before["versions"][0]["client_token"] != first["client_token"]:
                raise ValueError("unexpected_second_version_base")
            if len(before["versions"]) == 2 and before["versions"][1]["client_token"] != second["client_token"]:
                raise ValueError("unexpected_second_version_attempt")
            saved = http(ORIGIN + "/api/portfolio/holdings", "POST", second, cookie)
            if saved["status"] not in (200, 201) or saved["body"].get("version") != 2:
                raise ValueError("second_save_not_confirmed_http_" + str(saved["status"]))
            version_id = require(saved["body"].get("version_id"), r"[a-f0-9-]{36}", "second_server_receipt")
            # Real native logout; no claim that an already-issued JWT expires early.
            logout = http(BACKEND + "/auth/v1/logout?scope=global", "POST", {}, native)
            if logout["status"] not in (200, 204):
                raise ValueError("native_logout_failed")
            anonymous = http(ORIGIN + "/api/portfolio/holdings")
            if anonymous["status"] != 401:
                raise ValueError("fresh_anonymous_control_failed")
            fresh, _, _ = login(config, "A", request["password"])
            reopened = http(ORIGIN + "/api/portfolio/holdings?version=" + version_id, headers=fresh)
            final = financial(config, uid)
            first_id = before["versions"][0]["id"]
            checks = {"twoVersions": len(final["versions"]) == 2,
                "firstVersionUnchanged": final["versions"][0] == before["versions"][0],
                "firstPositionsUnchanged": [p for p in final["positions"] if p["version_id"] == first_id] == [p for p in before["positions"] if p["version_id"] == first_id],
                "reauthenticatedRead": reopened["status"] == 200 and reopened["body"].get("version", {}).get("id") == version_id,
                "allValuesUnpriced": all(p["qty"] == 3 and p["declared_value"] is None and p["valuation_mode"] == "unpriced" for p in final["positions"]),
                "secondTitleVisible": reopened["body"].get("positions", [{}])[0].get("title") == expected_position["title"]}
            result = {"marker": marker, "status": "PASS" if all(checks.values()) else "FAIL",
                "memberHomeHttp": home, "save": saved, "globalLogoutStatus": logout["status"],
                "freshAnonymousStatus": anonymous["status"], "freshAuthenticatedRead": reopened,
                "checks": checks, "db": final,
                "limitation": "Native HTTP/Auth/session acceptance only; no browser UI login/save/logout proof. Already-issued JWTs may remain valid until expiry."}
        elif action == "disable":
            if request.get("writeMarker") != marker:
                raise ValueError("write_gate")
            rows = owned(config, request["actor"])
            if len(rows) != 1:
                raise ValueError("owned_identity_missing")
            uid = require(rows[0]["id"], r"[a-f0-9-]{36}", "owned_id")
            session_state = database(config, "SELECT json_build_object("
                "'sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='" + uid + "'),"
                "'activeRefresh',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id='" + uid + "' AND revoked IS FALSE))")
            if rows[0]["banned"]:
                if session_state["sessions"] or session_state["activeRefresh"]:
                    raise ValueError("banned_with_sessions_requires_coordinator")
                print(json.dumps({"ok": True, "result": {"id": uid, "disabled": True,
                    "reused": True, "sessions": 0, "activeRefresh": 0, "financialHistory": "preserved"}}))
                return
            _, native, _ = login(config, request["actor"], request["password"], allow_missing_profile=True)
            logout = http(BACKEND + "/auth/v1/logout?scope=global", "POST", {}, native)
            if logout["status"] not in (200, 204):
                raise ValueError("session_revocation_failed")
            status, _ = auth(config, "PUT", "/admin/users/" + uid, {"ban_duration": "876000h"})
            result = {"id": uid, "disabled": True, "status": status,
                      "globalLogoutStatus": logout["status"],
                      "financialHistory": "preserved"}
        else:
            raise ValueError("unsupported_action")
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    except Exception as error:
        allowed = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(json.dumps({"ok": False, "error": allowed[:100]}))
