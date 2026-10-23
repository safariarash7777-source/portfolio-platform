"""Prepare/provision/read/retire one coordinator-owned ordinary member.

Secrets are generated only on explicitly gated provision. All remote requests
use SSH stdin, not argv. Do not print/copy private state into a prompt or receipt.
Browser login/save/read/logout is a separate coordinator-owned CUA sequence.
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

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_MARKERS = frozenset(('member-goals-20261023-a', 'member-goals-20261023-b'))
MARKER = "member-goals-20261023-a"
ORIGIN = "https://portfolio-platform-fawn.vercel.app"
BACKEND = "https://62.60.191.24/liara-preview"
PRIVATE = ROOT / "scripts/isolated-e2e/.local-goals-members" / MARKER
STATE = PRIVATE / "state.json"
REMOTE = Path(__file__).with_name("goals-member-remote.py")


def check(condition, code):
    if not condition:
        raise ValueError(code)


def private_directory():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        principal = os.environ.get("USERDOMAIN", ".") + "\\" + getpass.getuser()
        result = subprocess.run(["icacls", str(PRIVATE), "/inheritance:r", "/grant:r", principal + ":(OI)(CI)F"],
            capture_output=True, timeout=15)
        check(result.returncode == 0, "private_acl_failed")
    else:
        PRIVATE.chmod(0o700)


def private_json(path, value):
    private_directory()
    temporary = path.with_suffix(".pending.json")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    if os.name != "nt":
        temporary.chmod(0o600)
    temporary.replace(path)


def config_at(path):
    global MARKER, PRIVATE, STATE
    cfg = json.loads(Path(path).resolve().read_text(encoding="utf-8-sig"))
    check(cfg.get("marker") in ALLOWED_MARKERS, "goals_marker_not_approved")
    MARKER = cfg["marker"]
    PRIVATE = ROOT / "scripts/isolated-e2e/.local-goals-members" / MARKER
    STATE = PRIVATE / "state.json"
    check(cfg.get("marker") == MARKER and cfg.get("origin") == ORIGIN and cfg.get("backend") == BACKEND,
        "destination_or_marker_mismatch")
    check(cfg.get("sshTarget") == "root@62.60.191.24" and cfg.get("dbContainer") == "portfolio-stage-db-1"
        and cfg.get("authAdminBase") == "http://172.19.0.4:9999", "channel_mismatch")
    return cfg


def remote(cfg, action, **payload):
    selected = {key: cfg.get(key) for key in ("marker", "origin", "backend", "dbContainer", "authAdminBase",
        "soleWriter", "writeApprovalMarker", "retireApprovalMarker")}
    request = {"config": selected, "action": action, **payload}
    source = REMOTE.read_text(encoding="utf-8") + "\nmain(json.loads(" + repr(json.dumps(request)) + "))\n"
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
        "-i", str(Path(cfg["identityFile"]).resolve()), cfg["sshTarget"], "python3", "-"]
    result = subprocess.run(args, input=source, capture_output=True, text=True, encoding="utf-8", timeout=120)
    check(result.returncode == 0, "ssh_channel_failed")
    response = json.loads(result.stdout)
    check(response.get("ok") is True, response.get("error", "remote_operation_failed"))
    return response["result"]


def run(action, path):
    cfg = config_at(path)
    check(action in ("preflight", "provision", "readback", "retire"), "unsupported_action")
    if action == "preflight":
        result = remote(cfg, action)
    else:
        state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
        if state:
            check(state.get("marker") == MARKER, "private_state_marker")
        if action == "provision":
            check(cfg.get("soleWriter") is True and cfg.get("writeApprovalMarker") == MARKER,
                "provision_not_coordinated")
            check(not state or "retiredAt" not in state, "retired_account_cannot_be_reopened")
            if state is None:
                check(remote(cfg, "preflight")["controlledCount"] == 0, "existing_state_unavailable")
                state = {"marker": MARKER, "email": MARKER + "-a@example.invalid", "password": secrets.token_urlsafe(36)}
                private_json(STATE, state)  # Before native create, for unknown-response recovery.
            result = remote(cfg, action, password=state["password"])
            check(not state.get("id") or state["id"] == result["id"], "private_state_uuid_changed")
            state["id"] = result["id"]
            private_json(STATE, state)
        else:
            check(state and state.get("id"), "owned_state_missing")
            if action == "retire":
                check(cfg.get("soleWriter") is True and cfg.get("retireApprovalMarker") == MARKER,
                    "retirement_not_coordinated")
            result = remote(cfg, action, id=state["id"], **({"password": state["password"]} if action == "retire" else {}))
            if action == "retire":
                state["retiredAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                private_json(STATE, state)
    # Preserve each stage as well as a stable latest path; never archive credentials.
    stamp = datetime.datetime.now(datetime.timezone.utc)
    result["checkedAt"] = stamp.isoformat()
    private_json(PRIVATE / (action + "-" + stamp.strftime("%Y%m%dT%H%M%S.%fZ") + ".json"), result)
    # Readback can contain the owned synthetic ledger, kept private for review.
    private_json(PRIVATE / (action + ".json"), result)
    counts = {key: len(value) for key, value in result.get("ledger", {}).items()}
    print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
        "financialWrites": 0, "counts": counts, "credentials": "private_file_only"}))


if __name__ == "__main__":
    try:
        check(len(sys.argv) == 3, "usage_action_private_config_required")
        run(sys.argv[1], sys.argv[2])
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z0-9_]{1,100}", str(error)) else "operation_failed"
        print(json.dumps({"status": "BLOCKED", "reason": code}))
        sys.exit(2)
