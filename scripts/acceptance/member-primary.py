"""Controlled PRIMARY acceptance supervisor; no browser driver.

Review preflight before provisioning. Existing private config supplies the
reviewed SSH/Auth destinations; generated credentials stay in ignored private
state. Only explicit provision/retire actions call the existing Auth admin API.
All UI work is performed separately through CUA; API actions never claim UI proof.
"""
import datetime
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
MARKER = "member-primary-20261017-01"
ORIGIN = "https://portfolio-platform-fawn.vercel.app"
BACKEND = "https://62.60.191.24/liara-preview"
PRIVATE = ROOT / "scripts/isolated-e2e/.local-primary"
STATE = PRIVATE / "state.json"
REMOTE = Path(__file__).with_name("member-primary-remote.py")


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def check(condition, label):
    if not condition:
        raise ValueError(label)


def private_directory():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        # Windows chmod alone does not remove inherited ACLs.
        principal = os.environ.get("USERDOMAIN", ".") + "\\" + getpass.getuser()
        result = subprocess.run(["icacls", str(PRIVATE), "/inheritance:r", "/grant:r",
            principal + ":(OI)(CI)F"], capture_output=True, timeout=15)
        check(result.returncode == 0, "private_directory_acl_failed")
    else:
        PRIVATE.chmod(0o700)


def save_state(state):
    private_directory()
    temporary = PRIVATE / "state.pending.json"
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    if os.name != "nt":
        temporary.chmod(0o600)
    temporary.replace(STATE)


def config_at(path):
    config = json.loads(Path(path).resolve().read_text(encoding="utf-8-sig"))
    check(config.get("marker") == MARKER and config.get("origin") == ORIGIN
          and config.get("backend") == BACKEND, "unapproved_destination_or_marker")
    check(config.get("dbContainer") == "portfolio-stage-db-1", "unapproved_database")
    check(config.get("soleWriter") is True, "sole_writer_not_confirmed")
    return config


def remote(config, action, **payload):
    ssh = config["ssh"]
    target = ssh["target"]
    check(isinstance(target, str) and re.fullmatch(r"[a-zA-Z0-9_.@-]+", target), "ssh_target")
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=15"]
    if ssh.get("identityFile"):
        args += ["-i", str(Path(ssh["identityFile"]).resolve())]
    if ssh.get("configFile"):
        args += ["-F", str(Path(ssh["configFile"]).resolve())]
    args += [target, "python3", "-"]
    selected = {k: config[k] for k in ("marker", "dbContainer", "authAdminChannel", "approvedAuthAdminBases")}
    request = {"config": selected, "action": action, **payload}
    # JSON request (including ephemeral password) travels through stdin only.
    source = REMOTE.read_text(encoding="utf-8") + "\nmain(json.loads(" + repr(json.dumps(request)) + "))\n"
    result = subprocess.run(args, input=source, capture_output=True, text=True,
                            encoding="utf-8", timeout=90)
    check(result.returncode == 0, "ssh_channel_failed")
    response = json.loads(result.stdout)
    check(response.get("ok") is True, response.get("error", "remote_operation_failed"))
    return response["result"]


