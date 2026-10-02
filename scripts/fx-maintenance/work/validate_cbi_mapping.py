"""Validate the six archived CBI workbooks. Raw observations stay in Excel."""
import datetime as dt, hashlib, json, math, re, sys, warnings
from pathlib import Path
import openpyxl
warnings.filterwarnings('ignore',message='Workbook contains no default style')
P=Path(__file__).resolve().parent.parent;D=P/'work/liara-deploy-20260929/fx-dashboard'
HEALTH=(D/'.data_health').resolve()
sys.path.insert(0,str(D))
from source_health import atomic_write

def clean(value):return str(value).strip().replace('ي','ی').replace('ك','ک').replace('\u200c',' ')
MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
QUARTERS=['سه ماهه اول','سه ماهه دوم','سه ماهه سوم','سه ماهه چهارم']
CONTRACTS={
('3505fc25-6651-8f09-e063-4ceaa8c0b336','سالانه'):{'key':'CBI_CPI_annual','unit':'بدون واحد','title':'شاخص کل','path':['شاخص بهای کالاها و خدمات مصرفی(100=1400)'],'base_year':1400,'target':'Data!row4 → cpi_cbi / Data!row5 → infl_cbi','binding_status':'blocked_base_and_history_contract','binding_reason':'پایه تاریخچه قدیمی و تعریف تورم ردیف مدل تأیید نشده؛ CPI پایه ۱۴۰۰ به پایه قدیمی چسبانده نمی‌شود.'},
('3505fc25-6651-8f09-e063-4ceaa8c0b336','ماهانه'):{'key':'CBI_CPI_monthly','unit':'بدون واحد','title':'شاخص کل','path':['شاخص بهای کالاها و خدمات مصرفی(100=1400)'],'base_year':1400,'target':'CPI_Iran_CB (Google Sheet slot; currently not configured)','binding_status':'validated_separate_series','binding_reason':'CPI رسمی ماهانه بانک مرکزی مستقل معتبر است؛ با CPI مرکز آمار یا سری بازسازی‌شده مخلوط نمی‌شود.'},
('3505fc25-5fec-8f09-e063-4ceaa8c0b336','فصلی'):{'key':'CBI_liquidity_quarterly','unit':'هزار میلیارد ریال','title':'نقدینگی بر حسب عوامل موثر بر عرضه آن','path':['متغیرهای پولی و اعتباری/ نقدینگی'],'base_year':None,'target':'Data!row8 → m2_irr; row9 → m2_growth; M2_Iran monthly slot','binding_status':'blocked_frequency_and_stock_definition','binding_reason':'تقسیم بر ۱۰، همت تومان می‌سازد؛ فقط فصل چهارم می‌تواند موجودی پایان سال باشد. تعریف موجودی پایان سال در ردیف قدیمی مدل مستند نیست؛ فصل سوم و داده فصلی جای سال کامل یا ماهانه قرار نمی‌گیرد.'},
('3505fc25-6648-8f09-e063-4ceaa8c0b336','سالانه'):{'key':'CBI_GDP_current_basic_price','unit':'میلیارد ریال','title':'تولید ناخالص داخلی به قیمت پایه','path':['به قیمت های جاری'],'base_year':None,'target':'Data!row11 → gdp_usd','binding_status':'rejected_currency_and_valuation_mismatch','binding_reason':'GDP قیمت پایه به ریال، GDP قیمت بازار به دلار جاری نیست؛ نرخ تبدیل سالانه هم‌تعریف موجود نیست.'},
('3505fc25-665f-8f09-e063-4ceaa8c0b336','سالانه'):{'key':'CBI_GDP_constant1400_basic_price','unit':'میلیارد ریال','title':'تولید ناخالص داخلی به قیمت پایه','path':['به قیمت های ثابت سال 1400'],'base_year':1400,'target':'Data!row10 → gdp_growth; GDP_Iran_Real slot','binding_status':'blocked_real_GDP_valuation_contract','binding_reason':'رشد سطح ثابت ۱۴۰۰ با سال متوالی قابل محاسبه است؛ تعریف قیمت پایه در رشد قدیمی مدل مستند نیست و واحد سطح GDP با شاخص عمومی جایگزین نمی‌شود.'},
('3505fc25-5fb9-8f09-e063-4ceaa8c0b336','سالانه'):{'key':'CBI_oil_and_gas_exports','unit':'میلیون دلار','title':'صادرات نفت و گاز','path':['استاندارد شماره 4','صادرات'],'base_year':None,'target':'Data!row12 → oil_exports','binding_status':'rejected_oil_only_scope_mismatch','binding_reason':'جمع نفت و گاز جای نفت تنها یا حجم بشکه قرار نمی‌گیرد؛ تبدیل واحد این اختلاف دامنه را حل نمی‌کند.'}}

