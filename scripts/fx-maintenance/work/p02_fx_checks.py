"""Offline supplements to PR183 mapping: no fetch, model write or new data store."""
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

UTC=dt.timezone.utc

def aware(value):
    if value is None:return None
    parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None:raise ValueError('timezone_required')
    return parsed.astimezone(UTC)

def growth(current,previous,current_period,previous_period):
    """Missing/non-consecutive observations never manufacture annual growth."""
    if current is None or previous is None:return None
    if current_period!=previous_period+1:return None
    if not all(math.isfinite(v) and v>0 for v in (current,previous)):raise ValueError('invalid_observation')
    return (current/previous-1)*100

def annual_q4(rows):
    """Use only Q4, retain explicitly missing Q4; do not complete a year from Q3."""
    output={key[0]:None for key in rows}
    for key,value in rows.items():
        if key[1]==4:output[key[0]]=None if value is None else value/10
    return output

def complete_month_mean(year,monthly):
    values=[monthly.get((year,month)) for month in range(1,13)]
    return None if any(v is None for v in values) else sum(values)/12

def aligned_real_proxy(ytm,inflation,ytm_period,inflation_period,unit='annual_percent'):
    if unit!='annual_percent':raise ValueError('unit_mismatch')
    if ytm is None or inflation is None or ytm_period!=inflation_period:return None
    if not all(math.isfinite(v) for v in (ytm,inflation)):raise ValueError('invalid_observation')
    return ytm-inflation  # Retrospective difference, not Fisher exact or expectation.

def quote_guard(trade_date,maturity_date,checked_at,max_age_days=5):
    checked=aware(checked_at).astimezone(dt.timezone(dt.timedelta(hours=3,minutes=30))).date()
    trade,maturity=map(dt.date.fromisoformat,(trade_date,maturity_date))
    if trade>checked:return 'future_trade'
    if maturity<=checked:return 'matured'
    if trade>=maturity:return 'invalid_maturity'
    return 'stale' if (checked-trade).days>max_age_days else 'dated_quote_eligible'

def mapping_guard(entry,checked_at):
    """Classify existing mapping metadata; no approval inferred from schema checks."""
    from validate_cbi_mapping import CONTRACTS,clean,period
    contract=CONTRACTS[(entry['id'],clean(entry['frequency']))]
    issues=[]
    if entry['key']!=contract['key']:issues.append('series_identity_mismatch')
    for field in ['unit','base_year','binding_status','target']:
        if entry.get(field)!=contract[field]:issues.append(field+'_mismatch')
    if entry.get('calendar')!='Jalali':issues.append('calendar_mismatch')
    if not isinstance(entry.get('source_sha256'),str) or not re.fullmatch(r'[0-9a-f]{64}',entry['source_sha256']):issues.append('source_checksum_missing')
    if entry.get('report_generated_date_is_publication') is not False:issues.append('generation_is_not_publication')
    if entry.get('model_write_enabled') is not False:issues.append('unapproved_model_write')
    checked=aware(checked_at)
    if entry.get('publication_date') is not None:
        published=aware(entry['publication_date'])
        if published>checked:issues.append('future_publication')
    last=period(entry['last_period'],clean(entry['frequency']))
    from data_sources import _jalali_to_gregorian
    month=1 if len(last)==1 else last[1] if clean(entry['frequency'])=='ماهانه' else (last[1]-1)*3+1
    start=dt.date(*_jalali_to_gregorian(last[0],month,1))
    local_day=checked.astimezone(dt.timezone(dt.timedelta(hours=3,minutes=30))).date()
    if start>local_day:issues.append('future_observation_period')
    step=12 if len(last)==1 else 1 if clean(entry['frequency'])=='ماهانه' else 3
    next_month=month+step;next_year=last[0]+(next_month-1)//12;next_month=(next_month-1)%12+1
    end=dt.date(*_jalali_to_gregorian(next_year,next_month,1))-dt.timedelta(days=1)
    if end>local_day:issues.append('period_not_complete')
    return {'key':entry['key'],'metadata_validation':'PASS' if not issues else 'FAIL','issues':issues,'publication_time_status':'unknown' if entry.get('publication_date') is None else 'documented','source_period':entry['last_period'],'period_end_gregorian':end.isoformat(),'model_binding_status':entry['binding_status'],'model_write_enabled':False,'financial_model_approved':False}

def verify_archives(health,checked_at):
    """Read existing six archived Excel sources. Values remain inside this process."""
    import validate_cbi_mapping as existing
    old=existing.HEALTH;existing.HEALTH=Path(health).resolve()
    try:
        receipt=json.loads((existing.HEALTH/'cbi-tsd-last-valid.json').read_text(encoding='utf-8'))
        results=[];series={}
        for entry in receipt['series']:
            metadata,rows=existing.read(entry)
            results.append(mapping_guard(metadata,checked_at))
            series[metadata['key']]={key:value for key,value,_,_ in rows}
        annual=series['CBI_CPI_annual'];monthly=series['CBI_CPI_monthly']
        checks=[]
        for (year,),value in annual.items():
            mean=complete_month_mean(year,monthly)
            checks.append(mean is not None and math.isclose(mean,value,abs_tol=.15))
        q4=annual_q4(series['CBI_liquidity_quarterly'])
        gdp=series['CBI_GDP_constant1400_basic_price'];growth_checks=[]
        for (year,),value in gdp.items():
            previous=gdp.get((year-1,));derived=growth(value,previous,year,year-1)
            growth_checks.append(derived is None if previous is None else math.isfinite(derived))
        return {'status':'PASS' if len(results)==6 and all(r['metadata_validation']=='PASS' for r in results) and all(checks+growth_checks) else 'FAIL','checked_at':checked_at,'source_fetches':0,'sources':results,'CPI_full_year_mean_checks':len(checks),'CPI_full_year_mean_pass':all(checks),'GDP_consecutive_growth_contract_pass':all(growth_checks),'liquidity_missing_Q4_preserved':any(v is None for v in q4.values()),'all_model_bindings_disabled':True,'raw_values_emitted':False}
    finally:existing.HEALTH=old

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--health',required=True);parser.add_argument('--output',required=True);parser.add_argument('--checked-at',required=True)
    args=parser.parse_args();result=verify_archives(args.health,args.checked_at)
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'sources':len(result['sources']),'raw_values_emitted':False,'source_fetches':0}))
    raise SystemExit(0 if result['status']=='PASS' else 1)