def receipt(name, data):
    private_directory()
    (PRIVATE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def run(action, config_path):
    config = config_at(config_path)
    if action == "preflight":
        result = remote(config, "preflight")
        check(result["database"] == "postgres" and result["version"].startswith("17."), "database_identity")
        check(all(result[key] for key in ("holdingsTable", "positionsTable", "scopeTable", "ownedProfilesContract")), "missing_existing_schema")
        receipt("preflight.json", {"checkedAt": now(), "origin": ORIGIN, "backend": BACKEND, **result})
        print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
            "writes": False, "origin": ORIGIN, "backend": BACKEND,
            "dbContainer": result["dbContainer"], "existingControlledCounts":
            {actor: len(rows) for actor, rows in result["controlledActors"].items()}}))
        return
    check(config.get("writeApprovalMarker") == MARKER, "coordinator_write_gate_missing")
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
    if action == "provision":
        check(not state or state.get("marker") == MARKER, "state_marker")
        if state is None:
            before = remote(config, "preflight")
            check(all(not rows for rows in before["controlledActors"].values()), "existing_owned_state_unavailable")
            state = {"marker": MARKER, "createdAt": now(), "users": {
                actor: {"email": MARKER + "-" + actor.lower() + "@example.invalid",
                        "password": secrets.token_urlsafe(36)} for actor in ("A", "B")}}
            save_state(state)
        for actor in ("A", "B"):
            result = remote(config, "provision", actor=actor,
                password=state["users"][actor]["password"], writeMarker=MARKER)
            state["users"][actor]["id"] = result["id"]
            save_state(state)
        receipt("provision-receipt.json", {"at": now(), "marker": MARKER,
            "actors": {actor: {"id": user["id"], "role": "user"} for actor, user in state["users"].items()}})
        print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
            "accounts": 2, "credentials": "private_file_only", "financialWrites": 0}))
    elif action == "read":
        check(state and state.get("marker") == MARKER, "owned_state_missing")
        result = remote(config, "independent-read", passwords={actor: state["users"][actor]["password"] for actor in ("A", "B")})
        receipt("independent-read.json", {"at": now(), "marker": MARKER, **result})
        print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
            "versions": {actor: len(result["actors"][actor]["versions"]) for actor in ("A", "B")}}))
    elif action == "api-first-save":
        check(config.get("financialWriteApprovalMarker") == MARKER, "financial_scenario_review_gate_missing")
        check(state and state.get("marker") == MARKER, "owned_state_missing")
        # Persist the exact request BEFORE attempting the first network write.
        if "firstFinancialAttempt" not in state:
            state["firstFinancialAttempt"] = {"base_version": 0, "client_token": str(uuid.uuid4()),
                "positions": [{"position_key": MARKER + "-gold", "manual_label": "آزمون کنترل‌شده عضو | " + MARKER,
                    "asset_class": "gold", "qty": 3, "unit": "گرم", "as_of": "2026-10-17",
                    "ownership_pct": 100, "valuation_mode": "unpriced"}]}
            state["foreignToken"] = str(uuid.uuid4())
            save_state(state)
        result = remote(config, action, payload=state["firstFinancialAttempt"],
            foreignToken=state["foreignToken"],
            passwords={actor: state["users"][actor]["password"] for actor in ("A", "B")}, writeMarker=MARKER)
        receipt("api-first-save.json", {"at": now(), **result})
        print(json.dumps({"status": result["status"], "action": action, "marker": MARKER,
            "versionRowsA": len(result["db"]["versions"]), "checks": result["checks"]}))
        if result["status"] != "PASS":
            sys.exit(1)
    elif action == "media-negative":
        check(state and state.get("marker") == MARKER, "owned_state_missing")
        result = remote(config, action, password=state["users"]["B"]["password"],
            reviewedReleaseSha="c042a2b4109ff33a5bb8b3e033093ed3c2dcbf23")
        receipt("media-negative.json", {"at": now(), "origin": ORIGIN, "backend": BACKEND, **result})
        print(json.dumps({"status": result["status"], "action": action,
            "getStatus": result["getStatus"], "patchStatus": result["patchStatus"],
            "publicBefore": result["publicBefore"]["body"],
            "publicAfter": result.get("publicAfter", {}).get("body")}))
        if result["status"] != "PASS":
            sys.exit(1)
    elif action == "api-second-version":
        check(config.get("secondVersionApprovalMarker") == MARKER, "second_version_review_gate_missing")
        check(state and state.get("marker") == MARKER and "firstFinancialAttempt" in state, "owned_first_attempt_missing")
        if "secondFinancialAttempt" not in state:
            state["secondFinancialAttempt"] = {"base_version": 1, "client_token": str(uuid.uuid4()),
                "positions": [{**state["firstFinancialAttempt"]["positions"][0], "title": "اصلاح نسخه دوم | " + MARKER}]}
            save_state(state)
        result = remote(config, action, payload=state["secondFinancialAttempt"],
            firstPayload=state["firstFinancialAttempt"], password=state["users"]["A"]["password"], writeMarker=MARKER)
        receipt("api-second-version.json", {"at": now(), **result})
        print(json.dumps({"status": result["status"], "action": action, "marker": MARKER,
            "checks": result["checks"], "globalLogoutStatus": result["globalLogoutStatus"],
            "freshAnonymousStatus": result["freshAnonymousStatus"]}))
        if result["status"] != "PASS":
            sys.exit(1)
    elif action == "retire":
        check(state and state.get("marker") == MARKER, "owned_state_missing")
        outcomes = []
        for actor in ("A", "B"):
            disabled = remote(config, "disable", actor=actor, password=state["users"][actor]["password"], writeMarker=MARKER)
            outcomes.append({"actor": actor, **disabled})
        state["retiredAt"] = now()
        state.pop("sessions", None)
        save_state(state)
        receipt("retirement.json", {"at": now(), "marker": MARKER, "outcomes": outcomes,
            "limitation": "Existing access JWTs can remain valid until expiry; controlled accounts are banned and refresh sessions revoked."})
        print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
            "accountsDisabled": 2, "history": "preserved"}))
    else:
        raise ValueError("unsupported_action")


if __name__ == "__main__":
    try:
        check(len(sys.argv) == 3, "usage_action_and_private_config_path_required")
        run(sys.argv[1], sys.argv[2])
    except Exception as error:
        # Suppress subprocess stderr, HTTP bodies, config and credential values.
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(json.dumps({"status": "BLOCKED", "reason": reason[:100]}))
        sys.exit(2)
