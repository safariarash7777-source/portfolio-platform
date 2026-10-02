# P00 — candidate محلی P01 + P03

**آمادهٔ بازبینی محلی؛ منتشر، مستقر یا پذیرفته نشده.** کد `844860d2643addce4668f48bf2e475e09c997b28`، tree `9f4f911058f2dad505dba4548a1ae41bcca05eec`، پایه195@31c44ab635b672b589b7833bcbc78b41d36f1e75. این ترکیب محلی به معنی ادغامPR نیست.

ورودی‌ها208@f0e002bc وP03localdeltaf669c05 هستند؛ هر دوparent در[manifest](MANIFEST.json) ثبت‌اند. remotePR209آخرین بار63aeb0f دیده شد؛ deltaبهعلتقطعارتباطpublishنشده وCIآن سبز اعلام نمی‌شود. helperAuthیک‌بار باblob60ef5ffa درcandidate موجود است؛ package/lock،SQL/migrations،workflow وnext.config عیناً195 هستند. هیچ199 یاpreview/Telegramstartup ردشده وارد این کار نشده.

آزمونP00 رویترکیب:۶۱handler +۷۲Auth/contract/member/feed = **۱۳۳PASS،۰FAIL،۰skip**؛ دوcheckVMمستقلcookie (synthetic) موفق. typecheck نخست دوTS2554 درtest جدیدP03 پیدا کرد؛ دوAuthApiError401/403 به آرگومان سومundefined نیاز داشتند. تنها همینtest اصلاح شد؛ runtimeSDKsemantics ثابت، typecheckدومexit0 و۲۸feedrecheckPASS. این۲۸ به۱۳۳ دوباره جمع نمی‌شود. lintexit0/zero-warning،اسکنسکرت وdiffcheckموفق‌اند. hashخروجی‌هایخصوصی/موقت درmanifest است؛ credential یاJWT واقعی درگزارش نیست. مالکP03 مطلع و همان اصلاح را درشاخهٔ خودش انجام می‌دهد؛ sourceقبلی او دراینکار ویرایش نشد.

**موانع دقیق:** buildکاملcandidate اجرا نشد؛ حافظهٔ فیزیکی آزاد دستگاه۰٫۸۲GiB بود و فرایندهای سایرکارها متوقف نشدند. GitHub/SSH/HTTPSsandbox ارتباط قابل‌تأیید نداشتند؛ candidateهنوزnativeenvironment،deployment یاCI ندارد. build/native۶۳ شاهدP03@f889 وDEV07۱۳PASS/۱humanBLOCKED روی195، پذیرش اینSHA نیستند. sandbox195 وکاربرگ انسانی‌اش دست‌نخورده‌اند.

اقدام بعدی: دریافتSHAنهاییtestfix/اسنادP03 و تطبیقblob بهجایاعمالدوباره؛ پسازآزادشدنمنابعbuildهمینcandidate وپسازبازگشتارتباطCIرویSHAنهایی. نصب وپذیرشnative باید namespace/DBساختگی مجزایcandidate داشته باشد؛195/DBواقعی/backup/sharedproxy تغییرنکند. نسخهٔ برنامهٔ نصب‌شده فقطازmanifestهمانمحیط گرفته شود؛ تا آنزمان وضعیت **LOCAL_ONLY_NOT_ACCEPTED** است.
