"""Metadata-only audit of market and optional inputs; never print observations."""
import ast
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).parent / 'fx-dashboard'
sys.path.insert(0, str(root))
import pandas as pd
import data_sources as ds
from source_health import DATA_DIR

records = []
ytm = pd.read_excel(ds.YTM_PATH, header=3).iloc[:, :3]
ytm.columns = ['gregorian', 'jalali', 'value']
dates = pd.to_datetime(ytm['gregorian'], errors='coerce')
records.append({'series': 'ytm_daily', 'last_period': str(dates.max().date()) if dates.notna().any() else None,
                'source': 'existing Pouya Finance workbook', 'status': 'official_source_not_verified',
                'definition': 'daily decimal YTM, converted to monthly mean percent by loader',
                'missing': int(ytm['value'].isna().sum())})
records.append({'series': 'iran_interbank_rate', 'status': 'no_separate_series_found_in_consumed_inputs',
                'last_period': None, 'definition': 'YTM must not be relabelled as interbank rate'})
for name, frame in (ds.load_bourse_data() or {}).items():
    date_columns = [str(c) for c in frame.columns if any(x in str(c).lower() for x in ['date', 'تاریخ', 'دوره'])]
    records.append({'series': 'bourse_' + name, 'rows': len(frame), 'date_columns': date_columns,
                    'last_period': None, 'status': 'workbook_publication_date_unverified'})
try:
    health = json.loads((DATA_DIR / 'health.json').read_text(encoding='utf-8'))
    records.append({'series': 'usd_market', 'health': health, 'status': 'existing_source_health_only'})
except (OSError, ValueError):
    records.append({'series': 'usd_market', 'status': 'health_report_unavailable'})
records.append({'series': 'iran_google_sheet', 'status': 'configured' if ds.GOOGLE_SHEET_URL else 'not_configured'})
for name in ['gold_and_fund_bubbles', 'brent_live', 'us_fred_optional']:
    records.append({'series': name, 'status': 'optional_live_fetch_not_official_release_verified',
                    'last_period': None, 'publication_date': None})
report = {'checked_at': pd.Timestamp.now(tz='UTC').isoformat(), 'series': records,
          'economic_data_changed': False,
          'code_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in
                          [root/'app.py', root/'macro_health.py', root/'economic_release_check.py']}}
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
