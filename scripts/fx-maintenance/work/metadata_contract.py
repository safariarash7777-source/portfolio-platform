"""Normalize metadata collectors with object and list schemas explicitly."""
def normalize(value,script):
    if isinstance(value,dict):return value
    if isinstance(value,list) and all(isinstance(item,dict) for item in value):return {'script':script,'status':'metadata_received','series':value}
    return {'script':script,'status':'invalid_metadata_output','output_type':type(value).__name__}

LABELS={'check_existing_relay.py':'کنترل رله و سهمیه BrsApi','check_ifb_bonds.py':'دریافت و اعتبارسنجی اخزای فرابورس','cbi_tsd_catalog.py':'دریافت Excel رسمی بانک مرکزی','economic_release_check.py':'بررسی اسناد رسمی کلان','fetch_fred_metadata.py':'کنترل تعریف و واحد سری‌های آمریکا','macro_health.py':'بررسی پوشش واقعی ورودی مدل‌ها','audit_remaining_inputs.py':'بررسی ورودی‌های بازار و تاریخچه','publish_ifb_bonds.py':'انتشار جدول معتبر اخزا','publish_verified_fred.py':'انتشار snapshotهای رسمی آمریکا و نفت','fetch_sci_current.py':'دریافت PDF رسمی تورم مرکز آمار','apply_sci_inflation.py':'اصلاح فایل تورم با سند رسمی','publish_sci_inflation.py':'کنترل مدل و انتشار تورم','check_worldbank_gdp.py':'بررسی GDP و رشد سالانه آمریکا','apply_verified_us_gdp.py':'اصلاح تاریخچه GDP آمریکا','publish_annual_gdp.py':'کنترل و انتشار GDP آمریکا','check_additional_annual.py':'بررسی پنج سری سالانه با تعریف سازگار','apply_additional_annual.py':'اصلاح سری‌های سالانه','publish_additional_annual.py':'کنترل مدل و انتشار فایل سالانه'}
LABELS['validate_cbi_mapping.py']='کنترل نگاشت تعریف و واحد بانک مرکزی'

def display_status(status):
    if status in ('already_current','already_published','exports_received_mapping_pending','running'):return status
    if status in ('relay_verified_quota_attention_required',):return 'attention_required'
    if status in ('mapping_validation_failed_previous_mapping_retained','current_source_unavailable_previous_mapping_retained','catalog_received_exports_failed','validation_failed'):return 'failed'
    if status in ('failed','timed_out','invalid_metadata_output','official_bond_source_check_failed','official_source_check_failed','relay_unavailable','authentication_required'):return 'failed'
    return 'checks_finished'
