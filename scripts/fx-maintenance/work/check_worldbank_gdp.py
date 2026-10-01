"""Official annual GDP metadata and revision comparison; no financial output."""
import hashlib
import json
import math
from pathlib import Path
import sys
import datetime as dt
import requests
import pandas as pd
sys.path.insert(0,str(Path(__file__).parent/'liara-deploy-20260929/fx-dashboard'))
import data_sources as ds
from source_health import DATA_DIR

INDICATORS={'usa_gdp':'NY.GDP.MKTP.KD','usa_gdp_growth':'NY.GDP.MKTP.KD.ZG'}
annual=ds.load_excel_data()
start=int(annual['year_miladi'].dropna().min())
end=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).year-1
report={'checked_at':pd.Timestamp.now(tz='UTC').isoformat(),'series':[], 'annual_excel_changed':False}
session=requests.Session();session.trust_env=False
for name,sid in INDICATORS.items():
    entry={'series':name,'indicator':sid,'country':'USA','frequency':'annual','calendar':'Gregorian'}
    try:
        metadata_url=f'https://api.worldbank.org/v2/indicator/{sid}?format=json'
        response=session.get(metadata_url,timeout=(12,60));response.raise_for_status()
        metadata=response.json()[1][0]
        expected='GDP (constant 2015 US$)' if name=='usa_gdp' else 'GDP growth (annual %)'
        if metadata['id']!=sid or metadata['name']!=expected:raise ValueError('Unmatched definition')
        url=f'https://api.worldbank.org/v2/country/USA/indicator/{sid}?format=json&date={start}:{end}&per_page=20000'
        response=session.get(url,timeout=(12,60));response.raise_for_status()
        payload=response.json();records=payload[1]
        if payload[0]['pages']!=1:raise ValueError('Incomplete pagination')
        observations={}
        for row in records:
            if row['countryiso3code']!='USA' or row['indicator']['id']!=sid:raise ValueError('Unexpected country/series')
            year=int(row['date'])
            if year in observations or not start<=year<=end:raise ValueError('Invalid period')
            value=row['value']
            if row.get('obs_status') not in ('',None):raise ValueError('Nonstandard/forecast observation')
            if value is not None and (not math.isfinite(value) or (name=='usa_gdp' and value<=0)):raise ValueError('Invalid observation')
            observations[year]=value
        checksum=hashlib.sha256(response.content).hexdigest()
        folder=DATA_DIR/'official-documents'/('WB_'+sid);folder.mkdir(parents=True,exist_ok=True)
        document=folder/(checksum+'.json')
        if not document.exists():document.write_bytes(response.content)
        changed=[];matched=[];unavailable=[]
        for _,row in annual.iterrows():
            year=int(row['year_miladi']) if pd.notna(row['year_miladi']) else None
            if year is None or year>end:continue
            value=observations.get(year)
            if value is None:unavailable.append(year);continue
            converted=value/1e9 if name=='usa_gdp' else value
            old=row[name]
            (matched if pd.notna(old) and abs(old-converted)<=max(abs(converted)*1e-6,1e-6) else changed).append(year)
        entry.update({'status':'definition_and_snapshot_validated','definition':metadata['name'],
                      'unit':'billions of constant 2015 USD' if name=='usa_gdp' else 'annual percent change in real GDP',
                      'source':url,'metadata_source':metadata_url,'source_last_updated':payload[0].get('lastupdated'),
                      'publication_date':None,'last_period':max(y for y,v in observations.items() if v is not None),
                      'document':str(document),'sha256':checksum,'changed_periods':changed,'matched_periods':matched,
                      'unavailable_periods':unavailable})
        (folder/'latest.json').write_text(json.dumps(entry,ensure_ascii=False),encoding='utf-8')
    except (requests.RequestException,ValueError,KeyError,TypeError) as error:
        entry.update({'status':'unavailable_or_definition_unverified','error_type':type(error).__name__})
    report['series'].append(entry)
(DATA_DIR/'worldbank-gdp-check.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
