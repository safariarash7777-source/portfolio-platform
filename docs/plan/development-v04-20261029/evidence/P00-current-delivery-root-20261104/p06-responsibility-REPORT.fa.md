# تشخیص جاری Production؛ مسئولیت خرابی روشن‌تر شد، رفع کامل هنوز پذیرفته نیست

آخرین دستور آرش بر توقف توسعه و انتشارهای نامرتبط و تشخیص کل مسیر داده مقدم است. همین هماهنگ‌کننده مالک عملیات و این مرجع است؛ C مرور مستقل source را ادامه می‌دهد. P03/M1، P09R2، P14 و انتشارهای تازه متوقف‌اند؛ سرویس‌ها و زمان‌بندی‌های سالم خاموش نشده‌اند. هیچ درخواست مستقیم تشخیصی به BRSAPI، SQL write، restart، ارتقا یا هزینهٔ تازه در این بررسی انجام نشد.

**نتیجهٔ مسئولیت:** شاهد خرابی عمومی BRSAPI یا لیارا نداریم. دریافت بازار و نوشتن اسنپ‌شات فعال است. شکاف قطعی دفتر سهمیه در schema/rollout خودمان است؛ محدودیت دانلود و پوشش پذیرش کدال نیز در پردازش خودمان مشاهده شد. رد اعتبارسنجی لزوماً گزارش ناسالم یا bug نیست و برای عبور از آن گیت پایین آورده نمی‌شود. خطای Preview402 به همهٔ Production تعمیم ندارد.

[اجرای قبلی 41856505670](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/41856505670) یک بار و فقط‌خواندنی اجرا شد؛ observer5ec، attempt1. [رسید](p06-responsibility-passive-receipt.json)، [ZIP اصلی با digest مستقل](p06-responsibility-passive-artifact.zip)، [تطبیق مستقل](p06-responsibility-root-review.json) و [run readback](p06-responsibility-run-readback.json). سبزشدن workflow به معنی رفع داده یا پذیرش محصول نیست. نمونهٔ passive ساعت۱۸:۵۰تهران است؛ آخرین refresh۱۸:۴۶:۵۲ و storage۱۸:۴۶:۵۳. زمان دریافت با زمان قیمت/منبع متفاوت است.

| خانواده و منبع واقعی | شاهد فعلی | محل محدودیت و مسئول |
|---|---|---|
| سهام و صندوق؛ BRSAPI AllSymbols | ۷۶۴سهم/۳۴۵صندوق؛ received، ذخیره200؛ [SQLساعت۱۹:۵۵](p06-responsibility-storage-readback.json) اسنپ‌شات۱۹:۵۱:۵۲ هر۷family را تأیید کرد | دریافت و ذخیره در این نمونه‌ها فعال؛ clock مستقل قیمت و همهٔ صفحات هنوز پذیرش نشده؛ root/C |
| طلا، ارز و رمزارز؛ BRSAPI Gold_Currency | ۹طلا/۲۸ارز/۱۹رمزارز، received بدون retention/error در passive؛ تاریخچه طلا/ارز امروز | زمان quote از debug معلوم نیست؛ خرابی عمومی تأمین‌کننده مشاهده نشد؛ root/C |
| NAV و اطلاعات تکمیلی صندوق؛ BRSAPI Nav/Symbol | NAV:337cache/150updated/0failed؛ metadata:353cache/1updated/0failed | clock مستقل و coverage همهٔ صندوق‌ها از این قرارداد ثابت نمی‌شود؛ root/C |
| شاخص و اختیار؛ BRSAPI Index/Options | received؛۱۳۵۰اختیار؛ تعداد شاخص در قرارداد count معلوم نیست | نباید null را صفر دانست؛ [index_history](p06-responsibility-history-consumer-readback.json) تا۱۴۰۵-۰۸-۱۳؛ root/C |
| کدال؛ BRSAPI Announcement، فایل اصلی Codal | آخرین feed:6صفحه/120دیده/31matched/10download/4insert/6parseFailed؛ complete=false/download_limit | cap خودمان۱۰دانلود؛ cycle اخیر۱۸رد: ن۱۰ context1/scopeUnknown2/scopeUnsupported14، ن۳۰ layout1. فایل‌های ردشده باید مستقل تطبیق شوند؛ C/root |
| صورت‌های مالی ن۱۰ | [آخرین capture ذخیره‌شده](p06-responsibility-history-consumer-readback.json): فرو‌د، id10942،۱۳اکتبر۱۹:۴۱:۲۰UTC؛ دوره۲۰۲۵-۰۹-۲۲، انتشارnull | این بانک صورت مالی تازه را ثابت نمی‌کند؛ پذیرش scope/layout و مسیر reader باید حل شود؛ C/root |
| فعالیت ماهانه ن۳۰ | چهار رکورد12289–12292 در۱۸:۴۱:۵۳–۵۸تهران برایآواپزشک/شهر فرش/شتبریز/لخزر ذخیره شد؛ دوره‌ها قدیمی‌اند، انتشارnull | دریافت امروز مساوی دوره مالی امروز نیست؛ آخرین capture بانک≠چرخهٔ مالی کامل؛ C/root |
| تاریخچهٔ واقعی نمودار و NAV؛ symbol_history | [فولاد و اهرم](p06-responsibility-history-consumer-readback.json) تا۲۰۲۶-۱۱-۰۴، source=relay_eod؛ اهرم nav_toman دارد؛ EOD passive1093ردیف | تاریخچه محصول فعال در نمونه؛ مقایسهٔ همهٔ نمادها و API/صفحه هنوز باز؛ root/C |
| آرشیو نیم‌ساعته ir_market_history | gold/currency امروز؛ stocks/funds آخرین۱۵سپتامبر در پنجره۵۰۰۰ردیف | توقف آن دو خانواده عمدی و بدون consumer است؛ نمودار از symbol_history می‌خواند. فعال‌کردن جمع‌آوری موازی راه‌حل نیست |
| کالا و بورس کالا؛ ماژول‌های BRSAPI | commodity14ردیف؛ certificate11؛ physical امروز36ردیف accepted، روز قبل31رد از338 وcomplete=false | مجموع process، سهمیه واقعی حساب نیست؛ علت rejection روز قبل و نمایش همهٔ صفحات هنوز باز؛ C/root |
| کلان FX؛ SCI/CBI/FRED/Tindex | منبع مستقل از BRSAPI؛ [readback توقف SCI](p06-responsibility-fx-stop-readback.json) afterSHA786954…/مهر۱۴۰۵ | SCI پیش از رسیدن دستور توقف commit شد؛ بقیه publisherها شروع نشدند. نمایش تازه نهایی پذیرفته نیست؛ FX/root |

