# P02-FX → مالک بازار/رله: قرارداد metadata و سهمیه

۲ اکتبر ۲۰۲۶؛ پاسخ قابل‌ارجاع فایل به همکار P02. مصرف پیشین روز و مرز reset فعلی **UNKNOWN** هستند؛ این چت امروز provider یا DB/debug زنده را بررسی نکرده است. شواهد تاریخی PR178 نباید به baseline روز جاری تبدیل شوند.

## شواهد موجود و مرز اعتبار

- پایه budget PR178@`4ce06b3ffbd6b50125021faeb454fbf11c73b900`؛ release/runbook مالک لیارا در `docs/ops/RELEASE-brsapi-budget.md` روی همان شاخه. طبق سند، نصب واقعی/legacy enforcement/baseline/reset اثبات نشده بود. این چت counter یا transport تازه ندارد.
- تست183 Linux فقط snapshot/file/cache آزمایشی و network none است؛ وجود image در سرور نصب phase28 یا دو چرخه واقعی بازار را اثبات نمی‌کند.
- پیام مالک بازار، مبنای مشترک P00 را195@`31c44ab635b672b589b7833bcbc78b41d36f1e75` اعلام کرد؛ acceptance/migration آن با P00 است. تحویل FX مستقل روی183 است و باید به همان integration منتخب مصرف شود، نه بازسازی PR195 یا PR183.

## producer فعلی FX برای مصرف‌کننده

| producer موجود | metadata مرجع | معنی صحیح |
|---|---|---|
| source_health/TGJU | source_date، fetched_at، checked_at، stale، cached، status | تاریخ price با زمان دریافت/کنترل متفاوت است؛ شکست pointer/date قبلی را حفظ می‌کند؛ آخرین بررسی = تازگی قطعی نیست |
| ifb_bonds | last_trade_date، snapshot_sha256/file، instrument_count، derived_indicator_method، historical_pouya_series_replaced=false | quote اخزا و میانگین محاسباتی، benchmark رسمی یا YTM ماهانه Pouya نیست؛ مدل تاریخچه به آن splice نمی‌شود |
| cbi_tsd_catalog + validate_cbi_mapping | source_sha256، جدول/ستون، definition/unit/base/calendar/frequency، period، provisional/missing، publication_date، binding_status | download/Excel تولیدشده = release رسمی نیست؛ همه model_write_enabled=false تا قرارداد/تصمیم مصوب |
| maintenance_status و publisher | run_id، updated/finished، execution_result، source_health، data_completeness، schedule.next_run_at، receipt.sha256 | سه وضعیت مستقل؛ receipt bytes دقیق گزارش را نشان می‌دهد نه current data؛ موعد گذشته = unverified |

این‌ها فیلدهای موجودند؛ جدول ذخیره/شناسه ابزار/endpoint یا schema مشترک جدید در این شاخه ساخته نمی‌شود. ارجاع metadata version همان PR183 و digestهای آن است. پوشش بورس/NAV و shared client178 با مالک لیارا؛ FX-CBI/YTM با این چت.

دریافت اختیاری/bulk/live provider صفر؛ cadence Hermes محلی پنج‌روزه حفظ. نخستین اقدام زنده فقط پس از baseline قبلی روز/reset، نصب واقعی مشترک178 و دو چرخه مجاز طبق P02 است؛ فاصله درخواست به‌تنهایی quota نیست. sandbox P00 نیز نصب178 فرض نمی‌شود.