def period(text,frequency):
    text=clean(text)
    match=re.fullmatch(r'(1[34]\d{2})(?:-(.+))?',text)
    assert match,'Period schema changed'
    year=int(match[1]);tail=match[2]
    if frequency=='سالانه':assert tail is None;return (year,)
    values=MONTHS if frequency=='ماهانه' else QUARTERS
    assert tail in values,'Unrecognised period'
    return year,values.index(tail)+1

def read(entry,health=None):
    frequency=clean(entry['frequency']);contract=CONTRACTS[(entry['id'],frequency)]
    folder=Path(health).resolve() if health is not None else HEALTH
    path=folder/'cbi-tsd'/entry['id']/(entry['sha256']+'.xlsx')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],'Checksum mismatch'
    wb=openpyxl.load_workbook(path,read_only=True,data_only=True)
    try:
        sheet=wb.active
        assert clean(sheet['B4'].value)==frequency
        assert clean(sheet['B6'].value)==contract['title']
        assert clean(sheet['B8'].value)==contract['unit']
        source_definition=clean(sheet['B7'].value)
        assert all(clean(token) in source_definition for token in contract['path'])
        records=[];seen=set();blank=[];preliminary=[]
        for row in sheet.iter_rows(min_row=9,max_col=2):
            label,value=row[0].value,row[1].value
            if label is None:continue
            key=period(label,frequency);assert key not in seen;seen.add(key)
            if value is None:blank.append(clean(label));continue
            assert isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>0
            # Grey backgrounds are source-designated provisional observations.
            fill=row[1].fill
            if fill.patternType=='solid' and fill.fgColor.type=='rgb':
                color=fill.fgColor.rgb[-6:];rgb=[int(color[i:i+2],16) for i in (0,2,4)]
                if max(rgb)-min(rgb)<=3 and 0<rgb[0]<255:preliminary.append(clean(label))
            records.append((key,float(value),clean(label),row[1].coordinate))
        assert records
        assert [r[0] for r in records]==sorted(r[0] for r in records)
        meta={**contract,'id':entry['id'],'frequency':frequency,'source_sha256':entry['sha256'],'source_sheet':sheet.title,
              'source_period_column':'A9:A'+str(sheet.max_row),'source_value_column':'B9:B'+str(sheet.max_row),
              'definition_cell':'B7','unit_cell':'B8','calendar':'Jalali','source_definition':source_definition,
              'first_period':records[0][2],'last_period':records[-1][2],'observation_count':len(records),
              'missing_periods':blank,'provisional_periods':preliminary,'publication_date':None,
              'report_generated_date':str(sheet['B2'].value),'report_generated_date_is_publication':False,
              'status':'definition_and_snapshot_validated','model_write_enabled':False,
              'checks':['source checksum','sheet frequency/title/definition/unit','unique ordered Jalali periods','finite positive observed values','missing observations preserved']}
        return meta,records
    finally:wb.close()

