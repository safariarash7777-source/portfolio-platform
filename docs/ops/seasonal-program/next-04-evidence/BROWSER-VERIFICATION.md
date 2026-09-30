# شاهد مرورگر NEXT04 — 2026-09-30

Chrome واقعی headless با agent-browser/session ایزوله next05 روی8774/qa/next04؛ component عملیات واقعی با prop transport مصنوعی مستقل ازDB. banner نمونهٔ مصنوعی دیده شد؛ Auth واقعی و اجرای server API/DB از این شاهد نتیجه نمی‌شود.

انتخاب cohortA و حساب تماس تأییدشدهٔ مصنوعی، دلیل طولانی، grant وبینار/resources مشاهده شد. review ثبت‌نام unmatched→validated و revoke همانgrant→لغوشده واقعاً اجرا شدند. qa-granted1440، qa-revoked390 و qa-reviewed-revoked1440 و qa-final390.json شاهدند. لغو کلcohort درfixture پیاده نشده و نتیجهٔ cancel-cohort ادعا نمی‌شود؛ CSV upload/preview دراین اجرای مرورگر آزموده نشد.

بازبینی اولیه table390 تنگی ستون/تماس و btn بدون پایهbtn را نشان داد؛ مالک04 اصلاح کرد. بازبینی نهایی qa-final-top390/table390/table1440 و qa-touch-table390.json: buttonها44px، جدول680px وcontainer308px با scrollداخلی؛ document390=scrollWidth390. 1440 نیز خارج صفحهoverflowنداشت. Tab ازانتخاب حساب بهgrant واقعی با outline1px درنسخهٔ پیش ازاصلاح اندازه ثبت شد؛ ادعای سنجش مجدد outline بعداصلاح نمی‌شود.

برای مرور همهٔ ستون‌های جدول موبایل scrolling داخلی لازم است؛ mobile cards درscopeاینfixنیست. این تصاویر، شواهد خطای اولیه را جایگزین می‌کنند ودرگزارش باید نسخهٔ بعداصلاح مشخص باشد. dev پس ازاین بازبینی برای build مالک04 آزاد شد.
