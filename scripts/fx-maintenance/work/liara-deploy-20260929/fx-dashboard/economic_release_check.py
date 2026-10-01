"""Fetch primary-source documents; keep financial observations outside LLM output.

This records coverage and provenance. A fetched document is not permission to
replace a different economic series, annual estimate, or forecast in Excel.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import sys
from urllib.parse import urljoin

from lxml import html
import numpy as np
import pandas as pd
import requests

from source_health import DATA_DIR, atomic_write

FRED = {"CPIAUCSL": "monthly", "M2SL": "monthly", "GDPC1": "quarterly",
        "DFF": "daily", "DCOILBRENTEU": "daily"}
DOCUMENTS = {
    "SCI": "https://amar.org.ir/",
    "CBI_inflation": "https://www.cbi.ir/Inflation/Inflation_FA.aspx",
    "CBI_accounts": "https://www.cbi.ir/category/EconomicReport_fa.aspx",
    "OPEC": "https://publications.opec.org/momr/information/2476",
}


def fetch(identifier):
    url = ("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + identifier
           if identifier in FRED else DOCUMENTS[identifier])
    record = {"source_id": identifier, "url": url, "checked_at": pd.Timestamp.now(tz="UTC").isoformat()}
    try:
        # The laptop's inherited proxy times out for official publishers while
        # verified direct HTTPS works. Keep TLS validation and isolate this fetch
        # from unrelated app/gateway proxy configuration.
        session = requests.Session()
        session.trust_env = False
        response = session.get(url, timeout=(12, 45))
        response.raise_for_status()
        content = response.content
        checksum = hashlib.sha256(content).hexdigest()
        folder = DATA_DIR / "official-documents" / identifier
        folder.mkdir(parents=True, exist_ok=True)
        document = folder / (checksum + (".csv" if identifier in FRED else ".html"))
        if identifier in FRED:
            frame = pd.read_csv(io.BytesIO(content))
            if identifier not in frame or len(frame.columns) != 2:
                raise ValueError("Unexpected CSV schema")
            dates = pd.to_datetime(frame.iloc[:, 0], errors="coerce")
            values = pd.to_numeric(frame[identifier], errors="coerce")
            if dates.isna().any() or dates.duplicated().any() or not dates.is_monotonic_increasing:
                raise ValueError("Invalid observation dates")
            if (dates > pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()).any():
                raise ValueError("Future observations")
            valid = values.notna() & np.isfinite(values)
            if not valid.any():
                raise ValueError("No valid observations")
            record.update({"status": "validated_snapshot", "frequency": FRED[identifier],
                           "last_period": dates[valid].max().strftime("%Y-%m-%d"),
                           "rows": len(frame), "missing": int((~valid).sum()),
                           "annual_excel_updated": False})
        else:
            tree = html.fromstring(content)
            # Links and year-selector metadata only; never table values.
            links = []
            for anchor in tree.xpath("//a[@href]"):
                label = " ".join(anchor.itertext()).strip()
                target = urljoin(response.url, anchor.get("href"))
                if any(word in label for word in ("تورم", "بین بانکی", "گزیده", "حساب", "شاخص قیمت", "September")):
                    # Link text can contain financial observations. Expose only
                    # the matched qualitative topic and URL to the model.
                    topic = next(word for word in ("تورم", "بین بانکی", "گزیده", "حساب", "شاخص قیمت", "September") if word in label)
                    links.append({"topic": topic, "url": target})
            selected = tree.xpath("//select/option[@selected]/text()")
            challenge = bool(tree.xpath('//script[contains(@src,"TSPD")]'))
            record.update({"status": "browser_challenge" if challenge else "document_received_definition_pending", "links": links[:15],
                           "selected_year_labels": selected, "data_updated": False})
        # Preserve every distinct official vintage, including later revisions.
        if not document.exists():
            document.write_bytes(content)
        record.update({"sha256": checksum, "document": str(document),
                       "http_last_modified": response.headers.get("Last-Modified"),
                       "publication_date": None})
        atomic_write(folder / "latest.json", record)
    except (requests.RequestException, ValueError, OSError) as exc:
        record.update({"status": "source_unavailable", "error_type": type(exc).__name__})
    return record


def check():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        records = list(executor.map(fetch, list(FRED) + list(DOCUMENTS)))
    report = {"checked_at": pd.Timestamp.now(tz="UTC").isoformat(), "sources": records,
              "economic_excel_updated": False}
    atomic_write(DATA_DIR / "official-release-health.json", report)
    return report


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(check(), ensure_ascii=False))
