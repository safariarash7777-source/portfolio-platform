"""Official treasury quotes, deterministic validation and immutable vintages."""
import datetime as dt,hashlib,json,math,re,time,os
from lxml import html
from lxml.etree import ParserError
import requests
from data_sources import _jalali_to_gregorian
from source_health import DATA_DIR,atomic_write
SOURCE='https://www.ifb.ir/ytm.aspx'
TABLE='ContentPlaceHolder1_grdytmforkhazaneh'
HEADERS=['ردیف','نماد','قیمت معامله شده هر ورقه','تاریخ آخرین روز معاملاتی','تاریخ سررسید','YTM','بازده ساده']
TRANSLATE=str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')
def number(text):
    text=text.translate(TRANSLATE).replace(',','').replace('%','').replace('/','.').strip();assert re.fullmatch(r'-?\d+(\.\d+)?',text)
    value=float(text);assert math.isfinite(value);return value
def date(text):
    match=re.fullmatch(r'(1[34]\d{2})[-/](\d{2})[-/](\d{2})',text.translate(TRANSLATE).strip());assert match
    return dt.date(*_jalali_to_gregorian(*map(int,match.groups())))
def parse(content,today):
    tree=html.fromstring(content,parser=html.HTMLParser(encoding='utf-8'));tables=tree.xpath('//table[@id="'+TABLE+'"]');assert len(tables)==1
    table=tables[0];assert [' '.join(c.itertext()).strip() for c in table.xpath('.//th')]==HEADERS,'Official schema changed'
    rows=table.xpath('.//tr[td]');records=[];excluded={};seen=set()
    def reject(reason):excluded[reason]=excluded.get(reason,0)+1
    for row in rows:
        cells=[' '.join(c.itertext()).strip() for c in row.xpath('td')];assert len(cells)==7
        symbol=cells[1].translate(TRANSLATE).replace('ي','ی').replace('ك','ک')
        # Numbered treasury issues are primary debt instruments, not stock block sub-tickers.
        if not re.fullmatch(r'اخزا\d+',symbol):reject('not_government_treasury');continue
        assert symbol not in seen,'Duplicate symbol';seen.add(symbol)
        traded=date(cells[3]);maturity=date(cells[4])
        if maturity<=today:reject('matured');continue
        if traded>today:reject('future_trade_date');continue
        if traded>=maturity:reject('invalid_maturity');continue
        if (today-traded).days>5:reject('stale_trade');continue
        price=number(cells[2]);published=number(cells[5]);simple=number(cells[6]);assert price>0 and 0<published<200 and 0<simple<200
        days=(maturity-traded).days;calculated=((1000000/price)**(365/days)-1)*100;calculated_simple=(1000000/price-1)*365/days*100
        if abs(calculated-published)>0.12 or abs(calculated_simple-simple)>0.12:reject('price_maturity_yield_mismatch');continue
        records.append({'symbol':symbol,'trade_date':traded.isoformat(),'maturity_date':maturity.isoformat(),'trade_price_rial':price,'published_ytm_percent':published,'computed_ytm_percent':calculated,'published_simple_percent':simple,'days_to_maturity':days})
    assert records,'No current mathematically verified treasury observations'
    latest=max(r['trade_date'] for r in records);basket=[r for r in records if r['trade_date']==latest]
    derived={'as_of':latest,'method':'equal_weight_mean_latest_trade_date_treasury_only','instrument_count':len(basket),'ytm_percent':sum(r['published_ytm_percent'] for r in basket)/len(basket),'official_aggregate':False,'historical_benchmark_replaced':False}
    return records,derived,{'source_table_rows':len(rows),'validated_instruments':len(records),'same_date_basket_count':len(basket),'last_trade_date':latest,'exclusions':excluded}
def ingest_capture(content,observed_at):
    checked=dt.datetime.now(dt.timezone.utc).isoformat();folder=DATA_DIR/'ifb-treasury';folder.mkdir(parents=True,exist_ok=True)
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date();records,derived,meta=parse(content,today)
    source_sha=hashlib.sha256(content).hexdigest();document=folder/(source_sha+'.html')
    if not document.exists():document.write_bytes(content)
    raw=json.dumps({'records':records,'derived_indicator':derived,'source_sha256':source_sha},ensure_ascii=False).encode('utf-8');sha=hashlib.sha256(raw).hexdigest();snapshot=folder/(sha+'.json')
    if not snapshot.exists():snapshot.write_bytes(raw)
    out=dict(meta,status='official_treasury_quotes_validated',checked_at=checked,source_url=SOURCE,source_sha256=source_sha,snapshot_sha256=sha,snapshot_file=snapshot.name,document_file=document.name,unit='annual_percent; prices IRR',definition='effective annual yield to maturity; sovereign zero-coupon treasury bills',annualization_days=365,publication_date=None,observed_at=observed_at,derived_indicator_method=derived['method'],historical_pouya_series_replaced=False,checks=['official table schema','treasury-only identity','Jalali calendar','no future trades','unmatured issues','freshness <=5 calendar days','published yields matched to price/maturity'])
    atomic_write(folder/'latest.json',out);atomic_write(DATA_DIR/'ifb-bond-health.json',out)
    import openpyxl
    workbook=openpyxl.Workbook();sheet=workbook.active;sheet.title='TreasuryYTM';keys=list(records[0]);sheet.append(keys)
    for record in records:sheet.append([record[k] for k in keys])
    workbook.save(folder/(sha+'.xlsx'))
    return out

