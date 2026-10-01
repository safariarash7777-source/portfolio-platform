"""Versioned replacement of the latest completed US annual GDP observations."""
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import zipfile
from lxml import etree as ET
sys.path.insert(0,str(Path(__file__).parent/'liara-deploy-20260929/fx-dashboard'))
import data_sources as ds
from source_health import DATA_DIR
import openpyxl

report=json.loads((DATA_DIR/'worldbank-gdp-check.json').read_text(encoding='utf-8'))
entries={item['series']:item for item in report['series']}
assert set(entries)=={'usa_gdp','usa_gdp_growth'}
assert all(item['status']=='definition_and_snapshot_validated' for item in entries.values())
observations={}
for name,item in entries.items():
    document=Path(item['document'])
    assert hashlib.sha256(document.read_bytes()).hexdigest()==item['sha256']
    observations[name]={int(row['date']):row['value'] for row in json.loads(document.read_text(encoding='utf-8'))[1]}
period=min(entries[name]['last_period'] for name in entries)
assert period<dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).year
level=observations['usa_gdp'][period]
prior=observations['usa_gdp'].get(period-1)
growth=observations['usa_gdp_growth'][period]
assert all(value is not None and math.isfinite(value) for value in [level,prior,growth])
assert level>0 and prior>0 and abs((level/prior-1)*100-growth)<0.02, 'GDP level/growth inconsistent'
workbook=Path(ds.EXCEL_PATH)
book=openpyxl.load_workbook(workbook)
sheet=book['Data']
assert '2015' in ' '.join(str(sheet.cell(18,col).value) for col in range(1,ds._FIRST_DATA_COL+1)), 'Original GDP base differs'
columns=[col for col in range(ds._FIRST_DATA_COL+1,sheet.max_column+1) if sheet.cell(2,col).value==period]
assert len(columns)==1, 'Unmatched annual calendar axis'
column=columns[0]
current_values=[sheet.cell(18,column).value,sheet.cell(17,column).value]
cached=openpyxl.load_workbook(workbook,data_only=True)['Data']
targets=[]
for col in range(ds._FIRST_DATA_COL+1,sheet.max_column+1):
    year=sheet.cell(2,col).value
    if not isinstance(year,(int,float)) or year>period:continue
    year=int(year)
    lv=observations['usa_gdp'].get(year);prev=observations['usa_gdp'].get(year-1);gr=observations['usa_gdp_growth'].get(year)
    if lv is not None and prev is not None and gr is not None:
        assert abs((lv/prev-1)*100-gr)<0.02, 'Historical GDP level/growth disagreement'
    for name,row,value in [('usa_gdp',18,None if lv is None else lv/1e9),('usa_gdp_growth',17,gr)]:
        old=cached.cell(row,col).value
        equal=(old is None and value is None) or (isinstance(old,(int,float)) and value is not None and math.isclose(old,value,rel_tol=1e-12,abs_tol=1e-12))
        if not equal:targets.append((name,row,col,year,value))
if not targets:
    print(json.dumps({'status':'already_current','series':['usa_gdp','usa_gdp_growth'],'official_period':period,'annual_excel_changed':False}))
    sys.exit(0)
stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
folder=DATA_DIR/'annual-revisions'/stamp;folder.mkdir(parents=True)
before=hashlib.sha256(workbook.read_bytes()).hexdigest()
backup=folder/workbook.name;shutil.copyfile(workbook,backup)
revision=[]
for name,row,col,year,value in targets:
    revision.append({'series':name,'official_period':year,'column':col,'calendar':'Gregorian','display_jalali_year':sheet.cell(3,col).value,
                     'old_value':cached.cell(row,col).value,'new_value':value,
                     'source':entries[name]['source'],'source_sha256':entries[name]['sha256'],
                     'source_last_updated':entries[name]['source_last_updated'],'publication_date':None,
                     'unit':entries[name]['unit'],'status':'actual','reason':'replace legacy unverified observation with official matching definition'})
temporary=workbook.with_name('annual-validated-'+stamp+'.xlsx')
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(workbook) as archive:
    book_xml=ET.fromstring(archive.read('xl/workbook.xml'))
    sheet_node=next(node for node in book_xml.findall('x:sheets/x:sheet',ns) if node.get('name')=='Data')
    rid=sheet_node.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    rels=ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    target=next(node.get('Target') for node in rels if node.get('Id')==rid)
    xml_path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
    tree=ET.fromstring(archive.read(xml_path))
    for record in revision:
        row=18 if record['series']=='usa_gdp' else 17
        address=openpyxl.utils.get_column_letter(record['column'])+str(row)
        cell=next(node for node in tree.findall('.//x:c',ns) if node.get('r')==address)
        for child in list(cell):
            if child.tag in ('{'+ns['x']+'}f','{'+ns['x']+'}v','{'+ns['x']+'}is'):cell.remove(child)
        cell.set('t','n')
        if record['new_value'] is not None:
            ET.SubElement(cell,'{'+ns['x']+'}v').text=repr(record['new_value'])
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED) as output:
        for member in archive.infolist():
            output.writestr(member,ET.tostring(tree,encoding='utf-8',xml_declaration=True) if member.filename==xml_path else archive.read(member.filename))
check=openpyxl.load_workbook(temporary,data_only=True)['Data']
original=openpyxl.load_workbook(backup,data_only=True)['Data']
changed_cells=[]
for row in range(1,sheet.max_row+1):
    for col in range(1,sheet.max_column+1):
        if original.cell(row,col).value!=check.cell(row,col).value:
            changed_cells.append((row,col))
assert set(changed_cells)=={(row,col) for name,row,col,year,value in targets}, 'Unexpected workbook changes'
for record in revision:
    row=18 if record['series']=='usa_gdp' else 17
    actual=check.cell(row,record['column']).value
    assert (actual is None and record['new_value'] is None) or math.isclose(actual,record['new_value'],rel_tol=1e-12)
(folder/'revisions-raw.json').write_text(json.dumps(revision,ensure_ascii=False),encoding='utf-8')
os.replace(temporary,workbook)
after=hashlib.sha256(workbook.read_bytes()).hexdigest()
metadata={'changed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
          'status':'annual_observations_updated',
          'series':['usa_gdp','usa_gdp_growth'],'official_period':period,'calendar':'Gregorian',
          'display_jalali_year':sheet.cell(3,column).value,'before_sha256':before,'after_sha256':after,
          'backup':str(backup),'raw_revision_file':str(folder/'revisions-raw.json'),
          'changed_cell_count':len(changed_cells),'future_assumptions_unchanged':True,'validation':'GDP level/growth agreement, exact row/column and other-cell preservation',
          'updated_periods':sorted({year for name,row,col,year,value in targets}),
          'gdp_observed_coverage':[min(y for y,v in observations['usa_gdp'].items() if v is not None),period],
          'growth_observed_coverage':[min(y for y,v in observations['usa_gdp_growth'].items() if v is not None),period],
          'missing_official_observations_kept_null':True,
          'source_last_updated':entries['usa_gdp']['source_last_updated'],'publication_date':None}
(folder/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
(DATA_DIR/'annual-update-latest.json').write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False))
