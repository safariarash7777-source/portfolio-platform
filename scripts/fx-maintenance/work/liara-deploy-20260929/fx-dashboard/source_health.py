"""Validated, persistent snapshots of the dashboard's existing TGJU source.

No invented observations: failures retain the original source date and history.
The maintenance command prints health metadata only, never prices or secrets.
"""
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile

import requests

DATA_DIR = Path(os.environ.get("FX_DATA_DIR", str(Path(__file__).parent / ".data_health")))
URL = "https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl"


def validate_rows(rows):
    valid = []
    today = dt.datetime.now(dt.timezone.utc).date()
    for row in rows if isinstance(rows, list) else []:
        try:
            date = dt.datetime.strptime(str(row[6]), "%Y/%m/%d").date()
            price = float(str(row[3]).replace(",", ""))
            if len(row) >= 8 and date <= today and math.isfinite(price) and price > 0:
                valid.append(row)
        except (ValueError, TypeError, IndexError):
            continue
    if not valid:
        raise ValueError("Source contained no valid dated prices")
    return sorted(valid, key=lambda row: row[6])


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        json.dump(value, file, ensure_ascii=False, allow_nan=False)
        temp = file.name
    os.replace(temp, path)


def load_dollar():
    now = dt.datetime.now(dt.timezone.utc)
    snapshot_path = DATA_DIR / "tgju-dollar.json"
    error = None
    snapshot = None
    try:
        response = requests.get(URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        response.raise_for_status()
        rows = validate_rows(response.json().get("data"))
        snapshot = {"source": URL, "fetched_at": now.isoformat(), "data": rows}
        atomic_write(snapshot_path, snapshot)
    except (requests.RequestException, ValueError, OSError) as exc:
        error = type(exc).__name__
        try:
            cached = json.loads(snapshot_path.read_text(encoding="utf-8"))
            if cached.get("source") == URL:
                cached["data"] = validate_rows(cached.get("data"))
                fetched = dt.datetime.fromisoformat(cached["fetched_at"])
                # Reject future timestamps and excessively old backups.
                if dt.timedelta(0) <= now - fetched <= dt.timedelta(days=7):
                    snapshot = cached
        except (OSError, ValueError, KeyError, TypeError):
            pass
    source_date = snapshot["data"][-1][6] if snapshot else None
    age_days = (now.date() - dt.datetime.strptime(source_date, "%Y/%m/%d").date()).days if source_date else None
    stale = error is not None or age_days is None or age_days > 2
    status = {"checked_at": now.isoformat(), "source": URL, "source_date": source_date,
              "fetched_at": snapshot["fetched_at"] if snapshot else None,
              "rows": len(snapshot["data"]) if snapshot else 0,
              "status": "unavailable" if not snapshot else "stale" if stale else "healthy",
              "error_type": error}
    try:
        atomic_write(DATA_DIR / "health.json", status)
    except OSError:
        pass
    return {"data": snapshot["data"] if snapshot else [], "stale": stale,
            "cached": error is not None and snapshot is not None, "health": status}


if __name__ == "__main__":
    print(json.dumps(load_dollar()["health"], ensure_ascii=False))
