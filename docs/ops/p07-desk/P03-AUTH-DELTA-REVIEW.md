# P07 — بازبینی مستقل تحویل محلی مصرف Auth در P03

تاریخ2026-10-02؛ snapshot بررسی‌شده P03@`797335c872ea4304aa119ecde32809da4f156e5d` در checkout `portfolio-p03-member-start`، بدون تغییر فایل‌های P03. runtime delta `f669c05baf2cdebfead20999e389c77f19015152` و اصلاح constructor آزمون `1f97cb25d89a983c9641cfdb54e8d2950316f1be` است. مرجع قبلی PR209@`63aeb0ff21db91b0b07c6fdde5b579cd1747b8fc` است؛ وضعیت remote جدید در این بررسی راستی‌آزمایی نشد.

## شواهد مستقیم P07

- diff فایل `lib/intelligence/publication-server.ts` از63aeb0f تا797335c فقط import classifier و نگاشت publicationMember را تغییر می‌دهد. بخش متن از `publicationAdmin` تا پایان فایل، با مقایسه case-sensitive یکسان است.
- Git blob helper در P03 و منبع P01@`87f6b2250218c661fc3a6ab89fec10d35f6a7467` برابر `60ef5ffa882973ad5400c3b8243e32e94280ea63` است. helper دیگری در P07 ساخته یا cherry-pick نشد.
- در همان snapshot محلی، P07 مستقل اجرا کرد: `tsx --test lib/intelligence/publication-feed.test.ts lib/member/home.test.ts`؛ **49PASS/0FAIL/0SKIP**. موارد explicit400 session→401، unknown400/404/429 و transport/configuration→503، جلوگیری از RPC خصوصی برای denial و موفقیت کاربر معتبر پوشش داده شدند. اجرای تست‌ها transport ساختگی دارد؛ این اجرای مستقل native HTTP یا browser نبود.

## مرز نتیجه

گزارش P03 `P01-CONSUMER-DELTA.md` مستقیم خوانده شد؛ اعداد1313core، nativeSDK/HTTP/browser و سایر شواهد آن **گزارش سازنده** هستند و در این بررسی دوباره اجرا یا پذیرش مستقل نامیده نمی‌شوند. از CI قبلی یا63native قدیمی، پذیرش Auth delta تازه نتیجه گرفته نمی‌شود.

این بررسی مصرف‌کنندهٔ member را برای همین snapshot محلی سازگار یافت؛ publicationAdmin در این تغییر دست‌نخورده است. قرارداد publication.v1، تصمیم/اعتبار DRAFT و مالکیت reader با P03 محفوظ است. P07 route، helper، Auth، schema یا reader تغییر نداد. این نتیجه ورود کامل P01، CI head جدید، ارسال موفق remote، ترکیب208/209 در P00، native deadline یا پذیرش انسانی را نمی‌بندد. انتشار delta طبق گزارش P03 به اتصال GitHub وابسته و هنوز تأییدنشده است؛ تأیید remote آینده باید با SHA ثبت شود.
