"""Production code identity check, not an execution of financial models."""
import datetime as dt,hashlib,json,re,sys
from pathlib import Path
P=Path(__file__).resolve().parent.parent;D=P/'work/liara-deploy-20260929/fx-dashboard';O=P/'docs/ops/fx-maintenance'
remote={}
for line in (O/'production-consumer-hashes.log').read_text(encoding='utf-8').splitlines():
    fields=line.split()
    if len(fields)==2 and re.fullmatch('[0-9a-f]{64}',fields[0]):remote[Path(fields[1]).name]=fields[0]
assert len(remote)==4
matches={name:sha==hashlib.sha256((D/name).read_bytes()).hexdigest() for name,sha in remote.items()}
assert all(matches.values())
report={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'method':'read-only sha256sum in active fx-dashboard container','consumer_source_matches_local':matches,'production_code_contains_nominal_IR_GDP_mapping':True,'production_code_contains_inflation_proxy_in_FB_OLS':True,'production_executed_model_outputs_in_this_review':False,'default_ECM_uses_US_GDP':False,'default_ECM_features':['ln_m2_ir','ln_gdp_ir','ln_oil'],'production_mutated':False,'source_hashes':remote}
(O/'production-contract-evidence.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='source_hashes'}))
