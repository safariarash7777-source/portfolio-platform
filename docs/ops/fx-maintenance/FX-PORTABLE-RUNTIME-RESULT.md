# FX-PORTABLE-RUNTIME-RESULT — ۱ اکتبر ۲۰۲۶

## نتیجه

**PASS برای runtime محلی Windows با داده مصنوعی و اسناد عمومی آرشیوی.** این نسخه در worktree مستقل `codex/fx-portable-runtime-20261001` از پایه `4ce06b3ffbd6b50125021faeb454fbf11c73b900` اجرا شد. checkout و branch مالک لیارا و README مرکزی ویرایش نشدند. checkpoint و manifest همراه این سند قابل بررسی‌اند.

## پذیرش اجراشده

| کنترل | نتیجه و دامنه |
|---|---|
| bundle اولیه | SHA archive و ۹۷ فایل manifest پیش از import تطبیق شد؛ فقط دو مسیر مجاز وارد شدند |
| وابستگی و startup | Python و dependencyهای موجود واقعاً استفاده شدند؛ process Streamlit روی loopback، health و HTTP startup موفق |
| auth | AppTest: مهمان و رمز نادرست صفر تب؛ ورود با رمز مصنوعی تصادفی معتبر ۱۲ تب؛ HMAC معتبر/نامعتبر کنترل شد |
| ۱۲ تب | هر ۱۲ تب بدون exception رندر شدند؛ بورس با داده مصنوعی هم‌شکل و منابع آنلاین در وضعیت قطع؛ شاهد تازگی بازار نیست |
| پنل وضعیت | سه محور مستقل، بازخوانی، موعد عقب‌افتاده، receipt صحیح و رد bytes ناسازگار کنترل شد |
| اتصال data-health | junction فقط در worktree آزمایشی؛ شش Excel عمومی با hash و schema/واحد/دوره خوانده شدند |
| قطع IFB | دو تلاش محدود، حفظ bytes pointer، تاریخ و SHA قبلی؛ داده جایگزین ساخته نشد |
| انتشار آزمایشی | publisher واقعی با transport محلی شبیه‌سازی‌شده، bytes readback و receipt آزموده شد؛ SSH زنده نبود |
| template Hermes | root/interpreter از env؛ اجرا با child scriptهای stubbed و schedule مصنوعی؛ شکست مراحل وضعیت ناقص می‌دهد |
| شبکه | guard socket و DNS فقط loopback را می‌پذیرد؛ درخواست منبع پیش از خروج مسدود؛ upstream connection و پیام صفر |
| حفاظت ورودی | چهار workbook مصنوعی پس از UI و orchestration hash یکسان؛ hook فعال با mirror قبلی یکسان |
| روش اقتصادی | app/auth/models/econometrics/backtest با اصل hash یکسان؛ هیچ فرمول مالی اصلاح یا تأیید نشد |
| اسکن پروژه | scan-secrets.mjs روی ۹۹ فایل staged PASS؛ تشخیص همه secretها ادعا نمی‌شود |

## اصلاحات portable و شاهد شکست/موفقیت

۱. fallbackهای `data_sources.py` از Downloads دستگاه قبلی به مسیر سرویس تبدیل شد؛ env override حفظ شد. مسیر پیش‌فرض screener در `build_stock_analysis.py` نیز نسبت به HERE است. در literalهای Python بسته مسیر C:\Users یا C:/Users باقی نیست. مسیرهای تاریخی اسناد شاهد انتقال‌اند و تنظیم اجرایی نیستند.

۲. آزمون واقعی Excelهای CBI نخست FileNotFoundError داد: مسیر nested worktree + junction + UUID + SHA از حد مسیر ویندوز عبور می‌کرد، در حالی که فایل پس از resolve وجود داشت. `validate_cbi_mapping.read` و مسیر ROOT در `cbi_tsd_catalog` اکنون base data-health را resolve می‌کنند. همان آزمون پس از اصلاح هر شش فایل را خواند؛ نوشتن marker غیرمالی با archiver واقعی نیز موفق شد. تعریف/واحد/فرمول سری تغییر نکرد.

۳. network guard ابتدا loopback داخلی asyncio ویندوز را نیز می‌بست؛ guard آزمایشی به loopback محدود شد و upstream همچنان مسدود است. این اصلاح در harness است، نه سرویس زنده.

۴. .gitattributes محدود به دو مسیر بسته، bytes و line ending آزموده‌شده را در checkout حفظ می‌کند؛ checksum Git blob با manifest کنترل می‌شود. چهار سند metadata دارای blank line اضافی انتهایی پاک‌سازی شدند؛ فرمول/source مالی untouched است.

## محدودیت‌ها و گیت‌های باز

- runtime container لینوکس **NOT TESTED**: Docker محلی فعال است اما base immutable این سرویس در آن موجود نیست. image pull، انتقال از سرور یا دسترسی سرور انجام نشد. شناسه base در base-image-id.txt موجود است.
- اجرای واقعی child fetch/publish و job نصب‌شده Hermes انجام نشد؛ orchestration با stub صریح آزمایش شد. schedule پنج‌روزه و hook/model فعال تغییر نکردند.
- readback transport محلی، اثبات SFTP/نصب Production نیست. داده خام و secret و junction و outputs وارد Git نمی‌شوند.
- منابع آنلاین در این آزمون بسته بودند؛ پاسخ/تازگی همه بازارها، دانلود مرورگر، موبایل/تمام‌صفحه و ورود مدیر واقعی `/admin/fx` پذیرش نشده‌اند.
- D-FX-01/02 و سایر تصمیم‌های روش‌شناسی، تاریخچه هم‌تعریف YTM و گیت سهمیه/انتشار بازند. هیچ خروجی مالی این آزمون تأییدشده معرفی نمی‌شود.

## بازتولید و تحویل

`scripts/fx-maintenance/tests/README.md` تنظیم fixture و اجرای آفلاین را توضیح می‌دهد؛ `portable-runtime-evidence.json` metadata کنترل‌هاست. TRANSFER-MANIFEST قبلی هویت بسته **ورودی** است؛ PORTABLE-RUNTIME-MANIFEST.json هویت فایل‌های checkpoint اصلاح‌شده است. archive/receipt جدید خارج Git و SHA checkpoint جدا ثبت می‌شوند. هیچ merge، push، نصب زنده یا تغییر wrapper در این مأموریت انجام نشد.