def collect():
    checked=dt.datetime.now(dt.timezone.utc).isoformat();folder=DATA_DIR/'ifb-treasury';folder.mkdir(parents=True,exist_ok=True)
    attempts=[];deadline=time.monotonic()+60;session=None
    try:
        try:
            import truststore
            truststore.inject_into_ssl()
        except ImportError:pass
        session=requests.Session();session.trust_env=False
        for index in range(2):
            remaining=deadline-time.monotonic()
            if remaining<9:raise requests.Timeout('Bounded collection deadline')
            if index and os.name=='nt':session.proxies={'https':'http://127.0.0.1:2080'}
            r=None
            try:
                r=session.get(SOURCE,timeout=(8,min(5,remaining-8)),stream=True);r.raise_for_status()
                content=[];size=0
                try:
                    for chunk in r.iter_content(chunk_size=16384):
                        if time.monotonic()>deadline:raise requests.Timeout('Absolute collection deadline')
                        size+=len(chunk)
                        if size>8*1024*1024:raise ValueError('Official page size limit')
                        content.append(chunk)
                finally:r.close()
                payload=b''.join(content)
                attempts.append({'attempt':index+1,'status':'received'});break
            except requests.RequestException as error:
                if r is not None:r.close()
                attempts.append({'attempt':index+1,'status':'failed','error_type':type(error).__name__})
                if index==1:raise
                time.sleep(1)
        out=ingest_capture(payload,checked)
        out['attempts']=attempts
    except (requests.RequestException,AssertionError,ValueError,KeyError,TypeError,OverflowError,ParserError) as e:
        out={'status':'official_bond_source_check_failed','checked_at':checked,'source_url':SOURCE,'error_type':type(e).__name__,'attempts':attempts,'max_attempts_per_location':2,'previous_snapshot_retained':(folder/'latest.json').exists()}
        if (folder/'latest.json').exists():
            previous=json.loads((folder/'latest.json').read_text(encoding='utf-8'))
            out['retained_last_trade_date']=previous.get('last_trade_date');out['retained_snapshot_sha256']=previous.get('snapshot_sha256')
        atomic_write(DATA_DIR/'ifb-bond-health.json',out)
    finally:
        if session is not None:session.close()
    return out

def load_display():
    """Retain dated valid archive for display; stale never becomes current/model input."""
    try:
        meta,body=load_current()
        return dict(meta,stale=False,eligible_for_current=True),body
    except AssertionError:
        folder=DATA_DIR/'ifb-treasury';meta=json.loads((folder/'latest.json').read_text(encoding='utf-8'))
        path=folder/meta['snapshot_file']
        assert path.parent==folder and hashlib.sha256(path.read_bytes()).hexdigest()==meta['snapshot_sha256']
        body=json.loads(path.read_text(encoding='utf-8'))
        today=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date()
        last=dt.date.fromisoformat(meta['last_trade_date']);assert last<=today
        assert body['records'] and all(dt.date.fromisoformat(r['trade_date'])<=today for r in body['records'])
        return dict(meta,stale=True,eligible_for_current=False,age_days=(today-last).days),body
def load_current():
    folder=DATA_DIR/'ifb-treasury';meta=json.loads((folder/'latest.json').read_text(encoding='utf-8'));path=folder/meta['snapshot_file'];assert path.parent==folder and hashlib.sha256(path.read_bytes()).hexdigest()==meta['snapshot_sha256']
    body=json.loads(path.read_text(encoding='utf-8'));today=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date();assert 0<=(today-dt.date.fromisoformat(meta['last_trade_date'])).days<=5
    # A later render must not keep stale or newly matured issues just because the newest issue is fresh.
    body['records']=[r for r in body['records'] if 0<=(today-dt.date.fromisoformat(r['trade_date'])).days<=5 and dt.date.fromisoformat(r['maturity_date'])>today]
    assert body['records']
    latest=max(r['trade_date'] for r in body['records']);basket=[r for r in body['records'] if r['trade_date']==latest]
    body['derived_indicator'].update(as_of=latest,instrument_count=len(basket),ytm_percent=sum(r['published_ytm_percent'] for r in basket)/len(basket))
    meta=dict(meta,validated_instruments=len(body['records']),last_trade_date=latest,age_days=(today-dt.date.fromisoformat(latest)).days)
    return meta,body
if __name__=='__main__':print(json.dumps(collect(),ensure_ascii=True))
