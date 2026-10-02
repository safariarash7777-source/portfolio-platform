# کتابخانه اجرایی مستقل P11

محدوده فقط این مسیر اختصاصی است؛ هیچ فایل مشترک Auth/feed/assistant و هیچ package/schema محصول تغییر نمی‌کند. قرارداد measurement.v0.1 همان قرارداد اصلی است؛ فایل measurement.mjs validator و سازنده رخداد immutable و حذف تکرار محدود دارد، نه collector یا دفتر canonical دوم. buildMeasurement فیلد ناشناخته/خصوصی را رد می‌کند و بی‌صدا حذف نمی‌کند. کلیدها باید از mapping مصوب سمت سرور آمده باشند؛ استفاده hash ساده شناسه واقعی عضو مجاز نشده است.

## receipt و پیگیری پشتیبانی

P08 در هماهنگی مستقیم نام p08.handoff.receipt.fixture.v0.1 و مرز مصرف را ACK کرد. [receipt.schema.json](receipt.schema.json) قرارداد fixture محدود و support.mjs مصرف‌کننده before/after + receipt است. publicationVersionRef به شکل opaque/null و transitionHash محدود به lineage همین فیلدهای مجاز اضافه شده‌اند؛ نوع پرونده، ذخیره سؤال، دفتر consent یا سیستم ticket جدید ایجاد نمی‌شود.

readAuthority باید از boundary معتبر مالک هویت/مجوز، subject/case/revision/consent جاری را پیش و پس از verifyReceipt برگرداند. verifyReceipt باید شاهد immutable همین انتقال و mapping معتبر case/subject/sourceRef را تأیید کند؛ boolean عمومی دریافت کافی نیست. callbackهای demo ساختگی‌اند و پذیرش Auth/RLS/receipt واقعی نیستند. environment غیرsynthetic در این نسخه رد می‌شود؛ collector و مشتری خاموش.

sourceRef به هر انتقال case+revision در mapping مصوب تعلق دارد؛ replay همان receipt همان eventId می‌دهد. received پس از رضایت/receipt به opened می‌رسد؛ assigned پاسخ نیست و closed حل نیست. فقط انتقال assigned→resolved معتبر با شاهد حل به resolved نگاشت می‌شود. tracking view فقط caseKey، state، revision و receiptAt دارد؛ firstHumanResponseAt و SLA فعلاً null هستند. این view از پرونده اصلی مشتق می‌شود و state آن را تغییر نمی‌دهد.

## اجرا و شاهد

```powershell
node --test docs/ops/product-plan-v0.1/p11/runtime/runtime.test.mjs
node docs/ops/product-plan-v0.1/p11/runtime/demo-support.mjs
```

Node موجود؛ بدون نصب dependency محصول، build سنگین، درخواست شبکه یا داده عضو. آزمون‌ها رفتار حریم داده، contract، تاریخ/نسخه، replay/conflict، receipt نامعتبر، revoke حین پاسخ و عدم افشای متن exception را می‌سنجند. support-demo.json نتیجه واقعی اجرای fixture با ساعت قطعی مصنوعی است، نه نمونه مشتری یا latency واقعی. schema/receipt با validator مستقل Python در مرحله تحویل تطبیق داده می‌شود.

اقدام بعدی P08: مصرف این port در harness آفلاین با قرارداد ACKشده و SHA ثابت؛ قبل ورود فایل مشترک، صاحب آن ACK دهد. اقدام بعدی P00: مسیر نهایی lib/measurement/p11 را تعیین و قرارداد mapping/نگهداری و authority server را تثبیت کند. صرف وجود کتابخانه گیت سفر محصول یا تصمیم عرضه را نمی‌بندد.
