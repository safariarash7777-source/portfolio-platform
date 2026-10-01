# پذیرش مستقل محدود ترکیب feed185 و market187

**نتیجه: ۳۹ PASS، صفر FAIL و صفر BLOCKED در دامنهٔ محدود این ترکیب.** این نتیجه پذیرش کامل DEV-07، ادغام یا اجازهٔ انتشار Production نیست.

نسخهٔ واقعی برنامه: `be7b7230a50d0f16aba18b408829ccd7f85f1299`؛ محیط `followup06-feed-market-native-local`؛ نشانی محلی `http://127.0.0.1:3399`. اجرای واقعی از `2026-10-01T20:33:09.771Z` تا `2026-10-01T20:44:15.518Z`. بازبین `/root/limited_independent` سازندهٔ ترکیب نیست. [manifest](app-manifest.json) و [گزارش ماشینی تمام مشاهدات](independent.json). پذیرش ۳۸ موردی پیشین PR186 سابقهٔ مستقل و محفوظ است و به این نسخه نسبت داده نشده است.

ورود A، B و admin از فرم واقعی UI به GoTrue بومی انجام شد؛ پاسخ token فقط از نظر وضعیت مشاهده شد. نشست واقعی ذخیره‌شده توسط SDK فقط در حافظه برای REST/RPC استفاده شد. هیچ JWT، cookie یا storageState تزریق نشد و Auth بومی رهگیری یا جایگزین نشد. اطلاعات ورود فقط در پوشهٔ خصوصی ACL باقی مانده است.

## شواهد نصب و حفاظت محیط

[نصب ۱۸ فایل SQL بومی](environment.json)، [کاتالوگ واقعی محیط](environment-verification.json) و [کنترل مستقل hash، RLS و محرمانگی](independent-integrity.json) موجود است. زنجیرهٔ phase32→phase34→phase35→phase36→phase37→phase38→NEXT04→NEXT08→Auth180→feed185 فقط در دیتابیس مستقل ساختگی نصب شد. RPC از UI/REST واقعی اجرا شد؛ کاتالوگ جای شاهد رفتار را نگرفت. کنترل پایانی: ۳ کاربر Auth، ۳ شیء Storage، صفر نسخهٔ هویت، ۳ رسید خواندن، ۶ نسخهٔ مالی، ۶ ردیف دارایی و ۲ ردیف بدهی. جدول‌های خصوصی RLS دارند و رسید FORCE RLS دارد؛ anon/authenticated هیچ SELECT مستقیم ندارند. ساعت سرور به صفر و fault به {} بازگشت؛ upstream واقعی صفر بود.

## نتایج تازه روی همین SHA

| گروه | PASS | FAIL | BLOCKED | شاهد |
|---|---:|---:|---:|---|
| feed | 19 | 0 | 0 | [جزئیات](independent-feed.json) |
| identity-ui | 4 | 0 | 0 | [جزئیات](independent-identity-ui.json) |
| market | 15 | 0 | 0 | [جزئیات](independent-market.json) |
| market-cold | 1 | 0 | 0 | [جزئیات](independent-market-cold.json) |

