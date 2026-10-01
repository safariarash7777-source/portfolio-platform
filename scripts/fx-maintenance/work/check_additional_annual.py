import sys,json,requests,hashlib,math,datetime as dt
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,'work/liara-deploy-20260929/fx-dashboard');import data_sources as ds
from source_health import DATA_DIR
SPECS=[('gdp_usd','IRN','NY.GDP.MKTP.CD','GDP (current US$)',1e9),('usa_cpi','USA','FP.CPI.TOTL','Consumer price index (2010 = 100)',1),('usa_infl','USA','FP.CPI.TOTL.ZG','Inflation, consumer prices (annual %)',1),('usa_m2','USA','FM.LBL.BMNY.CN','Broad money (current LCU)',1e9),('usa_m2_growth','USA','FM.LBL.BMNY.ZG','Broad money growth (annual %)',1)]
a=ds.load_excel_data();start=int(a['year_miladi'].min());end=dt.datetime.now(dt.timezone.utc).year-1

def fetch(spec):
 name,country,sid,label,divisor=spec;s=requests.Session();s.trust_env=False;entry={'series':name,'country':country,'indicator':sid,'calendar':'Gregorian','unit_divisor':divisor}
 try:
  metaurl=f'https://api.worldbank.org/v2/indicator/{sid}?format=json';r=s.get(metaurl,timeout=(12,60));r.raise_for_status();m=r.json()[1][0]
  assert m['name']==label
  url=f'https://api.worldbank.org/v2/country/{country}/indicator/{sid}?format=json&date={start}:{end}&per_page=20000';r=s.get(url,timeout=(12,60));r.raise_for_status();x=r.json();assert x[0]['pages']==1
  obs={}
  for t in x[1]:
   assert t['countryiso3code']==country and t['indicator']['id']==sid and t.get('obs_status') in ('',None)
   y=int(t['date']);v=t['value'];assert y not in obs and start<=y<=end and (v is None or math.isfinite(v));obs[y]=v
  sha=hashlib.sha256(r.content).hexdigest();folder=DATA_DIR/'official-documents'/('WB_'+country+'_'+sid);folder.mkdir(parents=True,exist_ok=True);doc=folder/(sha+'.json');doc.write_bytes(r.content)
  # Identify whether legacy units and base agree, without returning any observed values.
  matches=[];ratios=[]
  for _,row in a.iterrows():
   y=int(row['year_miladi']);v=obs.get(y);old=row[name]
   if v is not None and isinstance(old,(int,float)) and math.isfinite(old) and v!=0:
    converted=v/divisor
    if math.isclose(converted,old,rel_tol=0.003,abs_tol=0.01):matches.append(y)
    if y<=2020:ratios.append(old/converted)
  entry.update(status='definition_and_snapshot_validated',definition=m['name'],source=url,source_note=m.get('sourceNote'),source_last_updated=x[0].get('lastupdated'),publication_date=None,sha256=sha,document=str(doc),last_period=max(y for y,v in obs.items() if v is not None),legacy_matched_periods=matches,legacy_scale_matches_definition=bool(ratios) and all(abs(t-1)<0.02 for t in ratios[-10:]))
 except (requests.RequestException,AssertionError,ValueError,KeyError,TypeError) as e:entry.update(status='unavailable_or_definition_unverified',error_type=type(e).__name__)
 return entry
with ThreadPoolExecutor(max_workers=3) as pool:entries=list(pool.map(fetch,SPECS))
report={'series':entries};(DATA_DIR/'worldbank-additional-check.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
