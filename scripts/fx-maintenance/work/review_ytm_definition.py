"""Inspect official definition surfaces, exclude tables and all raw market records."""
from pathlib import Path
import hashlib,json,re
from lxml import html
P=Path(__file__).resolve().parent.parent
path=P/'work/source-discovery/ifb-ytm.html';raw=path.read_bytes();tree=html.fromstring(raw,parser=html.HTMLParser(encoding='utf-8'))
controls=[]
for element in tree.xpath('//*[@id]'):
    name=element.attrib['id']
    if any(token in name.lower() for token in ['historyexport','ytmhistory','ytmcacl','calcytm']):controls.append({'id':name,'tag':element.tag,'label':element.attrib.get('value') if element.tag=='input' and element.attrib.get('type') in ['button','submit'] else None})
report={'source_url':'https://www.ifb.ir/ytm.aspx','archived_document_sha256':hashlib.sha256(raw).hexdigest(),'controls':controls,'monthly_Pouya_compatible_method_verified':False,'note':'Existence of a history export control is not proof of benchmark identity, weighting or complete monthly periods.'}
(P/'docs/ops/fx-maintenance/ytm-source-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
