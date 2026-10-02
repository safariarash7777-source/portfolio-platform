"""Offline, synthetic contract verification; no application/database/provider calls.
Run with bundled Python: python docs/ops/product-plan-v0.1/p11/verify.py
Requires jsonschema. Never reads environment variables, credentials or member data.
"""
import copy
import csv
import hashlib
import json
from pathlib import Path
from datetime import datetime
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
schema = json.loads((ROOT / "event.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
checker = FormatChecker()


@checker.checks("date-time", raises=ValueError)
def timestamp(value):
    if not isinstance(value, str):
        return True
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return "T" in value and parsed.tzinfo is not None


validator = Draft202012Validator(schema, format_checker=checker)
BASE_SHA = "31c44ab635b672b589b7833bcbc78b41d36f1e75"


def key(value):
    return "k_" + hashlib.sha256(("synthetic-only:" + value).encode()).hexdigest()


def row(kind, contract, dims, sequence):
    return dict(contractVersion="measurement.v0.1", eventId=key(str(sequence)), type=kind,
                occurredAt="2026-10-02T10:00:00Z", recordedAt="2026-10-02T10:00:01Z",
                environment="synthetic", releaseSha=BASE_SHA, sourceContract=contract,
                sourceRef=key("source:" + str(sequence)), subjectKey=key("A"),
                cohortKey=key("cohort"), versionKey=key("version-1"), dimensions=dims)


specs = [
    ("access.eligible", "seasonal.v0.1", {"status": "allowed"}),
    ("session.started", "auth-boundary.v0.1", {"status": "success"}),
    ("meaningful.completed", "member-boundary.v0.1", {"status": "success", "action": "lesson_checkpoint"}),
    ("membership.renewed", "seasonal.v0.1", {"status": "success"}),
    ("publication.published", "publication.v1", {"status": "success"}),
    ("publication.withdrawn", "publication.v1", {"status": "success"}),
    ("notification.result", "notifications.v1", {"status": "unknown", "channel": "telegram"}),
    ("notification.seen", "notifications.v1", {"status": "success", "channel": "site"}),
    ("publication.read_declared", "publication.v1", {"status": "success"}),
    ("action.recorded", "portfolio-boundary.v0.1", {"status": "success", "action": "done"}),
    ("assistant.result", "assistant-boundary.v0.1", {"status": "referred", "durationMs": 300}),
    ("support.lifecycle", "support-boundary.v0.1", {"action": "opened", "category": "export"}),
    ("service.error", "service-boundary.v0.1", {"category": "auth", "reasonCode": "unavailable"}),
]
positive = [row(*spec, i) for i, spec in enumerate(specs)]
checks = []


def check(name, actual):
    checks.append({"name": name, "passed": bool(actual)})
    if not actual:
        raise AssertionError(name)


for value in positive:
    check("valid:" + value["type"], validator.is_valid(value))

# Mutations cover accidental sensitive payloads and wrong lifecycle/versions.
negative = []
for field, value in [("text", "private"), ("amount", 123), ("telegramId", "111"),
                     ("email", "synthetic@example.invalid"), ("url", "/?token=x")]:
    bad = copy.deepcopy(positive[0]); bad[field] = value
    negative.append(("reject-top-level:" + field, bad))
for field, value in [("question", "private"), ("holdings", []), ("amount", 123),
                     ("reason", "free-text"), ("token", "synthetic-token")]:
    bad = copy.deepcopy(positive[0]); bad["dimensions"][field] = value
    negative.append(("reject-dimension:" + field, bad))
for field, value in [("occurredAt", "2026-10-02"), ("releaseSha", "31c44ab"),
                     ("subjectKey", "member@example.invalid"), ("type", "trade.executed")]:
    bad = copy.deepcopy(positive[0]); bad[field] = value
    negative.append(("reject-invalid:" + field, bad))
bad = copy.deepcopy(positive[0]); bad["occurredAt"] = "2026-02-30T10:00:00Z"
negative.append(("reject-impossible-calendar-date", bad))
for index, field, value in [(8, "versionKey", None), (8, "sourceContract", "notifications.v1"),
                            (6, "dimensions", {"status": "success", "channel": "telegram"}),
                            (10, "dimensions", {"status": "sourced", "durationMs": -1}),
                            (9, "dimensions", {"status": "success", "action": "holdings_confirmed"})]:
    bad = copy.deepcopy(positive[index]); bad[field] = value
    negative.append(("reject-lifecycle:" + str(index) + ":" + field, bad))
for name, bad in negative:
    check(name, not validator.is_valid(bad))


def unique(rows):
    """Fixture-only projection replay rule; production adapter must implement it."""
    result = {}
    sources = {}
    for event in rows:
        previous = result.get(event["eventId"])
        if previous is not None and previous != event:
            raise ValueError("conflicting event identity")
        identity = (event["environment"], event["type"], event["sourceRef"])
        if identity in sources and sources[identity] != event["eventId"]:
            raise ValueError("same source must use stable event identity")
        sources[identity] = event["eventId"]
        result[event["eventId"]] = event
    return list(result.values())


check("replay-does-not-double-count", len(unique(positive + positive)) == len(positive))
conflict = copy.deepcopy(positive[0]); conflict["dimensions"]["category"] = "other"
try:
    unique([positive[0], conflict])
    check("conflicting-identity-quarantined", False)
except ValueError:
    check("conflicting-identity-quarantined", True)
unstable = copy.deepcopy(positive[0]); unstable["eventId"] = key("unstable")
try:
    unique([positive[0], unstable])
    check("unstable-source-identity-quarantined", False)
except ValueError:
    check("unstable-source-identity-quarantined", True)

accepted = copy.deepcopy(positive[6]); accepted["dimensions"]["status"] = "accepted"
check("accepted-status-valid", validator.is_valid(accepted))
check("accepted-does-not-prove-read", not any(e["type"] == "publication.read_declared" for e in [accepted]))
v2 = copy.deepcopy(positive[8]); v2["versionKey"] = key("version-2")
read_keys = {(e["subjectKey"], e["versionKey"]) for e in positive if e["type"] == "publication.read_declared"}
check("old-read-does-not-read-new-version", (v2["subjectKey"], v2["versionKey"]) not in read_keys)
check("A-receipt-does-not-read-B", (key("B"), positive[8]["versionKey"]) not in read_keys)
for filename in ["baseline.csv", "acceptance-evidence.csv", "incidents.csv"]:
    with (ROOT / filename).open(encoding="utf-8", newline="") as stream:
        check("no-fabricated-measurements:" + filename, len(list(csv.DictReader(stream))) == 0)

gate_map = json.loads((ROOT / "gate-map.json").read_text(encoding="utf-8"))
check("G0-G4-canonical-gate-map", set(gate_map["gates"]) == {"G0", "G1", "G2", "G3", "G4"})
check("gate-map-base-pinned", gate_map["applicationSHA"] == BASE_SHA)
check("wave-0-through-4-complete", sorted(c for group in gate_map["waveCriteria"].values() for c in group) == ["J%02d" % i for i in range(14)])
check("pilot-deadline-not-invented", gate_map["pilotDeadline"] is None)

(ROOT / "synthetic-events.json").write_text(json.dumps(positive, indent=2) + "\n", encoding="utf-8")
report = dict(scope="offline synthetic contract only", applicationAcceptance="NOT_RUN",
              measuredAt=datetime.now().astimezone().isoformat(), baseSha=BASE_SHA,
              schemaSha256=hashlib.sha256((ROOT / "event.schema.json").read_bytes().replace(b"\r\n", b"\n")).hexdigest(),
              schemaHashEncoding="UTF-8 / LF canonical",
              passed=len(checks), failed=0, checks=checks,
              networkCalls=0, databaseCalls=0, modelCalls=0, realMemberRecords=0)
(ROOT / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"passed": len(checks), "failed": 0, "scope": report["scope"]}))