def main():
    day=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).strftime('%Y%m%d')
    latest=D/'.data_health/cbi-tsd-health.json'
    receipt=json.loads(latest.read_text(encoding='utf-8'))
    if len(receipt.get('series',[]))!=6 or any(e.get('status')!='official_excel_received' for e in receipt.get('series',[])):
        print(json.dumps({'status':'current_source_unavailable_previous_mapping_retained','model_write_enabled':False}));return
    report={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_download_checked_at':receipt['checked_at'],'source_url':receipt['source'],'status':'mapping_completed_with_explicit_blocks','series':[],'model_files_changed':False}
    values={};output=openpyxl.Workbook();output.remove(output.active)
    for entry in receipt['series']:
        try:meta,records=read(entry)
        except (AssertionError,KeyError,ValueError,OSError) as error:
            report['series'].append({'id':entry.get('id'),'status':'validation_failed','error_type':type(error).__name__,'model_write_enabled':False});continue
        report['series'].append(meta);values[meta['key']]=records
        sheet=output.create_sheet(meta['key'][:31]);sheet.append(['Period_Jalali','Official_source_value','Unit','Source_cell','Source_sha256'])
        for key,value,label,cell in records:sheet.append([label,value,meta['unit'],cell,meta['source_sha256']])
    annual={r[0][0]:r[1] for r in values.get('CBI_CPI_annual',[])}
    monthly={r[0]:r[1] for r in values.get('CBI_CPI_monthly',[])}
    compared=[]
    for year,value in annual.items():
        months=[monthly.get((year,m)) for m in range(1,13)]
        if all(v is not None for v in months):compared.append({'year':year,'complete_months':12,'annual_mean_matches':math.isclose(sum(months)/12,value,abs_tol=.15)})
    report['sample_calculation_checks']={'CPI_annual_against_12_month_mean':compared,'quarter_to_annual_rule':'Q4 only; missing Q4 stays null','liquidity_unit_rule':'source thousand-billion IRR / 10 = trillion IRT (همت تومان)','growth_rule':'(current/previous-1)*100 only for consecutive complete periods','nominal_GDP_conversion':'rejected without currency/valuation bridge','oil_export_substitution':'rejected oil+gas versus oil-only'}
    # Inspectable examples with actual values are in Excel only, never stdout or the model metadata.
    example=output.create_sheet('Validation_examples');example.append(['Period','Source','Transformed','Formula','Check'])
    for year,entry in sorted(annual.items()):
        months=[monthly.get((year,m)) for m in range(1,13)]
        if all(v is not None for v in months):example.append([str(year),entry,sum(months)/12,'mean of 12 official monthly CPI observations',math.isclose(sum(months)/12,entry,abs_tol=.15)])
    quarters=values.get('CBI_liquidity_quarterly',[]);q4={r[0][0]:r[1] for r in quarters if r[0][1]==4}
    for year,value in sorted(q4.items())[-3:]:example.append([str(year),value,value/10,'1000 billion IRR / 10 = همت تومان',math.isclose(value/10*10,value,rel_tol=1e-12)])
    real={r[0][0]:r[1] for r in values.get('CBI_GDP_constant1400_basic_price',[])}
    for year,value in sorted(real.items())[-3:]:
        if year-1 in real:example.append([str(year),value,(value/real[year-1]-1)*100,'consecutive constant1400 basic-price GDP growth; derived, not published growth',True])
    report['annual_liquidity_complete_last_period']=max(q4) if q4 else None
    report['all_six_sources_validated']=len(values)==6
    report['annual_monthly_CPI_consistency']=bool(compared) and all(x['annual_mean_matches'] for x in compared)
    if not report['all_six_sources_validated'] or not report['annual_monthly_CPI_consistency']:
        report['status']='mapping_validation_failed_previous_mapping_retained'
        (P/'outputs/fx-cbi-mapping-validation-failure.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8')
    else:
        atomic_write(D/'.data_health/cbi-tsd-last-valid.json',receipt)
        output.save(P/'outputs'/('fx-cbi-validated-sources-'+day+'.xlsx'))
        atomic_write(D/'.data_health/cbi-model-mapping.json',report)
        atomic_write(P/'outputs/fx-cbi-model-mapping.json',report)
        lines=['# نگاشت شش Excel بانک مرکزی','', 'منبع: '+receipt['source'],'','این گزارش نتیجه بررسی فایل‌های ذخیره‌شده است. تاریخ تولید Excel تاریخ انتشار آمار نیست. داده مدل تغییر نکرده است.','', '| سری | جدول/ستون | تعریف، واحد و پایه | دوره واقعی | ورودی مدل و وضعیت |','|---|---|---|---|---|']
        for entry in report['series']:lines.append('| '+entry['key']+' | '+entry['source_sheet']+' / '+entry['source_value_column']+' | '+entry['source_definition']+'؛ '+entry['unit']+'؛ پایه '+str(entry['base_year'])+' | '+entry['first_period']+' تا '+entry['last_period']+' | '+entry['target']+'؛ '+entry['binding_status']+'؛ '+entry['binding_reason']+' |')
        lines.extend(['','## پذیرش محاسبات','', '- میانگین ۱۲ ماه CPI با شاخص سالانه رسمی برای هر پنج سال تطبیق دارد.' if report['annual_monthly_CPI_consistency'] else '- تطبیق CPI نیازمند بررسی است.', '- نمونه تبدیل نقدینگی و رشد GDP در فایل Excel ضمیمه است؛ ارقام وارد prompt نمی‌شوند.', '- آخرین سال دارای فصل چهارم نقدینگی: '+str(report['annual_liquidity_complete_last_period'])+'. فصل سوم ۱۴۰۴ جای سال کامل قرار نگرفت.', '- CPI ماهانه مستقل معتبر است؛ Google Sheet تنظیم نشده و اتصال به ورودی مدل ادعا نمی‌شود.', '- زمینه خاکستری منبع: GDP جاری/ثابت ۱۴۰۲ و ۱۴۰۳؛ صادرات نفت و گاز ۱۴۰۲ تا ۱۴۰۴ مقدماتی هستند.', '- ستون‌های مدل دارای قرارداد مبهم همچنان مسدود هستند. هیچ مقدار صفر، انتقال دوره، نرخ تبدیل ارز حدسی یا پیش‌بینی در تاریخچه واقعی درج نشد.'])
        (P/'outputs'/('fx-cbi-mapping-'+day+'.md')).write_text('\n'.join(lines),encoding='utf-8')
    output.close()
    print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':main()
