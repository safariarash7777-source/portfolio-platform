import json,hashlib,sys,openpyxl
from pathlib import Path
import data_sources as ds
stage=Path(sys.argv[1]); annual=json.loads((stage/'metadata/annual-economic-update.json').read_text()); sci=json.loads((stage/'metadata/sci-inflation-update.json').read_text())
assert hashlib.sha256((stage/'annual.xlsx').read_bytes()).hexdigest()==annual['after_sha256']
assert hashlib.sha256((stage/'inflation.xlsx').read_bytes()).hexdigest()==sci['after_sha256']
current=Path('/data-health/annual-data')/annual['file']
assert hashlib.sha256(current.read_bytes()).hexdigest()==annual['before_sha256'],'Concurrent annual revision'
a=openpyxl.load_workbook(current,data_only=True)['Data'];b=openpyxl.load_workbook(stage/'annual.xlsx',data_only=True)['Data'];changes={(r,c) for r in range(1,a.max_row+1) for c in range(1,a.max_column+1) if a.cell(r,c).value!=b.cell(r,c).value};allowed={(r,c) for r in annual['allowed_rows'] for c in range(6,a.max_column+1) if isinstance(b.cell(2,c).value,(int,float)) and b.cell(2,c).value<=2025};assert changes and changes.issubset(allowed)
previous=Path('/app')/sci['file'];assert hashlib.sha256(previous.read_bytes()).hexdigest()==sci['before_sha256'];a=openpyxl.load_workbook(previous,data_only=True).active;b=openpyxl.load_workbook(stage/'inflation.xlsx',data_only=True).active;assert b.max_row==79
for r in range(1,76):
 for c in range(1,6):assert a.cell(r,c).value==b.cell(r,c).value
print(json.dumps({'status':'candidate_structure_verified','annual_changed_cells':len(changes),'new_monthly_periods':3}))
