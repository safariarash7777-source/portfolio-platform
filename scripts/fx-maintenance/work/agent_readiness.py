"""Distinguish functioning maintenance, partial source coverage and failure."""
BAD={'failed','timed_out','invalid_metadata_output','official_bond_source_check_failed','official_source_check_failed','relay_unavailable','authentication_required','auth_required','unavailable_or_definition_unverified','source_unavailable','browser_challenge','official_source_not_verified','workbook_publication_date_unverified','no_separate_series_found_in_consumed_inputs'}
BAD.update({'export_failed','catalog_received_exports_failed','validation_failed','mapping_validation_failed_previous_mapping_retained','current_source_unavailable_previous_mapping_retained'})
def assess(reports):
    pending=[]
    for name,result in reports.items():
        if result.get('status') in BAD:pending.append(name)
        if any(x.get('status') in BAD for x in result.get('series',[]) if isinstance(x,dict)):pending.append(name)
    relay=reports.get('existing_relay',{})
    if relay.get('control_issues'):pending.append('brsapi_quota_controls')
    # Do not infer full coverage from healthy HTTP or a subset of updated models.
    pending.extend(['historical_YTM_continuity','Iran_annual_definition_mapping','interbank_separate_series'])
    descriptions=[]
    if 'brsapi_quota_controls' in pending:descriptions.append('رله متصل است؛ شمارندهٔ پایدار و اجرای سقف سهمیه نیازمند اصلاح است. عامل از کش استفاده می‌کند.')
    descriptions.append('YTM روزِ اخزا مستقل تأیید می‌شود؛ میانگین ماهانهٔ قدیمی هنوز تاریخچهٔ کامل جدید ندارد.')
    descriptions.append('برخی سری‌های سالانهٔ ایران و نرخ بین‌بانکی مستقل هنوز به جدول رسمی با تعریف سازگار متصل نشده‌اند.')
    source_failures=[name for name,result in reports.items() if result.get('status') in BAD or any(x.get('status') in BAD or x.get('status')=='export_failed' for x in result.get('series',[]) if isinstance(x,dict))]
    return {'readiness':'operational_with_data_gaps','source_health':'degraded' if source_failures or relay.get('control_issues') else 'checked', 'source_failures':source_failures,'data_completeness':'incomplete','pending_sources':list(dict.fromkeys(pending)),'pending_descriptions':descriptions,'all_data_current':False}
