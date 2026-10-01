import datetime as dt
import json
import streamlit as st

def render(data_dir):
    status_labels={'configured':'آماده اجرا','running':'در حال اجرا','checks_finished':'بررسی پایان یافت','attention_required':'نیاز به بررسی خطا','exports_received_mapping_pending':'Excel رسمی دریافت شد؛ اتصال به مدل نیازمند تطبیق تعریف است','official_excel_received':'Excel رسمی دریافت شد','failed':'ناموفق','timed_out':'مهلت دریافت تمام شد','already_published':'بدون تغییر؛ نسخه منتشرشده یکسان است','already_current':'داده تغییری نکرده است','published_verified_fred':'داده معتبر منتشر شد'}
    with st.sidebar.expander('🤖 عامل اکنون چه می‌کند؟'):
        st.caption('بررسی اقتصادی هر پنج روز؛ اجرای Hermes به روشن بودن لپ‌تاپ وابسته است.')
        if st.button('بازخوانی وضعیت عامل',key='refresh_agent_status'):st.rerun()
        try:
            raw=(data_dir/'agent-status.json').read_bytes()
            report=json.loads(raw)
            try:receipt=json.loads((data_dir/'agent-status-publication.json').read_text(encoding='utf-8'))
            except (OSError,ValueError):receipt=None
            from maintenance_status import view
            state=view(report,raw,receipt)
            execution={'completed':'پایان یافت','completed_with_errors':'پایان یافت؛ بعضی مراحل ناموفق','failed':'ناموفق','running':'در حال اجرا','unknown':'اجرای فعال تأیید نشده'}
            sources={'checked':'آخرین بررسی موفق','degraded':'برخی منابع یا کنترل‌ها مشکل دارند','unknown':'نامشخص','stale_unverified':'بررسی عقب افتاده؛ سلامت فعلی تأیید نشده'}
            completeness={'incomplete':'ناقص؛ همه داده‌ها به‌روز نیستند','complete':'کامل','unknown':'نامشخص'}
            st.write('نتیجهٔ اجرا: '+execution.get(state['execution'],state['execution']))
            st.write('سلامت منابع: '+sources.get(state['source_health'],state['source_health']))
            st.write('کامل‌بودن داده‌ها: '+completeness.get(state['data_completeness'],state['data_completeness']))
            if state['next_run_at']:
                due=dt.datetime.fromisoformat(state['next_run_at'])
                st.caption('موعد بعدی: '+due.astimezone(dt.timezone(dt.timedelta(hours=3,minutes=30))).strftime('%Y-%m-%d %H:%M')+' · تهران')
            else:st.warning('موعد بعدی تأیید نشده است.')
            if state['overdue']:st.warning('موعد اجرا گذشته است؛ روشن بودن لپ‌تاپ و فعال بودن Hermes را بررسی کنید. داده‌ها دوباره بررسی‌شده محسوب نمی‌شوند.')
            if state['stale_running']:st.warning('گزارش در حال اجرا قدیمی است؛ فعالیت عامل تأیید نشده است.')
            if not state['publication_verified']:st.warning('تطبیق انتشار این گزارش تأیید نشده است؛ زمان آخرین ثبت را مبنا قرار دهید.')
            else:st.caption('انتشار همین نسخهٔ گزارش با checksum روی سرور تطبیق داده شد؛ این کنترل، تازگی داده‌ها را اثبات نمی‌کند.')
            status=report.get('status','unknown')
            st.write(status_labels.get(status,status))
            stamp=report.get('updated_at')
            if stamp:
                date=dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
                st.caption('آخرین ثبت: '+date.astimezone(dt.timezone(dt.timedelta(hours=3,minutes=30))).strftime('%Y-%m-%d %H:%M')+' · تهران')
                if status=='running' and (dt.datetime.now(dt.timezone.utc)-date).total_seconds()>1800:st.warning('گزارش اجرا قدیمی است؛ فعال بودن عامل تأیید نشده است.')
            labels={'economic_release_check.py':'دریافت اسناد رسمی','fetch_fred_metadata.py':'بررسی واحد و تعریف','macro_health.py':'بررسی ورودی مدل','audit_remaining_inputs.py':'بررسی بازار','publish_verified_fred.py':'انتشار آمریکا و نفت','check_worldbank_gdp.py':'بررسی GDP سالانه','apply_verified_us_gdp.py':'اصلاح Excel','publish_annual_gdp.py':'کنترل مدل و انتشار','cbi_tsd_catalog.py':'دریافت بانک اطلاعات بانک مرکزی'}
            for stage in report.get('stages',[]):st.write(labels.get(stage['stage'],stage['stage'])+': '+status_labels.get(stage.get('status'),str(stage.get('status'))))
            readiness=report.get('readiness')
            if readiness:st.caption('آمادگی: '+{'operational_with_data_gaps':'عامل اجرا می‌شود؛ برخی داده‌ها یا کنترل سهمیه نیازمند اصلاح‌اند','ready':'آماده','execution_failed':'اجرای نگهداری ناموفق بود'}.get(readiness,readiness))
            for issue in report.get('pending_descriptions',[]):st.warning(issue)
        except (OSError,ValueError,KeyError,TypeError):st.caption('گزارش اجرای عامل هنوز موجود نیست.')
        try:
            cbi=json.loads((data_dir/'cbi-tsd-health.json').read_text(encoding='utf-8'))
            st.markdown('[منبع رسمی بانک مرکزی](https://tsdview.cis.cbi.ir/single-data)')
            for series in cbi.get('series',[]):
                st.write(series['title']+' · '+series['frequency']+' · آخرین دوره دارای مقدار: '+str(series.get('last_observed_period','نامشخص')))
                st.caption('واحد: '+series['unit']+'؛ دریافت رسمی جدا از اصلاح فایل مدل ثبت می‌شود.')
            st.info('CPI بانک مرکزی با تورم مرکز آمار جایگزین نمی‌شود. دریافت Excel به معنی به‌روز شدن مدل‌ها نیست.')
            try:
                mapping=json.loads((data_dir/'cbi-model-mapping.json').read_text(encoding='utf-8'))
                binding_labels={'blocked_base_and_history_contract':'پایه و تاریخچه نیازمند تأیید','validated_separate_series':'سری مستقل معتبر؛ اتصال مدل انجام نشده','blocked_frequency_and_stock_definition':'دوره و تعریف موجودی نیازمند تأیید','rejected_currency_and_valuation_mismatch':'اختلاف ارز و تعریف ارزش‌گذاری','blocked_real_GDP_valuation_contract':'تعریف GDP مدل نیازمند تأیید','rejected_oil_only_scope_mismatch':'دامنه نفت و گاز با نفت تنها متفاوت است'}
                for entry in mapping.get('series',[]):
                    st.caption(entry['key']+' · نگاشت: '+binding_labels.get(entry['binding_status'],'نامشخص')+' · '+entry['binding_reason'])
                    if entry.get('provisional_periods'):st.caption('دوره‌های مقدماتی در منبع: '+'، '.join(entry['provisional_periods']))
            except (OSError,ValueError,KeyError):pass
        except (OSError,ValueError,KeyError,TypeError):pass

    with st.sidebar.expander('کنترل منابع اوراق و BrsApi'):
        try:
            relay=json.loads((data_dir/'relay-health.json').read_text(encoding='utf-8'))
            if relay.get('http_status')==200:
                st.success('اتصال احرازشدهٔ رله برقرار است.')
                st.caption('آخرین به‌روزرسانی کش: '+str(relay.get('last_refresh','نامشخص')))
            else:st.warning('دریافت رله در آخرین بررسی موفق نبوده است.')
            if relay.get('control_issues'):st.warning('شمارنده یا اجرای سقف سهمیهٔ BrsApi سالم نیست. عامل درخواست تازه به تأمین‌کننده نمی‌فرستد و از کش رله استفاده می‌کند.')
            st.caption('درخواست مستقیم این عامل به BrsApi: '+str(relay.get('direct_brsapi_requests',0)))
        except (OSError,ValueError,KeyError,TypeError):st.caption('گزارش کنترل رله هنوز موجود نیست.')
        try:
            ifb=json.loads((data_dir/'ifb-treasury/latest.json').read_text(encoding='utf-8'))
            st.write('اخزای فرابورس · آخرین معامله: '+ifb['last_trade_date'])
            st.caption('نمادهای معتبر: '+str(ifb['validated_instruments'])+'؛ جزئیات در زبانهٔ نرخ بهره واقعی.')
        except (OSError,ValueError,KeyError,TypeError):st.caption('جدول رسمی اوراق هنوز دریافت نشده است.')

    with st.sidebar.expander('آخرین اصلاح داده اصلی'):
        try:
            sci=json.loads((data_dir/'sci-inflation-update.json').read_text(encoding='utf-8'))
            st.success('تورم ماهانه، نقطه‌ای و سالانه مرکز آمار تا '+sci['last_period']+' در فایل اصلی اصلاح شد.')
            st.caption('انتشار رسمی: '+sci['publication_date_jalali'])
            st.markdown('[جدول رسمی مرکز آمار]('+sci['sources'][-1]['url']+')')
            annual=json.loads((data_dir/'annual-economic-update.json').read_text(encoding='utf-8'))
            for entry in annual['series']:
                st.write(entry['series']+' · آخرین دوره رسمی: '+str(entry['last_period'])+' · میلادی')
            st.warning('CPI و تورم سالانه آمریکا در منبع سالانه تا ۲۰۲۴ موجود است. مقدار غایب ۲۰۲۵ خالی مانده؛ CPI ماهانه FRED مستقل نمایش داده می‌شود. YTM و دیگر ورودی‌های تأییدنشده همچنان نیازمند دریافت رسمی‌اند.')
        except (OSError,ValueError,KeyError,TypeError):st.caption('رسید اصلاح داده هنوز منتشر نشده است.')
