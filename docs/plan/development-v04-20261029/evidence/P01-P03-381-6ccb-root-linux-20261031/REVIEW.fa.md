# پذیرش محدود Linux خوانندهٔ عضو — 381/6ccb، ۳۱ اکتبر ۲۰۲۶

[PR381](https://github.com/safariarash7777-source/portfolio-platform/pull/381) · [اجرای واقعی Linux](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/41191680124) · [CI عادی](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/41191680083) · [بازبینی مستقل root](../P01-P03-381-6ccb-root-native-20261031.json)

کاندید `6ccb106ace4711be7359c7fc8c8d6ab33670f719`، tree=`ffbc97fc8a7aa639dd9025b4eecf4aeb92efd509`. کد محصول/SQL/package/lock عین خواننده `7b1f5c01c91812be9ee4aa82efb1d5ccdaff8ccc` است. mode مستقل legacy-diagnostic-v1 از همان Linux/GoTrue/PostgREST/Next/Chrome موجود استفاده کرد؛ reader699 و قبولی۲۷API/۱۱DOM پیشین retarget یا تکرار نشدند. full log رسمی native/Core/DB و هویت checkout را root مستقل خواند؛ هر۵job عادی و native موفق‌اند. این برش نسخهٔ محصول را روی primary نصب نکرده است.

## نتیجهٔ واقعی و مسیر بررسی

۱. [رسید اصلی GitHub](official-p03-legacy-diagnostic-receipt.json) را باز کنید؛ نسخهٔ ZIP آن هم بایت‌به‌بایت در این پوشه محفوظ است. digest رسمی artifact13039076280، CRC و سه hash کد Git را root مستقل تطبیق داد. [۱۱کنترل واقعی، ماتریس ACL و پاک‌سازی](successful-run-sanitized.json) جزئیات نتیجه را دارد.

۲. چهار حساب تازه فقط در owned tmpfs ساخته شد. مرورگر روی صفحهٔ موجود عضو، نخست getUser واقعی SDK و سپس SELECT دقیق هفت ستون با همان JWT تأییدشده فرستاد. ردیف خود عضوA=۱، ردیف عضوB برایA=۰، ردیف خودB=۱؛ شمارش دقیق برقرار بود.

۳. وضعیت منقضی، فعال و لغوشده در DOM همان صفحه درست تغییر کردند؛ منشأ متنی escape و «تأییدنشده برای این خدمت» ماند. حق خدمت NOT_CONNECTED و ثبت محصول بسته باقی ماند. مشاور برای عضو دیگر، قبل و بعد refresh هیچ GET تشخیص قدیمی نداشت.

۴. با SDK واقعی نصب‌شده، تغییر هویت و خروج، تشخیص و متن حساب قبلی را پاک کرد و GET دیرهنگام تازه‌ای نفرستاد. هیچ رویداد احراز جعلی، پاسخ HTTPساختگی یا patch محصول برای این پذیرش وجود نداشت. شمارش افشای داده به storage/URL و POST خودکار هر سه صفر؛ سه ردیف تاریخچهٔ قدیمی حفظ و تعداد ردیف مالی صفر بود. این صفر، جای آزمون موجودی غیرصفر/تغییر مبنا در [پذیرش پیشین375](../P03-375-1bf8-root-native-20261031.json) را نمی‌گیرد.

۵. پاک‌سازی هر۶منبع owned و توقف processهای Chrome/بستن context/حذف temp تأیید شد. هیچ حساب، حق یا دادهٔ آزمایشگاهی وارد محصول نشده است.

## شکست نخست و اصلاح دقیق

[اجرای نخست](first-run-failure-sanitized.json) در3fe/41191240155 پس از۲setup و پیش از سناریوهای خواننده متوقف شد: strict_grant_baseline. علت در sql/test/portfolio_precondition.sql:140–141 بود؛ این پیش‌نیاز قدیمی بعد از پروفایل explicit، defaultGRANTALL داشت و phase11 بعدها آن را به ارث می‌برد. این شکست را شکستAuth/RLSمحصول نمی‌خوانیم.

اصلاح فقط در driver آزمایش انجام شد: مشاهده ACLموروثی، REVOKEALL فقط از جدول entitlements همان tmpfs، بازخوانی نبود SELECT/DML و پاسخ403واقعی، سپس فقط SELECTauthenticated. در مشاهده واقعی قبل اصلاح anon/authenticated/service_role خواندن و نوشتن داشتند و PUBLICنداشت؛ پس ازREVOKEهمهfalse؛ پس ازGRANTفقطSELECTauthenticatedtrue. RLS=true،forced=false و hashهمه policyها ثابت ماند. SQL/schema/policy/defaultprivilegesجهانی و کد محصول تغییر نکردند. anonاینfixtureازکاتالوگprimaryمحدودتر است؛ نتیجه403یا[]بهprimaryتعمیم داده نمی‌شود.

## مرز تحویل و اقدام بعدی مسئول

این گیت SDK/RLS/DOM خواننده بسته شد، نه کل P01/P03/P14. نصب primary NOT_APPLIED، حق همین خدمت NOT_CONNECTED و پذیرش آرش UNOBSERVED است. مقصد آزمون tmpfs ایزولهٔ CI بود؛ لینک ورود عمومی برای حساب‌های نابودشده وجود ندارد. نتیجهٔ قابل بازکردن این تحویل رسیدهای بالا است.

B/root مونتاژ تجربهٔ عضو/مدیر با شرکت/صندوق را با حفظ آزمون‌های قدیمی و guardهای معنایی ادامه می‌دهند. مانع فنی مونتاژ، شش resolution package/config/docs و pin یک تغییر خواندنی install-native است؛ نسخهٔ سایه بررسی شده ولی هنوز در محصول اعمال نشده. root/A پشتیبان قابل بازیابی، reader پیش از writer، ظرفیت و نصب مقصد را جدا می‌بندند. مدت/قیمت/سهمیه خدمت از legacy consulting استنتاج نمی‌شود. main/Production، Preview، مدل، سرویس اصلی یا خرید/ارتقا در این برش تغییر نکردند؛ مبلغ CI موجود اندازه‌گیری نشده است.

فایل‌های رسمی بدون تغییر بایت و فایل‌های sanitized بدون rawlog/token/header/email/storage خصوصی ثبت شدند. موفقیتCI و رسیدِ قابل بررسی، پذیرش انسانی یا انتشار اصلی نیست.
