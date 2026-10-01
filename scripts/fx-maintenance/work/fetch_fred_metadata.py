"""Read official series metadata only; do not print observations or prose notes."""
import concurrent.futures
import json
from pathlib import Path
import requests
from lxml import html

root=Path(__file__).parent/'liara-deploy-20260929/fx-dashboard/.data_health'
ids=['CPIAUCSL','M2SL','GDPC1','DFF','DCOILBRENTEU']
def fetch(sid):
    result={'series_id':sid,'source_url':'https://fred.stlouisfed.org/series/'+sid}
    try:
        session=requests.Session();session.trust_env=False
        response=session.get(result['source_url'],timeout=(12,30));response.raise_for_status()
        tree=html.fromstring(response.content)
        for label in ['Units:', 'Frequency:']:
            labels=tree.xpath('//*[normalize-space(text())=$label]',label=label)
            for node in labels:
                parent=node.getparent()
                text=' '.join(parent.itertext()).strip()
                if len(text)<350:
                    result[label.rstrip(':').lower()]=text
                    break
        result['metadata_verified']=all(k in result for k in ['units','frequency'])
    except requests.RequestException as e:result['error_type']=type(e).__name__
    return result
records=list(concurrent.futures.ThreadPoolExecutor(3).map(fetch,ids))
(root/'fred-series-metadata.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')
print(json.dumps(records,ensure_ascii=False))
