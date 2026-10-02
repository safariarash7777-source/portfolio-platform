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