**هویت و دسترسی:** Liara control-plane از credential موجود GitHub پاسخ200 داد؛ current release6ad37ec877b9f9b4324de29e، READY، پایان۱۷اکتبر۱۳:۵۹:۵۴UTC. SUPABASE_URL درRAM دقیقاً با مقصد بررسی‌شده `/liara-preview` تطبیق شد؛ هیچ مقدار محیط/کلید منتشر نشد. commit کد release معلوم نیست؛ metadata برابر هویت فرایند نیست. 401ریشه backend چالش احراز هویت است، نه رد SSH. SSH مستقیم با known-host و identity موجود ساعت۱۹:۵۵ و۱۹:۵۷تهران موفق و DBقبل/بعد healthy/restart0 بود؛ helperقدیمیHTTP401 مسیر کنترلی جداست. ظرفیت پااس لیارا ازاینقرارداد معلوم نیست؛ نمونهٔ VPSقبلی را مصرف همان پااس حساب نمی‌کنیم.

**دفتر سهمیه:** clientEnabled=false، legacyEnforced=false، storeHTTP404/errors774 و overBudgetPassedAggregate19750، شمارندهٔ processاند. توابع lease/release در DBبررسی‌شده وجود نداشتند. remaining9000/used0 به دلیل storeناسالم **سهمیهٔ باقی‌مانده واقعی حساب نیست**. پس درخواست آزمایشی تازه به vendor، افزایش cap یا فعال‌کردن پرچم بدون migration/readback مجاز نیست. اقدام بعد C مرور migration/producer map موجود و root تطبیق مقصد، نقش، backup/restore و آماده‌سازی rollout همان بسته است؛ نصب/تنظیم زنده هنوز انجام نشده.

**حد پذیرش:** نمونه‌های دریافت مختلف و ذخیرهٔ جاری داریم، اما دوچرخهٔ طبیعی پیاپیِ تأییدشده تا API و صفحه نداریم؛ شکست را با نمونه‌های۱۰ثانیه‌ای یا سه snapshot غیرپیاپی نبسته‌ایم. [خواندن قبلی Production](p06-public-hop-production-preview.json) فولاد200 و [passiveجاری](p06-responsibility-passive-receipt.json) codal-list200/21ردیف را نشان می‌دهد؛ Preview2aa باSupabase402 مسیر جدا دارد. هیچ ادعای تازه‌بودن تمام ن۱۰، انتخاب بصری یا پذیرش مقصد STARTها وجود ندارد.

**سه تحویل بعدی در همین مأموریت داده:** ۱) root/C تطبیق migration و rollout موجود سهمیه با مقصد و پشتیبان قابل‌بازیابی، بدون فعال‌سازی شتاب‌زده؛ ۲) C/root تطبیق یک گزارش رسمی ردشده ن۱۰/ن۳۰ با scope/layout و همان parser، با حفظ null و گیت‌ها؛ ۳) root تطبیق دوچرخهٔ طبیعی پیاپیِ ذخیره و readback مصرف‌کنندهٔ Production، با ساعت دریافت و قیمت مستقل. تا رفع توقف کاربر feature/deploy نامرتبط ازسرگرفته نمی‌شود.

### سوابق پیش از دستور تمرکز؛ معیارهای بسته‌شده در دامنهٔ خود معتبرند

