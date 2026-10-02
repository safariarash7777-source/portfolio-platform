"""Inspectable official treasury yields and honest aggregate provenance."""
import streamlit as st
import pandas as pd
def render():
    st.markdown('##### بازده تا سررسید اخزای دولتی — منبع رسمی فرابورس')
    try:
        from ifb_bonds import load_display
        meta,body=load_display();derived=body['derived_indicator']
        import json
        from source_health import DATA_DIR
        try:
            checked=json.loads((DATA_DIR/'ifb-bond-health.json').read_text(encoding='utf-8'))
            if checked.get('status')=='official_bond_source_check_failed':st.warning('آخرین تلاش دریافت منبع ناموفق بود؛ نسخهٔ معتبر قبلی با تاریخ معاملهٔ اصلی نمایش داده می‌شود.')
        except (OSError,ValueError):pass
        st.caption('آخرین معامله در منبع: '+meta['last_trade_date']+' · نرخ‌ها درصد سالانه · قیمت ورقه به ریال')
        if meta.get('stale'):
            st.warning('آخرین نسخهٔ معتبر آرشیوی نمایش داده می‌شود؛ کهنه یا سررسیدگذشته است و نرخ روز یا ورودی معتبر مدل نیست.')
        if meta.get('age_days',0)>0:st.warning('این نرخ مربوط به آخرین معاملهٔ ثبت‌شده است؛ '+str(meta['age_days'])+' روز از آن گذشته و نرخ لحظه‌ای نیست.')
        st.metric('میانگین محاسبه‌شدهٔ اخزای دارای تاریخ معاملهٔ یکسان',f"{derived['ytm_percent']:.2f}٪")
        st.caption(f"{derived['instrument_count']} نماد در میانگین هم‌وزن؛ محاسبهٔ داشبورد است و شاخص رسمیِ میانگین بازار نیست.")
        frame=pd.DataFrame(body['records'])[['symbol','trade_date','maturity_date','published_ytm_percent','published_simple_percent']]
        frame.columns=['نماد','آخرین معامله','سررسید','YTM رسمی (%)','بازده ساده رسمی (%)']
        st.dataframe(frame,width='stretch',hide_index=True)
        st.markdown('[مشاهدهٔ جدول رسمی و روش محاسبه در فرابورس]('+meta['source_url']+')')
        st.info('این جدول نرخ روزِ اوراق مشخص است. سری تاریخیِ میانگین ماهانهٔ Pouya تعریف و پوشش متفاوت دارد؛ برای ساختن ماه‌های مفقود، نرخ روز به آن اضافه نشده است. نرخ کوپن و نرخ بین‌بانکی نیز با YTM یکسان نیستند.')
    except (OSError,ValueError,KeyError,TypeError,AssertionError):
        st.warning('نسخهٔ قابل اعتبارسنجی اخزا موجود نیست؛ مقدار جایگزین یا نرخ روز ساخته نشد.')
