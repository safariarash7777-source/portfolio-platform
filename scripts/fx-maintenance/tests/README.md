# آزمون runtime قابل انتقال — Windows، آفلاین

ورودی‌ها فقط در پوشه خارج Git قرار می‌گیرند. `runtime_acceptance.py` داده مدل مصنوعی می‌سازد؛ از فایل بورس معرفی‌شده فقط header شیت‌های صنایع/سهام/سکتورها را می‌خواند. خروجی مالی هیچ‌جا چاپ نمی‌شود. ارقام مصنوعی، تاریخچه واقعی یا تأیید مدل اقتصادی نیستند.

## آماده‌سازی

1. Python محیط محلی با نسخه‌های `docs/ops/fx-maintenance/constraints.local.txt` و dependencyهای موجود معرفی شود؛ نصب/pull خودکار وجود ندارد.
2. `FX_TEST_FIXTURES` به پوشه موقت آزمایشی خارج Git؛ `FX_TEST_BOURSE_SCHEMA` به Excel صرفاً برای خواندن schema؛ `FX_BUNDLED_PYTHON` به Python runtime موجود اشاره کنند.
3. فایل‌های عمومی آرشیوی `cbi-tsd/` و `cbi-tsd-health.json` در `FX_TEST_FIXTURES/health/` با SHA اصلی کپی شوند. هیچ config/private key یا cron واقعی کپی نشود.
4. پوشه `.data_health` سرویس **همین worktree** به `FX_TEST_FIXTURES/health` junction شود؛ مسیر منبع/مقصد پیش از ایجاد بررسی شود. پوشه زنده جایگزین نشود.
5. از Python معرفی‌شده `tests/runtime_acceptance.py` اجرا شود. stdout/stderr کامل در فایل خصوصی خارج Git نگه‌داری شود؛ فقط `runtime-result.json` حاوی metadata به evidence منتقل شود.

## دامنه آزمون

- AppTest واقعی: مهمان، رمز نادرست، رمز آزمایشی معتبر، هر ۱۲ تب و تازه‌سازی وضعیت.
- اعتبارسنجی شش Excel عمومی و junction؛ قطع IFB با دو تلاش محدود و حفظ pointer/date؛ سه محور وضعیت، عقب‌افتادگی و رد receipt ناسازگار.
- publisher واقعی با **transport محلی شبیه‌سازی‌شده** و بازخوانی bytes؛ SSH/Production آزمایش نمی‌شود.
- template Hermes با child scriptهای stubbed و schedule مصنوعی اجرا می‌شود؛ دریافت واقعی، اجرای زنده child scriptها و job نصب‌شده آزمایش نمی‌شوند.
- process واقعی Streamlit روی loopback، health و HTTP startup؛ child process با `network_guard/sitecustomize.py` فقط loopback و DNS محلی را می‌پذیرد.
- پنل‌های مبتنی بر منابع آنلاین در حالت قطع منبع بررسی می‌شوند؛ این آزمون تازگی/کامل‌بودن داده بازار یا پذیرش `/admin/fx`، موبایل و مرورگر سایت اصلی را اثبات نمی‌کند.

`network_guard` فقط از طریق PYTHONPATH در process آزمایشی فعال می‌شود؛ در runtime زنده قرار نگیرد. داده/گزارش/رمز مصنوعی بیرون Git باقی می‌مانند؛ outputs و data-health ignored هستند.
