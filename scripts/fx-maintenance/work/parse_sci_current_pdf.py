import sys,json,re,math,pdfplumber,hashlib
from pathlib import Path
m=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));m['url']=m['source_url'];doc=Path(m['document']);assert hashlib.sha256(doc.read_bytes()).hexdigest()==m['sha256'];root=doc.parent.parent
months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];norm=lambda v:v.replace('ي','ی').replace('ك','ک');records=[]
with pdfplumber.open(doc) as pdf:
 assert '1400' in (pdf.pages[0].extract_text() or '')[:150],'Unmatched CPI base'
 tabs=pdf.pages[3].extract_tables();assert len(tabs)==4
 for t in tabs:assert len(t)==5 and len(t[2])==7 and t[2][6]=='روشک لک' and t[0][4]=='لک صخاش'
 def number(value):
  v=value.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')).replace('/','.').replace('٫','.').replace('−','-').strip();assert re.fullmatch(r'-?\d+(\.\d+)?',v);n=float(v);assert math.isfinite(n);return n
 for col in (5,4):
  header=norm(tabs[0][1][col]);year=re.search(r'1[34]\d{2}',header)[0];month=next(t for t in months if norm(t[::-1]) in header);vals=[number(t[2][col]) for t in tabs];assert vals[0]>0
  records.append({'period':month+' '+year,'cpi':vals[0],'monthly':vals[2],'yoy':vals[1],'annual':vals[3],'base_year':1400,'source_sha256':m['sha256'],'source_url':m['source_url'],'publication_date_jalali':m['publication_date_jalali']})
 assert abs((records[1]['cpi']/records[0]['cpi']-1)*100-records[1]['monthly'])<0.1
(doc.parent/'observations-raw.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8');metadata={'status':'official_tables_validated','publisher':'SCI','last_period':records[-1]['period'],'sources':[dict(m,periods=[r['period'] for r in records])],'checks':['national all-items','CPI base 1400','monthly CPI arithmetic','official PDF SHA256']};(root/'sci-inflation-validation.json').write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8');print(json.dumps(metadata,ensure_ascii=False))