| سناریو | نقش | نتیجه | زمان UTC | مشاهدهٔ کوتاه؛ شاهد کامل در فایل |
|---|---|---|---|---|
| feed/login-A | A | PASS | 2026-10-01T20:33:13.159Z | {"tokenHTTP":200,"userHTTP":200,"userId":"02363980-3f12-412c-a7a8-dcfa863cfb74","path":"/dashboard","capture":"Only HTTP status observed; real UI-issued SDK cookie read in memory, native Auth not intercepted"} [شاهد](independent-feed.json) |
| feed/login-B | B | PASS | 2026-10-01T20:33:14.640Z | {"tokenHTTP":200,"userHTTP":200,"userId":"3404646c-bd5e-4f22-88d1-b128a33b92d2","path":"/dashboard","capture":"Only HTTP status observed; real UI-issued SDK cookie read in memory, native Auth not intercepted"} [شاهد](independent-feed.json) |
| feed/login-admin | admin | PASS | 2026-10-01T20:33:15.971Z | {"tokenHTTP":200,"userHTTP":200,"userId":"9dc3a88a-7be9-478a-9f86-a2f394db764e","path":"/dashboard","capture":"Only HTTP status observed; real UI-issued SDK cookie read in memory, native Auth not intercepted"} [شاهد](independent-feed.json) |
| feed/feed-current-cohort-pagination | A, B | PASS | 2026-10-01T20:33:16.690Z | {"firstHTTP":200,"firstRows":20,"secondHTTP":200,"secondRows":4,"ids":["802e1593-1bc7-4937-a7c4-2d84290fd2dc","e7d9daf5-848b-4523-9da3-e08fa156ed95","03542241-830f-413a-9b90-9fe5f317abde","0fe417a1-58bc-4aa3-8d68-681f44d8359e","a782e15f-339… [شاهد](independent-feed.json) |
| feed/feed-rest-rpc-private-isolation | A, B, guest, admin | PASS | 2026-10-01T20:33:16.922Z | {"foreignHTTP":403,"guestHTTP":401,"adminHTTP":403,"foreignRPCHTTP":403,"rawForeignHTTP":200,"rawForeignRows":0,"privateTableHTTP":404} [شاهد](independent-feed.json) |
| feed/feed-cursor-and-input-scope | A, B | PASS | 2026-10-01T20:33:17.220Z | [{"http":400},{"http":400},{"http":400},{"http":400}] [شاهد](independent-feed.json) |
| feed/noncurrent-unpublished-unapproved-excluded | A | PASS | 2026-10-01T20:33:18.109Z | [{"state":"public","id":"304ce1ac-0d2b-4819-aadf-5b01c1ff7072","detailHTTP":404,"markHTTP":404,"inFeed":false},{"state":"draft","id":"c9c306b2-2d8d-442c-b2fc-81a65ef3c096","detailHTTP":404,"markHTTP":404,"inFeed":false},{"state":"ready","id… [شاهد](independent-feed.json) |
| feed/detail-get-is-not-a-read | A | PASS | 2026-10-01T20:33:18.586Z | {"http":200,"before":"0\|","after":"0\|"} [شاهد](independent-feed.json) |
| feed/explicit-ui-read-replay-concurrent | A | PASS | 2026-10-01T20:33:19.555Z | {"uiHTTP":200,"replayHTTP":200,"readAt":"2026-10-01T20:33:18.992068+00:00","concurrentHTTP":[200,200],"concurrentTimes":["2026-10-01T20:33:18.992068+00:00","2026-10-01T20:33:18.992068+00:00"],"catalogReceipt":"1\|2026-10-01 20:33:18.992068+0… [شاهد](independent-feed.json) |
| feed/receipt-actor-time-not-client-controlled | A | PASS | 2026-10-01T20:33:19.641Z | {"http":400} [شاهد](independent-feed.json) |
| feed/feed-service-error-keeps-needs-form | A | PASS | 2026-10-01T20:33:23.657Z | {"identityHTTP":503,"feedErrorVisible":true,"inputPreserved":true} [شاهد](independent-feed.json) |
| feed/identity-feed-recovery-preserves-input | A | PASS | 2026-10-01T20:33:24.015Z | {"identityHTTP":200,"profileNull":true,"pending":"pending","inputPreserved":true} [شاهد](independent-feed.json) |
| feed/new-version-unread-old-receipt-retained | admin, A | PASS | 2026-10-01T20:33:25.240Z | {"saveHTTP":201,"readyHTTP":201,"publishHTTP":201,"newVersionId":"c5270a10-9624-4f4a-8dd7-e6598cc61319","newUnread":true,"oldHTTP":404,"oldReceipt":"1\|2026-10-01 20:33:18.992068+00","newReceipt":"0\|"} [شاهد](independent-feed.json) |
| feed/withdraw-denies-existing-receipt-replay | admin, A | PASS | 2026-10-01T20:33:25.918Z | {"initialReadHTTP":200,"commandHTTP":201,"detailHTTP":404,"replayHTTP":404,"beforeReceipt":"1\|2026-10-01 20:33:25.320152+00","afterReceipt":"1\|2026-10-01 20:33:25.320152+00"} [شاهد](independent-feed.json) |
| feed/returned-denies-existing-receipt-replay | admin, A | PASS | 2026-10-01T20:33:26.617Z | {"initialReadHTTP":200,"commandHTTP":201,"detailHTTP":404,"replayHTTP":404,"beforeReceipt":"1\|2026-10-01 20:33:25.989699+00","afterReceipt":"1\|2026-10-01 20:33:25.989699+00"} [شاهد](independent-feed.json) |
| feed/explicit-revoke-open-page-saved-cursor | admin, A, B | PASS | 2026-10-01T20:33:27.602Z | {"revokeHTTP":200,"cursorHTTP":403,"detailHTTP":403,"markHTTP":403,"rpcHTTP":403,"BHTTP":200,"BRows":1,"openPageDenied":true} [شاهد](independent-feed.json) |
| feed/financial-needs-preserved-A | A | PASS | 2026-10-01T20:33:28.327Z | {"beforeDigest":"c539b9b3a6e07e82fb1ea99036d364e6deb1bb952c7a9bf3db804ca294dd3ad5","afterDigest":"c539b9b3a6e07e82fb1ea99036d364e6deb1bb952c7a9bf3db804ca294dd3ad5","ledger":[{"table":"member_holding_versions","rows":3,"digest":"f7b11a404d7d… [شاهد](independent-feed.json) |
| feed/financial-needs-preserved-B | B | PASS | 2026-10-01T20:33:29.029Z | {"beforeDigest":"df3a60c9d07d43f6ed820f2bbc8d1cdf074f73c0f9d13fb5c1b9af5a0a9c3dfb","afterDigest":"df3a60c9d07d43f6ed820f2bbc8d1cdf074f73c0f9d13fb5c1b9af5a0a9c3dfb","ledger":[{"table":"member_holding_versions","rows":3,"digest":"fdefe22a1601… [شاهد](independent-feed.json) |
| feed/foreign-financial-ledger-denied | B | PASS | 2026-10-01T20:33:29.040Z | {"http":200,"rows":0} [شاهد](independent-feed.json) |
| identity-ui/login-B | B | PASS | 2026-10-01T20:35:58.492Z | {"tokenHTTP":200,"userHTTP":200,"userId":"3404646c-bd5e-4f22-88d1-b128a33b92d2","path":"/dashboard","capture":"Only HTTP status observed; real UI-issued SDK cookie read in memory, native Auth not intercepted"} [شاهد](independent-identity-ui.json) |
| identity-ui/native-auth-failure-classification-and-recovery | B | PASS | 2026-10-01T20:35:59.328Z | {"before":{"get":200,"post":401,"status":200,"authenticated":true},"during":{"native":503,"get":503,"post":503,"status":503},"after":{"get":200,"post":401,"status":200,"authenticated":true}} [شاهد](independent-identity-ui.json) |
| identity-ui/profile-real-ui-unavailable-not-empty | B | PASS | 2026-10-01T20:36:06.932Z | {"http":503,"unavailableVisible":true} [شاهد](independent-identity-ui.json) |
| identity-ui/profile-ui-recovery-preserves-ledger | B | PASS | 2026-10-01T20:36:07.295Z | {"identityHTTP":200,"profileNull":true,"officialPending":"pending","beforeDigest":"7a7ab0eb7be00fd317306736797974be7b8076bffe42d98caedf005f96a3d1bf","afterDigest":"7a7ab0eb7be00fd317306736797974be7b8076bffe42d98caedf005f96a3d1bf","emptyUIVi… [شاهد](independent-identity-ui.json) |
| market/both-synthetic-market-sources-ready | anonymous public | PASS | 2026-10-01T20:39:43.456Z | {"http":200,"ms":132.98,"stocks":760,"funds":333,"crypto":1,"partial":false,"availability":{"global":{"state":"ready","sourceAt":1790887183386,"readAt":1790887183433},"iran":{"state":"ready","sourceAt":1790885845307,"readAt":1790887183402}}… [شاهد](independent-market.json) |
| market/global-timeout-does-not-block-iran | anonymous public | PASS | 2026-10-01T20:39:45.398Z | {"http":200,"ms":1936.67,"stocks":760,"funds":333,"crypto":1,"partial":true,"availability":{"global":{"state":"stale","sourceAt":1790887183386,"readAt":1790887785386},"iran":{"state":"ready","sourceAt":1790885845307,"readAt":1790887783551}}… [شاهد](independent-market.json) |
| market/both-source-failures-retain-complete-data-times | anonymous public | PASS | 2026-10-01T20:39:45.606Z | {"http":200,"ms":99.01,"stocks":760,"funds":333,"crypto":1,"partial":true,"availability":{"global":{"state":"stale","sourceAt":1790887835462,"readAt":1790888485590},"iran":{"state":"stale","sourceAt":1790885845307,"readAt":1790888485591}},"… [شاهد](independent-market.json) |
| market/iran-hung-reader-budget-with-cache | anonymous public | PASS | 2026-10-01T20:39:50.658Z | {"http":200,"ms":5041.18,"stocks":760,"funds":333,"crypto":1,"partial":true,"availability":{"global":{"state":"ready","sourceAt":1790888635698,"readAt":1790888635727},"iran":{"state":"stale","sourceAt":1790885845307,"readAt":1790888640642}}… [شاهد](independent-market.json) |
| market/data-initial-is-independent-of-analytics | anonymous public | PASS | 2026-10-01T20:39:51.461Z | {"rows":100,"analyticRequests":0} [شاهد](independent-market.json) |
| market/analytics-cold-mid-scan-error-not-complete | anonymous public | PASS | 2026-10-01T20:39:51.868Z | {"kind":"quarterly","http":503,"coverage":{"completedAt":null,"rows":0,"pages":0,"upperId":null,"state":"error","failure":{"code":"http","page":2,"status":503}},"dataKeys":0,"dataDigest":"44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c0… [شاهد](independent-market.json) |
| market/quarterly-explicit-retry-completes | anonymous public | PASS | 2026-10-01T20:39:52.385Z | {"kind":"quarterly","http":200,"coverage":{"state":"complete","completedAt":1790888792203,"rows":3638,"pages":4,"upperId":3638},"dataKeys":1819,"dataDigest":"20e5bee633c5924a2f7407c68e94069fe371a3f09be679761e2918f2b2ec18e1"} [شاهد](independent-market.json) |
| market/monthly-complete-keeps-controls | anonymous public | PASS | 2026-10-01T20:39:52.965Z | {"kind":"monthly","http":200,"coverage":{"state":"complete","completedAt":1790888792841,"rows":5981,"pages":6,"upperId":5981},"dataKeys":2990,"dataDigest":"473f22a1950e625df518cc08b93c594ccc81e7debec8f290ce1b8a377b77dc1f","search":"نمونه1",… [شاهد](independent-market.json) |
| market/volume-complete-not-first-cap-page | anonymous public | PASS | 2026-10-01T20:39:54.903Z | {"kind":"volume","http":200,"coverage":{"state":"complete","completedAt":1790888794834,"rows":29610,"pages":30,"upperId":29610},"dataKeys":987,"dataDigest":"2c4aca9c5894feb7ab64a99927a27d6e78a23a9224583ed0c6d56cb147f97e51"} [شاهد](independent-market.json) |
| market/data-mobile-no-page-overflow | anonymous public | PASS | 2026-10-01T20:39:54.947Z | {"viewport":390,"overflow":false} [شاهد](independent-market.json) |
| market/monthly-stale-keeps-original-complete-coverage | anonymous public | PASS | 2026-10-01T20:39:55.719Z | {"kind":"monthly","http":200,"coverage":{"state":"stale","completedAt":1790888792841,"rows":5981,"pages":6,"upperId":5981,"failure":{"code":"http","page":2,"status":503}},"dataKeys":2990,"dataDigest":"473f22a1950e625df518cc08b93c594ccc81e7d… [شاهد](independent-market.json) |
| market/volume-hung-scan-stops-retains-complete-cache | anonymous public | PASS | 2026-10-01T20:40:10.841Z | {"kind":"volume","http":200,"coverage":{"state":"stale","completedAt":1790888794834,"rows":29610,"pages":30,"upperId":29610,"failure":{"code":"deadline","page":0}},"dataKeys":987,"dataDigest":"2c4aca9c5894feb7ab64a99927a27d6e78a23a9224583ed… [شاهد](independent-market.json) |
| market/volume-retry-recovers-complete-coverage | anonymous public | PASS | 2026-10-01T20:40:12.893Z | {"kind":"volume","http":200,"coverage":{"state":"complete","completedAt":1790893412721,"rows":29610,"pages":30,"upperId":29610},"dataKeys":987,"dataDigest":"2c4aca9c5894feb7ab64a99927a27d6e78a23a9224583ed0c6d56cb147f97e51"} [شاهد](independent-market.json) |
| market/private-unknown-analytics-kind-rejected | anonymous public | PASS | 2026-10-01T20:40:12.906Z | {"http":400} [شاهد](independent-market.json) |
| market/no-live-upstream-requests | anonymous public | PASS | 2026-10-01T20:40:12.917Z | {"synthetic":true,"fixtureCounts":{"stocks":760,"funds":333,"history":29610,"monthly":5981,"quarterly":3638},"fixtureRequests":97,"deniedExternalAttempts":0,"externalPerformed":0,"guardSHA256":"bf3b71691ed9d0dc9a65f1ee19cd96344104f576d482e1… [شاهد](independent-market.json) |
| market-cold/cold-iran-hung-null-and-explicit-recovery | anonymous public | PASS | 2026-10-01T20:44:15.514Z | {"cold":{"http":200,"ms":5112.96,"iranIsNull":true,"iranAvailability":{"state":"timeout","sourceAt":null,"readAt":1790887455411},"globalAvailability":{"state":"ready","sourceAt":1790887450458,"readAt":1790887450486},"cryptoRows":1,"partial"… [شاهد](independent-market-cold.json) |

## نقص و اصلاح ابزار آزمون

نقص محصولی در این دامنه مشاهده نشد. تلاش نخست آزمون سرد به‌علت شرط اشتباه ابزار بازبین FAIL شد: شرط فقط `error` را قبول می‌کرد، در حالی که قرارداد `SourceAvailability` در `lib/market-bounded.ts:6` شامل `timeout` است و خط `23` برای `DeadlineError` همین مقدار را بازمی‌گرداند. [تلاش اولیهٔ تغییرناپذیر](independent-market-cold-attempt-01.json) محفوظ است. شرط ابزار اصلاح و همان مشاهدات واقعی با [ارزیابی قابل‌بازتولید](independent-cold-finalize.mjs) بررسی شد؛ درخواست، timestamp یا restart تازه ساخته نشد.

در نخستین درخواست پس از [restart همان build](cold-process-restart.json)، منبع ایران در ۵۱۱۲٫۹۶ میلی‌ثانیه با `ir=null`، `state=timeout` و `sourceAt=null` پایان یافت؛ منبع جهانی آماده و یک ردیف crypto داشت. بازیابی واقعی در ۸۵٫۲۴ میلی‌ثانیه، ۷۶۰ سهام و ۳۳۳ صندوق کامل برگرداند. [شاهد نهایی با علت اصلاح و hash تلاش اولیه](independent-market-cold.json).

دارایی و نیازسنجی A/B قبل و بعد از نسخه‌گذاری، لغو دسترسی و خطاهای feed hash یکسان داشتند؛ B به پروندهٔ A دسترسی پیدا نکرد. رسیدها پس از withdraw/returned باقی ماندند و مجوز ایجاد نکردند. تست بازار گرم ۱۵ مورد و تست سرد یک مورد جدا هستند؛ `NOTRUN` در فایل گرم سابقهٔ مرحلهٔ گرم است و با شاهد سرد تکمیل شده است. وضعیت fixture نهایی حفظ شد: رابطهٔ A لغوشده است؛ نامزدهای lifecycle بازگردانده یا withdrawn هستند؛ B برقرار است.

## CI و مرز نتیجه

والد پنج job موفق CI برای SHA بالا را در [run 36922102452](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36922102452) گزارش کرده است. بازبین CLI `gh` در PATH نداشت و آن را مجدداً استعلام نکرد؛ تطبیق CI نهایی پس از commit اسناد بر عهدهٔ والد است. نتایج runtime فقط به SHA واقعی بالا تعلق دارند.

- quota178 actual installation/reset/failclosed acceptance remains OPEN; not installed in this environment.
- Two live provider market cycles, live freshness and Production latency remain OPEN; all market rows here used synthetic public fixture and zero live upstream.
- Known PR187 legacy bulkReturns/history/watchlist coverage limits remain OPEN; this suite covers the explicit selected public datasets only.
- Human DEV07/173 acceptance remains OPEN; separate automated reviewer is not human signoff and these 39 cases are not the original 14 DEV07 scenarios.
- Native phone/provider proof, successful identity write and matching remain OPEN; these three synthetic email-confirmed accounts have no invented phone confirmation.
- NEXT09 PR189, miniapp#5, bot/channel remain OPEN and inventory only; policy-blocked NEXT09 built-server action was not repeated.
- No merge, Production deployment, shared migration, backup/restore or real-data write was performed by this reviewer.

**این ترکیب در دامنهٔ محدود فوق پذیرش مستقل شد؛ گیت‌های باز همچنان باز هستند.**
