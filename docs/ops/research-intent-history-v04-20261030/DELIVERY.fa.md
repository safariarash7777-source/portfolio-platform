# P10.1 — intent ثبت‌شده از reader موجود

followup مستقل از349@37b0c1b9acdd7e38bcd6d39b31d4d847892fd321؛ خود349 فریز. projection فقط kind/source workbook_intent_recorded/workbook_intents و preparedAt/intentId/base/target را افزوده است. intentId همان UUID ردیف R2 است، نهrequestHash یا عددنسخه. actor/readAt/start/end/null، workerهاnot_supplied وwriteOutcome=unknown می‌مانند. targetVersion حتی باوجودنسخههم‌شماره بهversionId تبدیل نمی‌شود.

## منبع کافی، بدونDTO/APIتازه

GET فهرست موجود saveIntents/durableRecoveryAvailable/intentNextOffset را دارد؛ GET موجود قدیمی‌تر items/nextOffset. helper خالص فقط UUID/نسخه/preparedAt همینmetadata را درdisplaystate آخرینصفحه نگه می‌دارد؛ title/requestHash/requestBody/actor حتی خوانده نمی‌شوند. rowناسالم بدونکپی‌کردن‌مقدارورودی بهشمارنامعتبر می‌رود و زمانناسالم nullباgap می‌شود. منبع R2 همان backendguard قبلی است؛ نمایش یا فیلتر، مجوز و actor نمی‌سازد.

صفحه‌ها بهjournal یاscopeنشست‌هایاحتمالی متفاوت چسبانده نمی‌شوند؛ پنل فقط آخرینپاسخ metadata را باoffset/cursor همانrequest/response نشان می‌دهد. nextOffset=null تکمیلهمهتاریخچه نیست. نبودفیلد/خطا/unavailable/invalid/درحالخواندن ازخواندنمعتبرخالی جداست؛ شکستصفحه قبلی راپنهان می‌کند، نهemptyجعلی. دروجودمرجع معتبر349، workbookIdدقیق فیلترمی‌شود؛ درنبودآن صفحه مستقل وبدونانتساببه متن جاری برچسبدارد. تعارض قبل از فیلتر تشخیص داده می‌شود.

## حفظ رفتار و مجوز

ResearchWorkbook فقطstate وstandalone displaysetter درrefreshList/olderIntents وprop پنل دارد. AST تابع‌هایrefreshList/olderIntents وتمامR2save/recover/open/intent بعدحذفهمینsetterها با349برابرند؛ READ-BOUNDARY.json. package/CI/nativeworkflow وworkbook-store/workbook-intent-store/research-worker بایت‌به‌بایت ثابت‌اند. هیچquery/GET/POST/مدل/نصب/SQL/Auth/کلید/worker/lock/freeze/primaryعملیاتی تازه اجرا نمی‌شود؛ هیچfixture runtime در محصول نیست.

## آزمون‌های موجود و بازتولید

`npx --no-install tsx --test components/admin/ResearchWorkbook.test.ts lib/intelligence/research-history.test.ts components/admin/ResearchHistoryPanel.test.tsx` — ۷۱pass.

`npx --no-install tsx --test lib/intelligence/workbook-store.test.ts app/api/admin/intelligence/workbooks/route.test.ts lib/intelligence/p07-private-persistence.test.ts lib/desk/registry.test.ts` — ۳۲pass. typecheck/lintscoped موفق. همهpathها ازقبلثبت‌اند؛ registryتازهنداریم.

actualcomponent باfixtureسروری موجودB وintentهای واقعاًثبت‌شدهٔهمانfixture کار می‌کند: list/open همان۲GET، یکintentبرایهدف۲ بدونوجودنسخه۲؛ nohash/bodycopy. صفحه‌بندی واقعی۵۵intent، باهمانکنترلR2، یکGETقدیمی‌تر می‌زند وwindowنمایش از۵۰به۵ باoffset۵۰ می‌رود؛ هیچrequestسومیبرایpanel اضافه نمی‌شود. خطایصفحه metadataراerror می‌کند ونسخه/intentها/متن ثابت می‌مانند. fixtureها فقطoffline testsهستند وپذیرشprimary/نشستواقعی نیستند.

درnative testازقبلثبت‌شده فقطassertionخواندنی تازه داریم: rawintent ازقبلخوانده‌شده باid/preparedAt پنل تطبیق، target۲ وversionId=null/writeOutcomeunknown وصفرrequestاضافی. SQL/setup/سناریوهایB/nativeworkflow ثابت‌اند. نتیجهnativeفقطباCIexactsource گزارش می‌شود، نه skipمحلی یا نصب.

پس ازPreviewمجاز، root می‌تواند باهمانکنترلبازکردن/فهرست/قدیمی‌تر موجودmetadata را بخواند وحالتخالی/خطا/آخرینصفحه را مستقل ثبتکند؛ اینپنل کنترلrefresh/ثبت ندارد. برش، futureappendruntime یا تاریخچهٔ تمامانتقال‌هایworker را اجرا نمی‌کند. timestampمقصدکهworkerنگه‌نداشته وrealAuth/privatebrowser/primaryinstall هنوزبازند.
