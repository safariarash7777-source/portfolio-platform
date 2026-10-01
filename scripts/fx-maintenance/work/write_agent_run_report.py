"""Write a readable, metadata-only report for every consumed series."""
from pathlib import Path
import datetime as dt,json
LABELS={'cpi_sci':'CPI سالانه مرکز آمار','infl_sci':'تورم سالانه مرکز آمار در مدل سالانه','cpi_cbi':'CPI بانک مرکزی','infl_cbi':'تورم بانک مرکزی','m2_irr':'نقدینگی ایران','m2_growth':'رشد نقدینگی ایران','gdp_growth':'رشد اقتصادی ایران','gdp_usd':'GDP ایران به دلار جاری','oil_exports':'صادرات نفت ایران','usa_cpi':'CPI سالانه آمریکا','usa_infl':'تورم سالانه آمریکا','usa_m2':'پول گسترده آمریکا','usa_m2_growth':'رشد پول آمریکا','usa_gdp':'GDP واقعی آمریکا','usa_gdp_growth':'رشد GDP واقعی آمریکا','cpi_reconstructed':'CPI ماهانه بازسازی‌شده؛ غیررسمی','real_interest_monthly':'بهره واقعی ماهانه؛ دوره دارای مقدار واقعی'}
def write(reports,root,run_id,readiness):
    now=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).isoformat();rows=[]
    import sys
    sys.path.insert(0,str(root/'work/liara-deploy-20260929/fx-dashboard'))
    import data_sources as ds
    import pandas as pd
    historical=ds.load_historical_excel_data()
    annual_checked={item.get('series'):item for stage in ['us_annual_gdp_check','additional_annual_check'] for item in reports.get(stage,{}).get('series',[]) if item.get('status')=='definition_and_snapshot_validated'}
    for item in reports.get('macro',{}).get('series',[]):
        name=item['series'];verified=item.get('unit_definition_verified') is True
        status='تعریف/واحد تأیید شد؛ پوشش تاریخی طبق رسید' if verified else 'نیازمند تطبیق رسمی' if not item.get('derived') else 'محاسبه مشتق؛ شاخص رسمی نیست'
        consumed=item.get('last_period')
        if item.get('frequency')=='annual' and historical is not None and name in historical:
            valid=pd.to_numeric(historical[name],errors='coerce').notna()
            periods=historical.loc[valid,'year_shamsi'];consumed=str(int(periods.max())) if not periods.empty else None
        rows.append({'series':name,'label':LABELS.get(name,name),'last_consumed_period':consumed,'last_workbook_period':item.get('last_period'),'excluded_incomplete_or_forecast_years':item.get('incomplete_or_future_years',[]),'last_official_period':item.get('last_official_period',item.get('official_period')),'source':item.get('official_source'),'definition_units_verified':verified,'status':status})
        if name in annual_checked:
            rows[-1]['last_official_period']=annual_checked[name]['last_period']
            rows[-1]['source']=annual_checked[name].get('source',rows[-1]['source'])
    lines=['# گزارش اجرای عامل نگهداری داشبورد','',f'زمان تهران: {now}',f'شناسه اجرا: {run_id}','','## نتیجه','',f"آمادگی: {readiness['readiness']} — دادهٔ کاملِ همه سری‌ها تأیید نشده است.",'','## ورودی‌های واقعی داشبورد','','| سری | آخرین دوره مصرف‌شده | آخرین دوره رسمی تطبیق‌شده | وضعیت |','|---|---|---|---|']
    for item in rows:lines.append('| '+item['label']+' | '+str(item['last_consumed_period'] or 'نامشخص')+' | '+str(item['last_official_period'] or 'نامشخص')+' | '+item['status']+' |')
    lines.extend(['','## دریافت‌های این اجرا',''])
    for name,result in reports.items():lines.append('- '+name+': '+str(result.get('status','بررسی تکمیل شد')))
    lines.extend(['','## موارد باقی‌مانده','']+['- '+x for x in readiness['pending_descriptions']])
    lines.extend(['','دورهٔ مصرف‌شده از loader تاریخچهٔ واقعی مدل استخراج شد؛ ستون‌های پیش‌بینی ۱۴۰۵/۱۴۰۶ در این دوره‌ها قرار ندارند. تقویم سالانهٔ دوره مصرف‌شده شمسی است؛ دوره رسمی منابع آمریکا/بانک جهانی میلادی است. دریافت جدول رسمی بانک مرکزی با اتصال به مدل یکسان نیست. YTM روزِ فرابورس با میانگین ماهانهٔ تاریخی مخلوط نمی‌شود. سهمیهٔ BrsApi فقط از diagnostics کنترل می‌شود؛ درخواست مستقیم این عامل صفر است. اجرا وابسته به روشن بودن لپ‌تاپ و Hermes است.'])
    folder=root/'outputs/hermes-fx-runs'/run_id;folder.mkdir(parents=True,exist_ok=True);text='\n'.join(lines)+'\n';(folder/'report.md').write_text(text,encoding='utf-8');(root/'outputs/hermes-fx-agent-latest.md').write_text(text,encoding='utf-8')
    summary={'run_id':run_id,'checked_at_tehran':now,'readiness':readiness['readiness'],'all_data_current':False,'per_series':rows,'stage_results':{k:r.get('status','checked') for k,r in reports.items()},'pending_descriptions':readiness['pending_descriptions'],'report_file':str(folder/'report.md')}
    (folder/'summary.json').write_text(json.dumps(summary,ensure_ascii=False),encoding='utf-8')
    return summary
