"""Offline definition diagnostics; only match counts and metadata leave the script."""
import ast,hashlib,json,math,sys
from pathlib import Path
import importlib.metadata as md
import openpyxl
P=Path(__file__).resolve().parent.parent;D=P/'work/liara-deploy-20260929/fx-dashboard'
sys.path.insert(0,str(D));sys.path.insert(0,str(P/'work'))
import data_sources as ds
from validate_cbi_mapping import read
receipt=json.loads((D/'.data_health/cbi-tsd-last-valid.json').read_text(encoding='utf-8'))
source={}
for entry in receipt['series']:
    meta,rows=read(entry);source[meta['key']]={key:value for key,value,_,_ in rows}
annual=ds.load_historical_excel_data().set_index('year_shamsi')
checks={}
def compare(name,pairs,absolute_tolerance=.15):
    checks[name]={'compared_periods':len(pairs),'matched_periods':sum(math.isclose(a,b,rel_tol=1e-4,abs_tol=absolute_tolerance) for _,a,b in pairs),'periods':[str(year) for year,_,_ in pairs],'mismatched_periods':[str(year) for year,a,b in pairs if not math.isclose(a,b,rel_tol=1e-4,abs_tol=absolute_tolerance)],'absolute_tolerance':absolute_tolerance,'relative_tolerance':1e-4,'numerical_match_is_provenance':False}
cpi=source['CBI_CPI_annual'];infl=[]
for key,value in cpi.items():
    year=key[0]
    if (year-1,) in cpi and year in annual.index and math.isfinite(annual.loc[year,'infl_cbi']):infl.append((year,float(annual.loc[year,'infl_cbi']),(value/cpi[(year-1,)]-1)*100))
compare('annual_inflation_vs_annual_mean_CPI_growth',infl)
q4={key[0]:value/10 for key,value in source['CBI_liquidity_quarterly'].items() if key[1]==4}
compare('liquidity_vs_Q4_in_همت_تومان',[(year,float(annual.loc[year,'m2_irr']),value) for year,value in q4.items() if year in annual.index and math.isfinite(annual.loc[year,'m2_irr'])],absolute_tolerance=1e-8)
compare('liquidity_growth_vs_consecutive_Q4',[(year,float(annual.loc[year,'m2_growth']),(value/q4[year-1]-1)*100) for year,value in q4.items() if year-1 in q4 and year in annual.index and math.isfinite(annual.loc[year,'m2_growth'])])
real=source['CBI_GDP_constant1400_basic_price']
compare('GDP_growth_vs_constant1400_basic_price',[(year[0],float(annual.loc[year[0],'gdp_growth']),(value/real[(year[0]-1,)]-1)*100) for year,value in real.items() if (year[0]-1,) in real and year[0] in annual.index and math.isfinite(annual.loc[year[0],'gdp_growth'])])
ratio=[]
for key,value in cpi.items():
    year=key[0]
    if year in annual.index and math.isfinite(annual.loc[year,'cpi_cbi']):ratio.append(float(annual.loc[year,'cpi_cbi'])/value)
checks['CPI_base_bridge']={'overlap_years':len(ratio),'constant_scale_supported':bool(ratio) and all(math.isclose(v,ratio[0],rel_tol=1e-4) for v in ratio),'official_rebase_bridge_verified':False}
functions={}
for name in ['models.py','data_sources.py','econometrics.py','app.py']:
    file=D/name;tree=ast.parse(file.read_text(encoding='utf-8'))
    functions[name]={node.name:{'start':node.lineno,'end':node.end_lineno} for node in ast.walk(tree) if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef))}
ytm=openpyxl.load_workbook(ds.YTM_PATH,read_only=True,data_only=True)
headers=[]
for row in ytm.active.iter_rows(min_row=1,max_row=4,values_only=True):
    headers.extend(value for value in row if isinstance(value,str) and not value.replace('.','').isdigit())
ytm.close()
deps={name:md.version(name) for name in ['streamlit','pandas','numpy','plotly','requests','openpyxl','lxml','statsmodels','arch','truststore']}
report={'status':'offline_contract_reviewed','checks':checks,'consumer_locations':functions,'legacy_YTM_headers':headers,'runtime':{'python':sys.version.split()[0],'local_packages':deps},'model_files_changed':False,'source_fetches':0}
out=P/'docs/ops/fx-maintenance';out.mkdir(parents=True,exist_ok=True)
(out/'contract-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':checks,'legacy_YTM_headers':headers,'dependencies':deps},ensure_ascii=False))
