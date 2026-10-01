"""Download the currently linked SCI PDF with Windows trust, then validate tables outside model context."""
import os
from pathlib import Path
import requests,truststore,json,hashlib,subprocess,sys,re,datetime as dt
from lxml import html
sys.stdout.reconfigure(encoding="utf-8")
truststore.inject_into_ssl()
P=Path(__file__).resolve().parent.parent;H=P/'work/liara-deploy-20260929/fx-dashboard/.data_health'
try:
 s=requests.Session();s.trust_env=False;r=s.get('https://amar.org.ir/',timeout=(12,45));r.raise_for_status();tree=html.fromstring(r.content)
 links=[a.get('href') for a in tree.xpath('//a[@href]') if 'شاخص قیمت مصرف کننده' in a.text_content() and '/news/id/' in a.get('href','')];assert links
 from urllib.parse import urljoin
 url=urljoin('https://amar.org.ir/',links[0]).replace('http://amar.org.ir','https://amar.org.ir');r=s.get(url,timeout=(12,45));r.raise_for_status();tree=html.fromstring(r.content);body=tree.text_content()
 publication=re.search(r'تاریخ انتشار:\s*(\d{1,2})\s+([^\s]+)\s+(\d{4})',body);assert publication
 pdfs=[urljoin(url,a.get('href')) for a in tree.xpath('//a[@href]') if re.search(r'/shg\d{4}\.pdf',a.get('href',''))];assert len(pdfs)==1
 r=s.get(pdfs[0],timeout=(12,60));r.raise_for_status();assert r.content.startswith(b'%PDF')
 folder=H/'sci-validated';folder.mkdir(parents=True,exist_ok=True);sha=hashlib.sha256(r.content).hexdigest();doc=folder/(sha+'.pdf');doc.write_bytes(r.content)
 months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];pub=f'{publication[3]}/{months.index(publication[2])+1:02d}/{int(publication[1]):02d}'
 manifest={'document':str(doc),'source_url':pdfs[0],'source_page':url,'sha256':sha,'publication_date_jalali':pub};m=folder/'current-manifest.json';m.write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
 runtime=os.environ['FX_BUNDLED_PYTHON'];parsed=subprocess.run([runtime,str(P/'work/parse_sci_current_pdf.py'),str(m)],cwd=P,capture_output=True,text=True,encoding='utf-8',timeout=90)
 assert parsed.returncode==0,'Official PDF schema or calculation validation failed'
 print(parsed.stdout)
except (requests.RequestException,AssertionError,ValueError,KeyError,TypeError) as e:print(json.dumps({'status':'official_source_check_failed','error_type':type(e).__name__}));sys.exit(1)
