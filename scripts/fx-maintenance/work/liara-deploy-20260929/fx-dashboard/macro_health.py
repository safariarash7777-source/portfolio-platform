"""Inventory the actual economic inputs without printing financial values.

Coverage is not a claim that a statistic has been verified against its publisher.
Official release comparison is the scheduled agent's separate responsibility.
"""
import hashlib
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import data_sources as ds
from source_health import DATA_DIR, atomic_write


def fingerprint(path):
    file = Path(path)
    return hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else "missing"


def audit():
    series = []
    annual = ds.load_excel_data()
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3, minutes=30))).date()
    current_year = today.year - 621
    if today < dt.date(*ds._jalali_to_gregorian(current_year, 1, 1)):
        current_year -= 1
    for name in ds._ROW_MAP.values():
        numeric = pd.to_numeric(annual[name], errors="coerce")
        present = annual.loc[numeric.notna() & np.isfinite(numeric), "year_shamsi"]
        series.append({"series": name, "frequency": "annual", "last_period": str(int(present.max())) if len(present) else None,
                       "missing": int(numeric.isna().sum()), "incomplete_or_future_years": [int(year) for year in present if year >= current_year],
                       "verified_against_publisher": False})
    try:
        inflation = pd.read_excel(ds.INFLATION_PATH, sheet_name=0)
        period_col = "دوره (سال/ماه)"
        for name in ("تورم ماهانه (درصد)", "تورم نقطه به نقطه (درصد)", "تورم سالانه (درصد)"):
            numeric = pd.to_numeric(inflation[name], errors="coerce")
            present = inflation.loc[numeric.notna() & np.isfinite(numeric), period_col]
            series.append({"series": name, "frequency": "monthly", "last_period": str(present.iloc[-1]) if len(present) else None,
                           "missing": int(numeric.isna().sum()), "duplicate_periods": int(inflation[period_col].duplicated().sum()),
                           "verified_against_publisher": False})
    except (OSError, KeyError, ValueError) as exc:
        series.append({"series": "inflation_monthly", "error_type": type(exc).__name__})
    for name, loader in (("cpi_reconstructed", ds.load_cpi_monthly), ("real_interest_monthly", ds.load_real_interest_monthly)):
        frame = loader()
        available=frame.dropna(subset=['real_rate']) if name=='real_interest_monthly' and not frame.empty else frame.dropna(subset=['cpi']) if not frame.empty and 'cpi' in frame else frame
        series.append({"series": name, "frequency": "monthly", "last_period": str(available.index.max()) if not available.empty else None,
                       "derived": True, "rows": len(frame), "verified_against_publisher": False})
    files = [{"file": Path(path).name, "sha256": fingerprint(path)}
             for path in (ds.EXCEL_PATH, ds.INFLATION_PATH, ds.YTM_PATH, ds.BOURSE_PATH)]
    try:
        releases = json.loads((DATA_DIR / "official-release-health.json").read_text(encoding="utf-8"))
        sources = {item["source_id"]: item for item in releases.get("sources", [])}
    except (OSError, ValueError, KeyError, TypeError):
        sources = {}
    bindings = {"cpi_cbi": "CBI_inflation", "infl_cbi": "CBI_inflation",
                "cpi_sci": "SCI", "infl_sci": "SCI", "m2_irr": "CBI_accounts",
                "m2_growth": "CBI_accounts", "gdp_growth": "CBI_accounts", "gdp_usd": "CBI_accounts",
                "oil_exports": "OPEC", "usa_cpi": "CPIAUCSL", "usa_infl": "CPIAUCSL",
                "usa_m2": "M2SL", "usa_m2_growth": "M2SL"}
    for item in series:
        sid = bindings.get(item["series"], "SCI" if item["series"].startswith("تورم") else None)
        source = sources.get(sid, {})
        item.update({"official_source": source.get("url"), "last_official_period": source.get("last_period"),
                     "publication_date": source.get("publication_date"), "unit_definition_verified": False,
                     "release_check_status": source.get("status", "definition_unverified"),
                     "release_error_type": source.get("error_type")})
    try:
        sci_update=json.loads((DATA_DIR/'sci-inflation-update.json').read_text(encoding='utf-8'))
        if fingerprint(ds.INFLATION_PATH)==sci_update['after_sha256']:
            for item in series:
                if item['series'].startswith('تورم'):
                    item.update(verified_against_publisher=True,verified_periods=sci_update['updated_periods'],older_periods_verified=False,official_source=sci_update['sources'][-1]['url'],last_official_period=sci_update['last_period'],publication_date=sci_update['publication_date_jalali'],release_check_status='official_monthly_workbook_updated',unit_definition_verified=True)
    except (OSError,ValueError,KeyError,TypeError):pass
    try:
        annual_revision=json.loads((DATA_DIR/'annual-economic-update.json').read_text(encoding='utf-8'))
        if fingerprint(ds.EXCEL_PATH)==annual_revision['after_sha256']:
            verified={x['series']:x for x in annual_revision['series']}
            for item in series:
                if item['series'] in verified:
                    entry=verified[item['series']]
                    item.update(official_source=entry['source'],last_official_period=str(entry['last_period']),official_calendar=entry['calendar'],unit_definition_verified=True,release_check_status='official_annual_workbook_updated',source_last_updated=entry['source_last_updated'],publication_date=None)
    except (OSError,ValueError,KeyError,TypeError):pass
    observed = ds.load_historical_excel_data()
    try:
        annual_update = json.loads((DATA_DIR / 'annual-update-latest.json').read_text(encoding='utf-8'))
        annual_sources = {item['series']: item for item in json.loads(
            (DATA_DIR / 'worldbank-gdp-check.json').read_text(encoding='utf-8'))['series']}
    except (OSError, ValueError, KeyError, TypeError):
        annual_update, annual_sources = {}, {}
    for item in series:
        if item.get('frequency') != 'annual':
            continue
        values = pd.to_numeric(observed[item['series']], errors='coerce')
        periods = observed.loc[values.notna() & np.isfinite(values), 'year_shamsi']
        item['last_non_assumption_period'] = str(int(periods.max())) if len(periods) else None
        item['excluded_assumption_years'] = observed.attrs.get('excluded_assumption_years', [])
        if item['series'] in annual_update.get('series', []):
            entry = annual_sources.get(item['series'], {})
            item.update({'official_source': entry.get('source'),
                         'verified_official_period': annual_update.get('official_period'),
                         'official_calendar': 'Gregorian',
                         'unit_definition_verified': True, 'units': entry.get('unit'),
                         'source_last_updated': entry.get('source_last_updated'),
                         'release_check_status': 'latest_completed_annual_period_updated',
                         'other_periods_verified': False})
    from fred_snapshot import SERIES, load
    try:
        definitions = {item['series_id']: item for item in json.loads(
            (DATA_DIR / 'fred-series-metadata.json').read_text(encoding='utf-8'))}
    except (OSError, ValueError, KeyError, TypeError):
        definitions = {}
    for sid in sorted(SERIES):
        snapshot = load(sid)
        source = sources.get(sid, {})
        definition = definitions.get(sid, {})
        series.append({'series': 'official_' + sid, 'frequency': source.get('frequency'),
                       'last_period': snapshot.attrs.get('last_period'),
                       'last_official_period': source.get('last_period'),
                       'publication_date': source.get('publication_date'),
                       'official_source': 'https://fred.stlouisfed.org/series/' + sid,
                       'unit_definition_verified': bool(definition.get('metadata_verified')),
                       'units': definition.get('units'),
                       'release_check_status': 'validated_snapshot' if not snapshot.empty else 'unavailable',
                       'stale': snapshot.attrs.get('stale', True),
                       'annual_excel_updated': False,
                       'missing': int(snapshot.isna().sum())})
    return {"checked_at": pd.Timestamp.now(tz="UTC").isoformat(), "series": series, "files": files,
            "official_release_comparison": "pending", "iran_sheet_configured": bool(ds.GOOGLE_SHEET_URL)}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    report = audit()
    atomic_write(DATA_DIR / "macro-health.json", report)
    print(json.dumps(report, ensure_ascii=False))
