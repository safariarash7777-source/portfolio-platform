# P10.1 — reader و panel واقعیِ metadata در مسیر موجود

مبنا B330@87aaa541618a26e4d7ba9756e62114c1279e6939؛ projection/test از diff خالص343@5983e14 منتقل شده، بدون UI338 یا lab339/347. projection همان blob بازبینی‌شده343 است. ثبت دو آزمون projection/panel فقط افزایشی در test:core انجام شد؛ assert برابرماندن تمام اسکریپت‌ها/ورودی‌های B پس از حذف همین دو مسیر موفق بود. تعارض package یا انتخاب ours/theirs نداشتیم.

## مسیر مصرف

`/admin/research` → ResearchWorkbook موجود → GET موجود `/api/admin/intelligence/workbooks?id=<existing-workbook-id>` → authorize/getRole موجود → همان store.versions و store.reviews(allVersionIds) → historyMetadata افزایشی → adapter خالص → ResearchHistoryPanel.

پنل هیچ query/GET/POST جدیدی ندارد. داده فقط از همان پاسخ بازکردن یا خواندن مستقل recovery، پس از کنترل‌های قبلی B تحویل می‌شود. metadata فقط id/workbookId/version/createdAt نسخه و id/versionId/decision/reviewedAt بازبینی را دارد؛ نه body/title/note/private intake/prompt. UUID از ردیف واقعی می‌آید؛ DTO قدیمی بدون UUID به metadata_unavailable تبدیل می‌شود. actorPolicy=not_exposed_by_read_contract قید حریم خصوصی B را نگه می‌دارد: actorها null/not_in_contract، حتی با property تزریقی createdBy/reviewedBy. session-author boolean نه هویت است نه نقش. readAt و شروع/پایان چرخه واقعاً در این DTO نیستند و null می‌مانند؛ worker_state/worker_last_run=not_supplied.

بازبینی v1 با وجود v2 همان versionId/v1 را دارد. duplicate اقدام تازه نیست؛ conflict کنار می‌رود و شمارش می‌شود. نبود metadata، خطای خواندن، بارگذاری، نتیجه ثبت نامعلوم، metadata قدیمی پس از اعلان save/review و خواندن خالی از هم جدا هستند. خطایopen تاریخچه قبلی را به درخواست تازه نسبت نمی‌دهد و متن کاربرگ B حفظ می‌شود. receipt نوشتن بدون UUID read به رویداد تازه تبدیل نمی‌شود؛ برای تاریخچه تازه همان بازکردن موجود پرونده لازم است، بدون refresh خودکار.

## حفظ دامنه B

saveWorkbook/decide و باقی writer store نسبت به مبنا بایت‌به‌بایت برابرند. در component، canonical AST preparedMatches/restoreIntent/olderIntents/saveToServer/recoverSave/openFromServer/decide/startNew/importFile پس از حذف تنها setHistoryReadهای نمایش، دقیقاً با B برابر است؛ `B-READ-BOUNDARY.json`. R2/intent/freeze/absence/author-match/unknown/retry و ثبت آزمون‌های B حفظ‌اند. هیچ SQL/APIwrite/Auth/grant/worker/lock/ledger/model/env/primary تغییر یا اجرا نشده است. API route، query و store factory موجود تغییر ندارند؛ فقط DTO خروجی read افزایشی است.

## شواهد آزمون

- ۸۰ آزمون projection/panel/workbook: `npx --no-install tsx --test components/admin/ResearchHistoryPanel.test.tsx lib/intelligence/research-history.test.ts lib/intelligence/workbook-store.test.ts components/admin/ResearchWorkbook.test.ts`.
- ۱۱ رگرسیون API/private persistence: `npx --no-install tsx --test app/api/admin/intelligence/workbooks/route.test.ts lib/intelligence/p07-private-persistence.test.ts`؛ دو نگهبان registry نیز موفق‌اند.
- actual component host همان component/handler واقعی را با fixture سروری offline موجود B اجرا می‌کند؛ با initialWorkbookId فقط همان دوGETقبلی فهرست/بازکردن دیده شد، بدونGETسوم/POST. store test نیز دقیقاً یکcreateStore، یکversions و یکreviews(allids) را دید؛ نسخه/review خصوصی همانsourceبود. اینها native production acceptance نیستند و fixtureها deploy نشده‌اند.
- typecheck و lint scoped موفق؛ بازبینی React: panel بدونeffect/action/IO، دادهderived، importهایtype-only، sourceRefهایشکست‌پذیر/بدونbody، متنunknown و layout min-width/break-all برایUUIDها. تست/CI به جای پذیرش مرورگری احرازشده ادعا نمی‌شود.
- workflow native موجود B بدون تغییر، روی PostgreSQL17 یک‌بارمصرف اجرا می‌شود. به test reopen موجود فقط assertion خواندنی panel افزوده شد: UUIDv1 از همان openقبلی، reviewv1 پسازv2، actornull/workerنرسیده و صفرrequestاضافی. SQL/setup/writer/freeze/سناریوهایB دست‌نخورده‌اند. marker پالایش‌شده P10_NATIVE_METADATA_READ_CHECK در log دوprofile پس از پذیرش واقعی همانmetadata چاپ می‌شود. این آزمون محلی نصب یا اجرا نشده است؛ نتیجه فقط از CIexacthead گرفته خواهد شد، نه primary یا نشست واقعی.

## بازتولید مجاز پس از Preview دقیق

root با نشست مجاز موجود در همان `/admin/research` یک پرونده واقعاً ذخیره‌شده را با کنترل بازکردن فعلی باز کند؛ نیازی به ذخیره/ساخت نسخه/بازبینی تازه نیست. همان GET باید historyMetadata را با UUIDهای واقعی برگرداند. panel باید نسخه/review و زمان منبع و reference را همان‌طور نشان دهد، actor را نامعلوم و worker را not_supplied نگه دارد. بازکردن details مرجع یا resize موبایل/دسکتاپ نباید networkrequest بسازد. اگر readمسیرناموجود/خطا/DTOقدیمی بود همانunknown/error ثبت شود؛ برای سبزکردن Preview هیچcredential یاfixture/cookie/Authبه آن کپی نمی‌شود.

پذیرش runtime/نشست واقعی/داده واقعی/نمایش مرورگری هنوز جداست؛ این پیاده‌سازی کد consumer موجود را وصل می‌کند و به نصب primary یا append رخدادهای آینده مجوز نمی‌دهد. P10 append و دفتر همه تحلیلگران باز است؛ P09 کامل پیش‌نیاز شروع این برش نبود. مرجع مشترک فقط root است.
