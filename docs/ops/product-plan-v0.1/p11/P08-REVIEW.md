# بازبینی محدود مستقل P08 — snapshot پیش از تحویل نهایی

2026-10-02 تهران. مبنای HEAD خوانده‌شده P08: b813d2e23d79af06938b83fb6084bc266027509c؛ دو فایل مورد بررسی در آن زمان **untracked و هنوز commit نشده** بودند. بنابراین یافته‌ها به snapshot با hash زیر تعلق دارند، نه به SHA نهایی PR202. فایل‌های مالک P08 تغییر نکردند؛ probe روی کپی ثابت در فضای مستقل P11 با داده مصنوعی اجرا شد.

| فایل | SHA256 snapshot |
|---|---|
| lib/assistant/fixture-ledger.ts | b17c28ab1412f85930f0f93d16d7dcaa28d7535171114b4079a178aaef6a2bd6 |
| lib/assistant/handoff-fixture.ts | 2767a5a08871823bb711b4eb1af531f766e4ba0cc1a5ff58aef90c8ab3b5f4b5 |

## یافته‌های باز، مسئول P08

1. **مهار overrun در لحظه dispatch ناقص است.** در دفتر مصنوعی با total/subject=100، concurrency=2، دو رزرو۳۰ ثبت شد. اولی dispatch و با actual=40 تسویه شد؛ claimDispatch دومی true برگرداند. guard reconciliation-required در reserve وجود دارد ولی claim رزرو قبلی آن را بررسی نمی‌کند. طبق قرارداد، ثبت مصرف بیش از رزرو باید درخواست‌های بعدی را برای تطبیق متوقف کند؛ رزرو قبلی هم ارسال جدید محسوب می‌شود. اصلاح و آزمون این ترتیب در محدوده P08 لازم است.
2. **نگاشت دریافت، lineage پرونده را بررسی نمی‌کند.** before=pending_consent/revision1/caseA/subjectA و after=received/revision99/caseB/subjectB/consent با receiptWitnessed=true به opened نگاشت شد. هرچند تابع transition اصلی کنترل‌هایی دارد، helper مستقل ورودی نامرتبط را قبول می‌کند و سنجه دریافت معتبر نمی‌سازد. تطبیق case/subject، revision بعدی، opaque refs و transition/consent معتبر یا receipt با lineage اثبات‌شده لازم است؛ boolean عمومی به‌تنهایی شاهد کافی نیست.

خروجی خام probe:

```json
{"scope":"frozen uncommitted P08 source snapshot; synthetic offline probe","claimedAfterOverrun":true,"unrelatedTransitionDimensions":{"action":"opened","category":"assistant"}}
```

در این probe درخواست DB/provider/model و داده واقعی عضو صفر بود؛ فقط filesystem مصنوعی و اجرای محلی. این بازبینی دو مسیر را سنجید، نه تمام ledger یا کیفیت مدل/پاسخ انسانی. ۵۱ آزمون گزارش‌شده P08 به‌عنوان گزارش سازنده باقی می‌ماند؛ این دو یافته با آن گزارش مخلوط یا پنهان نمی‌شوند.

نتیجه: نگاشت و ledger در snapshot خوانده‌شده برای پذیرش P11 آماده نیستند. یافته‌ها مستقیم به P08 ارسال شدند؛ اقدام بعدی اصلاح توسط صاحب فایل، SHA/شاهد نهایی و بازبینی محدود دوباره همین مسیرهاست. G2 بسته و G3 سفر مشترک از این probe پاس‌شده تلقی نمی‌شوند؛ runtime/collector/Production فعال نشده است.

## بازبینی اصلاح — SNAPSHOT_RECHECK_PASS / FINAL_SHA_PENDING

P08 هر دو مسیر را اصلاح کرد. کپی ثابت تازه از فایل‌های هنوز commit‌نشده روی HEAD8852d7a992c1a242694e83d4abf5dc8e2fb8fe53 گرفته شد. ledger با hash خام c54a2044a114ad50c54cb5799e27c6389ff22223e0f138771b2026caea82dd88 و handoff با hash e7a0549a380bbced025e955d27879b74144858e7d54a7eccd084312dbc97c399 بررسی شدند.

۱۱ assertion مستقل محدود گذشت: dispatch رزرو قبلی پس از overrun مسدود، مسیر عادی همچنان مجاز؛ opened با رضایت/lineage صحیح، رد case یا subject نامرتبط، revision نادرست و رضایت غایب؛ receipt غایب هیچ opened نسازد؛ assigned پاسخ انسانی نباشد؛ resolved صحیح نگاشت و closed حل‌شده نام نگیرد. نتیجه و hashها در [P08-REVIEW-RECHECK.json](P08-REVIEW-RECHECK.json) ثبت است.

این مرحله بازبینی snapshot است؛ تا SHA نهایی و اثبات برابری همان blobها، یافته‌ها در تحویل نهایی بسته‌شده اعلام نمی‌شوند. شاهد receipt/authorization سرور، rollout، کیفیت مدل و پاسخ انسانی واقعی همچنان NOT_RUN هستند. آزمون محلی مصنوعی بدون provider/DB/مدل و داده عضو بود. شواهد شکست اولیه بالا حفظ می‌شود.

## رسید نهایی — FINAL_SHA_BOUND / دو یافته محدود CLOSED

P08 اصلاحات را در PR202 با SHA ثابت **2ca3058db75b44771c748b2673341aff2e84e77f** commit/push کرد. GitHub head تازه همین SHA و base برابر195@31c44ab635b672b589b7833bcbc78b41d36f1e75 را تأیید کرد؛ PR همچنان draft/open و unmerged بود.

محتوای git show این commit برای هر دو فایل با snapshot آزموده‌شده، با نرمال‌سازی LF/CRLF، دقیقاً برابر است. blob دفتر6098dac35291289ee5ddba8b5bbd96b0a38fa419 و blob ارجاعc940595c24d5419f3b7e194b0b1e032fb3d6f4e9 است؛ hashهای canonical و نتیجه تطبیق در P08-REVIEW-RECHECK.json ثبت‌اند. ۱۱ assertion مستقل قبلی اکنون به این commit قابل انتساب است؛ اجرای دوباره صرفاً برای ثبت SHA انجام نشد، چون فایل‌ها یکسان‌اند.

دو یافته اولیه فقط در همین دامنه بسته شدند: overrun اجازه dispatch رزرو قبلی نمی‌دهد، و دریافت/حل بدون lineage معتبر projection نمی‌شود. ۵۳ تست، typecheck/lint/build گزارش سازنده P08 هستند؛ P11 آنها را اجرای مستقل خود نام نمی‌گذارد. این رسید پذیرش همه ledger، RLS/Auth، receipt واقعی سرور، پاسخ اول انسانی، کیفیت LLM، هزینه واقعی یا G2/G3 کامل نیست. گیت‌های مزبور و تصمیم عرضه همچنان شواهد جدا می‌خواهند.
