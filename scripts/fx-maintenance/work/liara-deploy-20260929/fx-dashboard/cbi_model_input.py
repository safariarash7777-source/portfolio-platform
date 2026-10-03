"""Read-only official CPI input for existing monthly model; no legacy splice/write."""
import datetime as dt,hashlib,json,sys
from pathlib import Path
import pandas as pd

def snapshot_version(health):
    health=Path(health).resolve();pointer=health/'cbi-tsd-last-valid.json'
    try:
        raw=pointer.read_bytes();receipt=json.loads(raw)
        entry=next(e for e in receipt['series'] if e['id']=='3505fc25-6651-8f09-e063-4ceaa8c0b336' and e['frequency'].replace('ي','ی')=='ماهانه')
        source=health/'cbi-tsd'/entry['id']/(entry['sha256']+'.xlsx')
        return hashlib.sha256(raw).hexdigest()+':'+hashlib.sha256(source.read_bytes()).hexdigest()
    except (OSError,ValueError,KeyError,StopIteration):return 'unavailable'

def load_monthly(health):
    work=Path(__file__).resolve().parents[2]
    if str(work) not in sys.path:sys.path.insert(0,str(work))
    from validate_cbi_mapping import read,clean,period
    from data_sources import shamsi_month_to_gregorian_range
    health=Path(health).resolve()
    receipt=json.loads((health/'cbi-tsd-last-valid.json').read_text(encoding='utf-8'))
    entries=[e for e in receipt['series'] if e['id']=='3505fc25-6651-8f09-e063-4ceaa8c0b336' and clean(e['frequency'])=='ماهانه']
    assert len(entries)==1,'official_monthly_identity'
    meta,rows=read(entries[0],health=health)
    assert meta['key']=='CBI_CPI_monthly' and meta['binding_status']=='validated_separate_series'
    assert meta['base_year']==1400 and meta['unit']=='بدون واحد' and meta['calendar']=='Jalali'
    values={key:value for key,value,_,_ in rows}
    declared=set(values)|{period(label,'ماهانه') for label in meta['missing_periods']}
    first,last=min(declared),max(declared);records=[];index=[]
    for ordinal in range(first[0]*12+first[1]-1,last[0]*12+last[1]):
        year,month=ordinal//12,ordinal%12+1
        start,_=shamsi_month_to_gregorian_range(year,month)
        index.append(pd.Timestamp(start));records.append({'cpi':values.get((year,month),float('nan')),'jy':year,'jm':month})
    frame=pd.DataFrame(records,index=pd.DatetimeIndex(index))
    frame.attrs.update(source_kind='cbi_official',source_sha256=meta['source_sha256'],unit=meta['unit'],base_year=1400,calendar='Jalali',publication_date=None,source_period=meta['last_period'],source_download_checked_at=receipt.get('checked_at'),validated_readonly_input=True,legacy_model_write_enabled=False,provisional_periods=meta['provisional_periods'])
    return frame
