from pathlib import Path
import json,hashlib,math,datetime as dt,sys,shutil,zipfile,copy,warnings
import openpyxl
from lxml import etree as ET
sys.path.insert(0,'work/liara-deploy-20260929/fx-dashboard');import data_sources as ds
from source_health import DATA_DIR
warnings.filterwarnings('ignore',message='Title is more than 31 characters')
stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');folder=DATA_DIR/'economic-revisions'/stamp;folder.mkdir(parents=True)
raw=json.loads((DATA_DIR/'sci-validated/observations-raw.json').read_text(encoding='utf-8'));source=json.loads((DATA_DIR/'sci-inflation-validation.json').read_text(encoding='utf-8'));assert source['status']=='official_tables_validated'
f=Path(ds.INFLATION_PATH);before=hashlib.sha256(f.read_bytes()).hexdigest();shutil.copy2(f,folder/f.name);w=openpyxl.load_workbook(f);s=w.active;rows={s.cell(r,1).value:r for r in range(2,s.max_row+1)};changes=[];old_row_count=s.max_row;added=[]
assert [s.cell(1,c).value for c in range(1,5)]==['دوره (سال/ماه)','تورم ماهانه (درصد)','تورم نقطه به نقطه (درصد)','تورم سالانه (درصد)']
months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
def period_order(value):
 month,year=value.split();return int(year)*12+months.index(month)
latest=period_order(s.cell(s.max_row,1).value)
for obs in raw:
 order=period_order(obs['period'])
 if order>latest:
  assert order==latest+1,'Missing official intervening month; refusing an incomplete append'
  latest=order
for obs in raw:
 r=rows.get(obs['period'])
 if r is None:
  r=s.max_row+1;added.append(obs['period']);s.cell(r,1,obs['period'])
  for c in range(1,6):s.cell(r,c)._style=copy.copy(s.cell(r-1,c)._style)
 values=[obs['monthly'],obs['yoy'],obs['annual'],obs['yoy']-obs['annual']]
 for c,v in enumerate(values,2):
  old=s.cell(r,c).value
  equal=isinstance(old,(int,float)) and math.isclose(old,v,rel_tol=0,abs_tol=1e-10)
  if not equal:changes.append({'period':obs['period'],'column':c,'old_value':old,'new_value':v,'source_sha256':obs['source_sha256']});s.cell(r,c,v)
 s.cell(r,2).comment=openpyxl.comments.Comment('SCI official PDF: '+obs['source_url']+'; publication '+obs['publication_date_jalali'],'Source')
if not changes:
 print(json.dumps({'status':'already_current','last_period':raw[-1]['period'],'file_sha256':before},ensure_ascii=True));sys.exit(0)
# Preserve every earlier observation and all other existing columns.
temp=f.with_suffix('.pending.xlsx');w.save(temp);check=openpyxl.load_workbook(temp,data_only=True).active;assert check.max_row==old_row_count+len(added)
for obs in raw:
 row=next(t for t in check.values if t[0]==obs['period']);assert row[1:4]==(obs['monthly'],obs['yoy'],obs['annual'])
(temp).replace(f);after=hashlib.sha256(f.read_bytes()).hexdigest();(folder/'sci-revisions-raw.json').write_text(json.dumps(changes,ensure_ascii=False),encoding='utf-8')
prior_path=DATA_DIR/'sci-inflation-update.json'
prior=json.loads(prior_path.read_text(encoding='utf-8')) if prior_path.exists() else {}
sources=source['sources']
for item in sources:item['url']=item.get('url',item.get('source_url'))
meta={'status':'monthly_inflation_updated','file':f.name,'before_sha256':before,'after_sha256':after,'backup':str(folder/f.name),'updated_periods':list(dict.fromkeys(prior.get('updated_periods',[])+[t['period'] for t in raw])),'added_periods':added,'changed_cell_count':len(changes),'last_period':raw[-1]['period'],'sources':sources,'publication_date_jalali':raw[-1]['publication_date_jalali'],'checks':source['checks']};(DATA_DIR/'sci-inflation-update.json').write_text(json.dumps(meta,ensure_ascii=False),encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8');print(json.dumps(meta,ensure_ascii=False))
