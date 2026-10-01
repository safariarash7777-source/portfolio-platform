import hashlib
import json
from pathlib import Path
import data_sources as ds
import fred_snapshot
root=Path(ds.__file__).parent
result={'series':{},'code':{},'data':{}}
for sid in sorted(fred_snapshot.SERIES):
    observations=fred_snapshot.load(sid)
    result['series'][sid]={'sha256':observations.attrs.get('sha256'),
                            'last_period':observations.attrs.get('last_period'),
                            'rows':len(observations), 'stale':observations.attrs.get('stale')}
for name in ['app.py','data_sources.py','macro_health.py','economic_release_check.py','fred_snapshot.py']:
    result['code'][name]=hashlib.sha256((root/name).read_bytes()).hexdigest()
for path in [ds.EXCEL_PATH,ds.INFLATION_PATH,ds.YTM_PATH,ds.BOURSE_PATH]:
    result['data'][Path(path).name]=hashlib.sha256(Path(path).read_bytes()).hexdigest()
print(json.dumps(result,ensure_ascii=True))
