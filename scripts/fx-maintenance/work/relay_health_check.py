"""Audit the existing authenticated relay; consume cache, never call BrsApi."""
from pathlib import Path
import datetime as dt,hashlib,json,os,requests,math
ROOT=Path(__file__).resolve().parent.parent
HEALTH=ROOT/'work/liara-deploy-20260929/fx-dashboard/.data_health'
def configured_token(session):
    token=os.environ.get('IR_MARKET_RELAY_TOKEN') or os.environ.get('RELAY_TOKEN')
    for folder in [ROOT/'work/portfolio-site-latest',Path.home()/'Desktop/portfolio-platform-backup']:
        for name in ['.env.local','.env.production','.env']:
            file=folder/name
            if file.exists():
                for line in file.read_text(encoding='utf-8').splitlines():
                    if line.startswith(('IR_MARKET_RELAY_TOKEN=','RELAY_TOKEN=')):token=line.split('=',1)[1].strip().strip('"').strip("'")
    if token:return token,'configured_environment'
    auth=Path.home()/'.liara-auth.json'
    if not auth.exists():return None,'missing'
    # Exact read-only route used by the official Liara CLI env:list command.
    api_token=json.loads(auth.read_text(encoding='utf-8'))['accounts']['safariarash7777']['api_token']
    r=session.get('https://api.liara.ir/v1/projects/arsadata',headers={'Authorization':'Bearer '+api_token},timeout=(10,35));r.raise_for_status()
    return next((e['value'] for e in r.json()['project']['envs'] if e['key']=='RELAY_TOKEN'),None),'liara_project_environment'
def check():
    session=requests.Session();session.trust_env=False
    out={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'url':'https://arsadata.liara.run/debug','direct_brsapi_requests':0}
    try:
        token,origin=configured_token(session);out['credential_source']=origin
        r=session.get(out['url'],headers={'Authorization':'Bearer '+token} if token else {},timeout=(8,25));out['http_status']=r.status_code
        if r.status_code!=200:
            out['status']='authentication_required' if r.status_code==401 else 'relay_unavailable';return out
        d=r.json();legacy=d.get('brsapiLegacy',{});budget=legacy.get('budget',{});store=budget.get('store',{});transport=d.get('brsapiTransport',{});last=d.get('lastRefresh')
        out.update(status='debug_received',last_refresh=dt.datetime.fromtimestamp(last/1000,dt.timezone.utc).isoformat() if isinstance(last,(int,float)) else None,counts=d.get('counts'),brsapi_key_configured=bool(d.get('brsapiKeyConfigured')),warmed_up=bool(d.get('warmedUp')))
        out['sources']={k:{p:v.get(p) for p in ('ok','enabled','lastSuccessAt','lastFetchAt','status') if p in v} for k,v in d.get('sources',{}).items() if isinstance(v,dict)}
        out['transport']={k:transport.get(k) for k in ('enabled','scope','spacingMs','minStartGapMs','pending','sent')}
        out['quota']={'legacy_enforced':legacy.get('enforced') is True,'persistent_store_healthy':store.get('healthy') is True,'day':budget.get('day'),'hard_ceiling':budget.get('hardCeiling'),'soft_budget':budget.get('softBudget'),'persistent_store_errors':store.get('errors'),'counter_function_missing':'PGRST202' in str(store.get('lastError','')),'over_budget_passed':sum(x for x in legacy.get('overBudgetPassed',{}).values() if isinstance(x,(int,float))),'unmetered':legacy.get('unmetered')}
        issues=[]
        if not out['quota']['persistent_store_healthy']:issues.append('persistent_quota_store_unhealthy')
        if not out['quota']['legacy_enforced']:issues.append('legacy_quota_enforcement_disabled')
        if out['quota']['over_budget_passed']:issues.append('requests_sent_after_budget_rejection')
        if not transport.get('enabled') or transport.get('spacingMs',0)<50:issues.append('supplier_request_spacing_invalid')
        out['control_issues']=issues;out['provider_extra_requests_allowed']=not issues
        cached=session.get('https://arsadata.liara.run/market.json',headers={'Authorization':'Bearer '+token} if token else {},timeout=(8,25));cached.raise_for_status();body=cached.json();assert isinstance(body,dict)
        sha=hashlib.sha256(cached.content).hexdigest();folder=HEALTH/'relay-market';folder.mkdir(parents=True,exist_ok=True);doc=folder/(sha+'.json')
        if not doc.exists():doc.write_bytes(cached.content)
        sections={}
        for section in ['gold','currency','stocks','funds']:
            records=body.get(section,[]);assert isinstance(records,list)
            ids=[r.get('id') for r in records if isinstance(r,dict)]
            valid=sum(isinstance(r,dict) and isinstance(r.get('price'),(int,float)) and math.isfinite(r['price']) and r['price']>0 for r in records)
            sections[section]={'records':len(records),'finite_positive_price_records':valid,'duplicate_ids':len(ids)-len(set(ids)),'per_quote_trade_date_supplied':False}
        out['cache_snapshot']={'sha256':sha,'document':str(doc),'top_level_fields':list(body),'cache_refreshed_at':out['last_refresh'],'source_data_date':None,'per_quote_trade_dates_not_supplied':True,'section_checks':sections,'financial_values_exposed_to_model':False}
        out['status']='relay_verified_quota_attention_required' if issues else 'relay_verified'
    except (requests.RequestException,ValueError,KeyError,TypeError,AssertionError) as e:out.update(status='relay_unavailable',error_type=type(e).__name__)
    return out
def main():
    out=check();HEALTH.mkdir(parents=True,exist_ok=True)
    for path in [ROOT/'outputs/fx-existing-relay-check.json',HEALTH/'relay-health.json']:path.write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(out,ensure_ascii=True))
