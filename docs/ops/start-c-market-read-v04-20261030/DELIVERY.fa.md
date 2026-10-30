# اصلاح مستقل زمان دریافت و زمان منبع در جزئیات نماد

مبنای دقیق: PR331@`4013c7c3e972e6b026e093d8dbf39d9df7776fc1`؛ ادامه روی همان شاخه، Preview پیش از main. مالکیت سه فایل کد/آزمون و همین ops توسط root تأیید شد. این تحویل، پیشنهاد پیشین SPEC و دو JSON تاریخی را به اصلاح معنادار تبدیل می‌کند؛ JSONها و WITNESS قبلی عمداً با بایت اصلی حفظ شده‌اند و وضعیت قدیمی آن‌ها بیانگر زمان تهیه است، نه وضعیت اجرای این اصلاح.

## رفتار نهایی

`SymbolLiveDetail` زمان دریافت معتبر ردیف را جدا ذخیره و با تاریخ و ساعت تهران در time/dateTime نمایش می‌دهد. قاعدهٔ موجود دریافت ۱۵دقیقه‌ای و تحمل ساعت دریافت ۱۲۰ثانیه ثابت‌اند. زمان مستقل منبع فقط با reuse مستقیم `sourceTime(date_update ?? date, time)` از helper موجود تعیین می‌شود. منبع ناقص/نامعتبر/آینده null می‌ماند؛ receipt یا now جای آن نمی‌نشیند. هر دو زمان مستقل‌اند؛ دریافت تازه اثبات تازگی قیمت یا اطلاعات منبع نیست. آستانهٔ قیمت یا تقویم معاملاتی جدیدی ساخته نشده و محاسبه/قیمت/تبدیل واحد تغییر نکرده است.

پاسخ فعلی واحد صریح ندارد. توضیح نمایش، ریال خام→تومان و EPS به ریال را صرفاً قرارداد موجود این بخش می‌نامد؛ آن را «واحد اعلام‌شدهٔ منبع» معرفی نمی‌کند. خطای خواندن و 404 همان شاخه‌های مجزای موجود می‌مانند؛ request یا retry اضافه نشده است.

فایل‌ها:
- `components/symbol/SymbolLiveDetail.tsx`: یک state برای زمان دریافت و دو ساعت مستقل با پیام حدود کیفیت.
- `components/market/b2-ui-render.test.ts`: آزمون fetch/effect/state همان TSX و startVisiblePoll واقعی با transport/clock/scheduler ایزوله؛ بدون شبکه/fixture در محصول.
- `app/symbol/[symbol]/page.test.ts`: فقط همان fixture دستی چهار-state، state پنجم receipt=null را می‌گیرد؛ منطق صفحه یا سایر caseها تغییر نکرد.

## آزمون و بازتولید

`npx --no-install tsx --test components/market/b2-ui-render.test.ts`: ۱۳pass (۷ آزمون جدید lifecycle)، صفرfail/skip.

`npx --no-install tsx 'app/symbol/[symbol]/page.test.ts'`: ۱۷pass، صفرfail/skip.

آزمون‌های جدید دریافت تازه با منبع ۵۳ساعته، منبع ناقص/نامعتبر/آینده و date_update نامعتبر، receipt ناقص/نامعتبر/خارج تحمل آینده، صفر/ناموجود، تعویض نماد و پاسخ دیرهنگام قدیم، failed poll در برابر 404 و لغو timer/listener/abort هنگام unmount را پوشش می‌دهند. قیمت خام 4210/4260 و EPS693 با تبدیل قبلی حفظ می‌شود. این متادیتای آزمون، شاهد ingest زنده نیست.

host موجود `components/admin/p07-component-test-host.ts` خواندنی بررسی شد؛ چون cleanup برگشتی useEffect را اجرا نمی‌کند و unmount ندارد، برای این lifecycle سازگار نیست. driver فقط در همان فایل آزمون ثبت‌شده قرار گرفت و helper/host محصول یا آزمایشگاه/route جدیدی ساخته نشد. اجرای TSX/effect/fetch/state و callbackهای startVisiblePoll واقعی است؛ reconciliation مرورگر/DOM یا نشست مجاز را ثابت نمی‌کند.

کنترل منفی بدون تغییر فایل محصول: همان آزمون جدید دریافت تازه/منبع قدیمی با بارگذاری source قبلی4013c7c در حافظه شکست خورد (۱fail موردانتظار، نبود زمان دریافت). نسخهٔ اصلاح‌شده می‌گذرد. preload آزمایش فقط در /tmp بود و وارد Git نشده است.

`npm run test:core`: ۲۰۶۵+۱۷+۶+۵pass، صفرfail/skip. typecheck، lint هدفمند، secret scan و diff-check گذشتند. package/registry/CI و source helpers تغییر نکردند. نتیجهٔ CI/Preview دقیق commit بعد از push در شرح PR331/رسید محلی ثبت می‌شود؛ موفقیت پیشین جای آن نیست.

## حدود داده و پذیرش

شاهد Production قبلی در `company-read.json` همچنان برای main f93dbdc و GET ساعت14:23UTC است؛ به Preview تازه یا وضعیت جاری بازار تعمیم داده نمی‌شود. زمان دریافت14:21:46Z و زمان منبع28اکتبر09:00:01Z مستقل‌اند. دادهٔ صندوق key=latest با جزئیات نماد key=symbol_details یکی نیست؛ مقصد/کیفیت جاری صندوق و پذیرش پنج صندوق واقعی UNKNOWN باقی است. PR337، فیلتر شرکت، helper/API/market-source و فایل‌های پژوهش تغییر نکردند.

workflow قبلی41071383088 با completion_marker_missing شکست خورد. همان شکست در source-dispatch.json محفوظ است؛ replay/dispatch تازه انجام نشد. آخرین ingest-job-success مالی UNKNOWN است. مدل/provider/collector/env/key/primarySQL/هزینه/نصب یا merge اصلی اجرا نشده است. پذیرش مرورگری واقعی همین Preview جداست و در این آزمایشگاه ادعا نمی‌شود.
