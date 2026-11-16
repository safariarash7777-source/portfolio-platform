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

ROOT = Path(__file__).resolve().parents[3]
ALLOWED_MARKERS = frozenset(('consultation-20261024-owner', 'consultation-20261024-a', 'consultation-20261024-b', 'consultation-20261024-admin'))
MARKER = "consultation-20261024-a"
ORIGIN = "https://portfolio-platform-fawn.vercel.app"
BACKEND = "https://62.60.191.24/liara-preview"
PRIVATE = ROOT / "scripts/isolated-e2e/.local-goals-members" / MARKER
STATE = PRIVATE / "state.json"
REMOTE = Path(__file__).with_name("native-member-remote.py")


def check(condition, code):
    if not condition:
        raise ValueError(code)


def markers_for_config(cfg):
    run_id = cfg.get("qaRunId")
    if run_id is None:
        check("qaPurpose" not in cfg, "acceptance_scope_invalid")
        return ALLOWED_MARKERS
    check(isinstance(run_id, str) and re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}", run_id)
          and cfg.get("qaPurpose") == "consultation-reader", "acceptance_scope_invalid")
    return frozenset("consultation-reader-" + run_id.replace("-", "") + "-" + actor for actor in ("a", "b"))


def record_attempt(cfg, action):
    if cfg.get("qaRunId") is None:
        return
    target = PRIVATE / (action + "-intent.json")
    try:
        with target.open("x", encoding="utf-8") as handle:
            json.dump({"marker": MARKER, "qaRunId": cfg["qaRunId"], "action": action,
                       "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}, handle)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError:
        raise ValueError("prior_attempt_requires_readback") from None


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
    check(cfg.get("marker") in markers_for_config(cfg), "consultation_marker_not_approved")
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
    if cfg.get("qaRunId") is not None:
        selected.update(qaRunId=cfg["qaRunId"], qaPurpose=cfg["qaPurpose"])
    request = {"config": selected, "action": action, **payload}
    source = REMOTE.read_text(encoding="utf-8") + "\nmain(json.loads(" + repr(json.dumps(request)) + "))\n"
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
        "-i", str(Path(cfg["identityFile"]).resolve()), cfg["sshTarget"], "python3", "-"]
    result = subprocess.run(args, input=source, capture_output=True, text=True, encoding="utf-8", timeout=120)
    check(result.returncode == 0, "ssh_channel_failed")
    response = json.loads(result.stdout)
    check(response.get("ok") is True, response.get("error", "remote_operation_failed"))
    return response["result"]


def run_locked(action, path):
    cfg = config_at(path)
    check(action in ("preflight", "provision", "reconcile-provision", "readback", "session", "retire"), "unsupported_action")
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
            record_attempt(cfg, action)
            result = remote(cfg, action, password=state["password"])
            check(not state.get("id") or state["id"] == result["id"], "private_state_uuid_changed")
            state["id"] = result["id"]
            private_json(STATE, state)
        elif action == "reconcile-provision":
            check(cfg.get("qaRunId") is not None and state and "retiredAt" not in state, "provision_reconciliation_scope")
            intent = json.loads((PRIVATE / "provision-intent.json").read_text(encoding="utf-8"))
            check(intent.get("marker") == MARKER and intent.get("qaRunId") == cfg["qaRunId"]
                  and intent.get("action") == "provision", "provision_intent_mismatch")
            result = remote(cfg, action)
            if result.get("state") == "confirmed":
                check(not state.get("id") or state["id"] == result["id"], "private_state_uuid_changed")
                state["id"] = result["id"]
                private_json(STATE, state)
            else:
                check(result.get("state") == "absent", "provision_reconciliation_invalid")
        else:
            check(state and state.get("id"), "owned_state_missing")
            if action == "session":
                check("retiredAt" not in state, "retired_account_cannot_be_reopened")
            if action == "retire":
                check(cfg.get("soleWriter") is True and cfg.get("retireApprovalMarker") == MARKER,
                    "retirement_not_coordinated")
            if action in ("session", "retire"):
                record_attempt(cfg, action)
            result = remote(cfg, action, id=state["id"], **({"password": state["password"]} if action in ("retire", "session") else {}))
            if action == "retire":
                state["retiredAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                private_json(STATE, state)
    if action == "session":
        check("retiredAt" not in state, "retired_account_cannot_be_reopened")
        private_json(PRIVATE / "native-session.json", result)
        print(json.dumps({"status": "PASS", "action": "session", "marker": MARKER, "credentials": "private_file_only"}))
        return
    # Preserve each stage as well as a stable latest path; never archive credentials.
    stamp = datetime.datetime.now(datetime.timezone.utc)
    result["checkedAt"] = stamp.isoformat()
    private_json(PRIVATE / (action + "-" + stamp.strftime("%Y%m%dT%H%M%S.%fZ") + ".json"), result)
    # Readback can contain the owned synthetic ledger, kept private for review.
    private_json(PRIVATE / (action + ".json"), result)
    counts = {key: len(value) for key, value in result.get("ledger", {}).items()}
    print(json.dumps({"status": "PASS", "action": action, "marker": MARKER,
        "financialWrites": 0, "counts": counts, "credentials": "private_file_only"}))


def run(action, path):
    cfg = config_at(path)
    if cfg.get("qaRunId") is None or action == "preflight":
        return run_locked(action, path)
    check(action in ("provision", "reconcile-provision", "readback", "session", "retire"), "unsupported_action")
    check(not PRIVATE.is_symlink(), "private_path_redirect")
    private_directory()
    lock_path = PRIVATE / "worker.lock"
    try:
        lock = lock_path.open("x", encoding="utf-8")
    except FileExistsError:
        raise ValueError("acceptance_lock_requires_review") from None
    try:
        with lock:
            json.dump({"pid": os.getpid(), "qaRunId": cfg["qaRunId"]}, lock)
            lock.flush()
            os.fsync(lock.fileno())
            return run_locked(action, path)
    finally:
        lock_path.unlink()


if __name__ == "__main__":
    try:
        check(len(sys.argv) == 3, "usage_action_private_config_required")
        run(sys.argv[1], sys.argv[2])
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z0-9_]{1,100}", str(error)) else "operation_failed"
        print(json.dumps({"status": "BLOCKED", "reason": code}))
        sys.exit(2)
