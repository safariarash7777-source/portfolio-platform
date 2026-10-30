# P10.1 — رزرو reader/consumer metadata، پیش از تغییر کد

مبنای دقیق START-B: PR330@87aaa541618a26e4d7ba9756e62114c1279e6939. مبنای projection: PR343@5983e14e7444e8d94a4fc074dda142b3b0395374؛ فقط diff خالص آن نسبت به732be473 (projection/test/scopeddocs و ثبت همان آزمون) برداشته می‌شود، نه UI/admin338 یا lab339/347. sharedrefs فقط root؛ روی هیچ شاخه محصول دیگر نوشته نمی‌شود.

## رزرو انحصاری این برش

- `components/admin/ResearchHistoryPanel.tsx` و test آن: panel خواندنی، بدون action ثبت/مدل/worker، برای مصرف‌کننده مجاز موجود.
- `lib/intelligence/research-history-metadata.ts`: adapter خالص DTO metadata به projection343؛ بدون IO/body/note/prompt و بدون actor/UUID/زمان ساختگی.
- `lib/intelligence/workbook-store.ts`: فقط افزودن DTOmetadata در خروجی `openWorkbook` از همان all/reviews خوانده‌شده؛ authorize/failure/save/decide/recovery/freeze/intent/writer هیچ تغییر رفتاری ندارند. query تازه یا تغییر StoredVersion/StoredReview/SQL لازم نیست.
- `components/admin/ResearchWorkbook.tsx`: فقط statemetadata خواندن و اتصال panel؛ actionهای R2/save/recovery/intent/busy/unknown، شکل کاربرگ، نویسنده و Auth دست‌نخورده می‌مانند. آزمون‌های متناظر در ResearchWorkbook.test.ts و workbook-store.test.ts افزایشی‌اند؛ testهای B حذف/ضعیف نمی‌شوند.
- import projection343 و registry آن با حفظ کامل B؛ اگر هم‌پوشانی/تعارض package پیدا شد، patch محدود به root تحویل می‌شود، overwrite یا انتخاب ours/theirs نداریم. registrationهای B/runner اصلی محفوظ‌اند.
- `lib/intelligence/workbook-intent.integration.test.ts`: فقط assertion خواندنی panel پس از GET/reopen موجود B روی PG17 یک‌بارمصرف workflow فعلی؛ هیچ SQL/helper/setup/سناریوی نوشتن/فریز یا workflow و artifactcontract تغییر نمی‌کند. نه نصب و نه اجرای primary.

## قرارداد

openWorkbook ازقبل `store.versions(workbookId)` و سپس `store.reviews(all versionIds)` را می‌خواند. DTO نمایشی versions فعلی UUID/actor ندارد؛ این برش فقط UUID واقعاًموجود ردیف را در DTO metadata افزایشی جدا برمی‌گرداند. قید مشاهده‌شده B در آزمون independent version read اجازه افشای actor در پاسخ را نمی‌دهد؛ پس createdBy به DTO افزوده نمی‌شود و actorPolicy صریح not_exposed_by_read_contract است. adapter نیز actor تزریقی را نمی‌خواند؛ actorها null با علت not_in_contract می‌مانند و authorMatchesSession هرگز به هویت/نقش تبدیل نمی‌شود. reviews همان id/versionId/decision/reviewedAt واقعی را دارد. dataSource/scope ثابت و غیرحساس برای همان readconsumer داده می‌شود؛ زمان خواندن فقط اگر واقعاً تحویل شده موجود است، نه clock ساخته‌شده برای تکمیل تاریخچه.

projection منابعworker را not_supplied نگه می‌دارد؛ panel دفترهمه‌تحلیلگران/live/append-only یا نتیجه مدل/موفقیت انتقال نیست. بازبینی v1 به همانversionId می‌چسبد، حتی پس ازv2. نبود UUID/metadata/time از DTO قدیمی به شکاف پوشش تبدیل می‌شود، نه event ساخته‌شده. خطایread، نبودورودی، خواندنخالی و محتوی قبلی جدا هستند؛ در شکستopen نباید تاریخچه قبلی به پرونده درخواست‌شده نسبت داده شود. هیچ query برایpanel یا دانلود body برایتاریخچه اضافه نمی‌شود.

## آزمون و شرط پایان

adapter/panel: منبع/مرجع دقیق، v1reviewپسازv2، actor/timeunknown، worker=notsupplied، duplicate/conflict، no privatebody، error≠empty و legacyDTO gaps. openWorkbook: شمار همان خواندنversion/reviews، مجوزهای401/403/503، افزودنmetadata بدون تغییرpayloadقبلی/writer. actualcomponent: panel ازهمانGET موجود، بدونGET/POSTاضافی، readerror بدون stalehistory/emptyجعلی، بازیابیR2 وintent/freeze/unknown regressionهایB محفوظ. typecheck/lint وCIexacthead؛ هیچprimary/worker/lock/ledger/SQL/env/model/writeزنده اجرا نمی‌شود. P09 کامل پیش‌نیاز این برش نیست.
