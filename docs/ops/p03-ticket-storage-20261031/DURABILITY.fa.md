# قرارداد و مالکیت ادامهٔ دوام تلاش P03

این ادامه همان تعهد باز P03 است؛ اولویت/پذیرش در COMMAND-CENTER با root ثبت می‌شود. مالک START-B در چت 01a17cdc-cf6b-7b82-882f-e5d04e837353/local است. مبنای محفوظ 1636258dec1701c2c6edcc4d60050c94eb0db7d6 و b5 است. root گیت محدود مرورگر163 را مستقلاً پذیرفت؛ processesObserved اجرای موفق **۱۵** است، نه۸ اجرای شکست قبلی. این پذیرش شامل login-form کامل، null-callback race در DOM، دوام تلاش حل‌نشده بعدdestroy، حق واقعی، primary یا آرش نیست.

## رزرو فایل پیش از پیاده‌سازی

root صریحاً این فایل‌ها را تخصیص داد: sql/consultation_ticket_prepared_intents.sql؛ lib/consultation/ticketAttemptStorageContracts.ts، ticketAttemptStorageServer.ts، ticketAttemptStorageRequest.ts و سه test هم‌نام؛ app/api/consultation/ticket-attempts/route.ts؛ TicketRequestWorkspace/TicketRequestPanel و ticket-storage-ui.test.tsx خودB؛ fixture/driver/workflow همین پوشه آزمون و همین برگ ops. فقط سه literal آزمون جدید در فرمان اول test:core افزوده می‌شود. سه برگ قرارداد fixed358، kernel SQL ticket/receipt، API قدیمیtickets، sharedAuth/financial/consent/Workspace مشترک و dependency/lock ثابت می‌مانند. استثنای source-boundary فقط old/new hash همین تخصیص است؛ baseline آزاد بازنویسی نمی‌شود.

## قرارداد دقیق

POST به /api/consultation/ticket-attempts همان UTF-8 متن اصلی TicketIntent.body را، بدون envelope جدید یا بازسریال‌سازی، می‌فرستد؛ سقف همان TICKET_BODY_LIMIT است. HTTP producer متن را با قرارداد frozen تطبیق می‌دهد. SQL متن ورودی را عیناً در ستون text نگه می‌دارد و SHA256 از convert_to(body,'UTF8') و زمان DB می‌گیرد؛ JSONB فقط برای کنترل ساختار/هویت/کنش استفاده می‌شود، نه تولید متن محفوظ. writeEnabled=false و serviceRightState=not_connected قرارداد قدیمی تغییر نمی‌کنند.

جدول خصوصی append-only prepared_intents شامل id،actor_id،relationship_id،request_id،client_token،request_body،body_sha256،created_at و fixture_run_id مشتق DB است. UNIQUE(actor_id,client_token)؛ همان token/همان bytes همان رسید حفظ را برمی‌گرداند و changed-body=409 است. prepare هرگز command اجرا نمی‌کند. auth.uid واقعی و lock actor→relation قبل از lookup/return، سپس رضایت فعال/کنش member یا owner/current DB provider برای آماده‌سازی کنترل می‌شوند. provider محصول همان not_connected است؛ admin/JWT metadata/client flag/وجود ردیف intent مجوز خدمت نیست.

سه RPC جدید: prepare_consultation_ticket_attempt(p_body text)؛ lookup_consultation_ticket_attempt(p_relationship uuid,p_preparation uuid,p_client_token text) با دقیقاً یکی از دو correlation؛ load_consultation_ticket_attempts(p_relationship uuid). wrapperهای session-bound با search_path خالی و authenticated EXECUTE، بدون دسترسی مستقیم app به جدول/توابع خصوصی. immutable trigger و RLS لایهٔ دفاعی باقی‌اند؛ candidate نصب نشده است.

GET mode=list فقط relationshipId می‌گیرد و metadata همان actor+رابطه را می‌دهد: preparationId،requestId،kind،baseVersion،bodyHash،createdAt. body/token/subject/text در list نیست. حد serialization۵۰۰، مستقل از quota تجاری؛ بیش از حد خطا است نه truncation/empty. GET mode=lookup با relationshipId و دقیقاً preparationId یا clientToken، body اصلی و hash/time/actor/relation/fixtureRunId را فقط بعد authorization می‌دهد. حالت absent، found با data=null نیست و unknown به absent تبدیل نمی‌شود. timestamp اصلی می‌ماند؛ hash UTF8 مستقل در مصرف‌کننده بررسی می‌شود.

خرابی provider نوشتن، خواندن intent/history مجاز را مخفی نمی‌کند؛ read به provider وابسته نیست. advisor غیرفعال/لغوشده یا تغییر actor/relation پیش از private fallback رد می‌شود؛ عضو سابقهٔ مجاز خودش را پس revoke می‌خواند ولی نمی‌نویسد. CAS/نقش/right جاری پیش از تلاش صریح و دوباره در kernel فرمان موجود کنترل می‌شوند.

## جریان و معیار پایان همین گیت

submit صریح ابتدا body را حفظ و با GET مستقل همان preparation را تطبیق می‌دهد؛ فقط موفقیت قطعی آن، ادامهٔ همان فرمان اولیه را مجاز می‌کند. هر unknown prepare، ارسال command را متوقف می‌کند. پس از destroy، ورود واقعی تازه فقط list metadata سرور را می‌خواند؛ انتخاب صریح یک preparation، GET body/token اصلی و lookup receipt همان تلاش را انجام می‌دهد. نسخهٔ آخر یا intent دیگری خودکار انتخاب نمی‌شود. هیچ POST خودکار بعد بازگشایی، retry کور، private browser storage یا token در URL صفحه/لاگ/مدل وجود ندارد.

پذیرش لازم در CI ایزوله: ۲۰۱ واقعی فرمان، قطع تحویل و destroy قبلconfirm؛ fresh Auth→GET original bytes/token/hash→تطبیق تک‌اثر بدون POST دوم؛ unknown prepare+destroy با صفرcommand؛ same-token changed-body، race/CAS، ACL/directRPC، لغو/غیرفعال‌بودن، خرابی provider خواندن و ثبات fingerprint مالی. گیت browser163 و failedها محفوظ‌اند؛ موفقیت قبلی شاهد source تازه نیست. primary DDL/نصب/حق واقعی/سرویس تازه/حذف گیت انتشار مجاز نیست.


پیاده‌سازی اولیه پیش از CI:۱۷ آزمون جدید قرارداد/HTTP/transport و۱۵ آزمون handler موفق‌اند؛ TypeScript منبع tracked و ESLint موفق، SQLpolicy۶۲فایل۰مردود است. اینها شاهد DB/Auth/DOM نیستند. راننده API اکنون۲۵مرحله و مرورگر۱۱معیار مستقل دارد؛ تعدادها inventory برنامه‌اند تا receipt واقعی همان source ثبت شود. دو معیار destroy-command و destroy-unknown-prepare جدا هستند. SQL جدید فقط به bootstrap دیتابیس تازهٔ owned CI افزوده می‌شود. خطاهای نوعیِ narrowing در رابط/fixture پیش ازcommit رفع شدند؛ هیچ شاهد قدیمی به source جدید تعمیم داده نمی‌شود.

lookup SQL ابتدا فقط actor/relation همبستگی را می‌خواند و بعد از انطباق هر دو، body را fetch می‌کند. HTTP producer، bytes غیرcanonical قرارداد frozen (ازجمله BOM) را رد می‌کند؛ متن ورودی ذخیره‌شده از JSONB بازتولید نمی‌شود. bytehash واقعی در هر lookup مستقل کنترل می‌شود. metadataها خودکار به latest intent تبدیل نمی‌شوند؛ کاربر یک شناسه را صریح انتخاب می‌کند. private body/token در list، URL صفحه، مدل یا artifact عمومی ثبت نمی‌شوند. body/token فقط در lookup مجاز و state خصوصی همان اجرا حضور دارند.


اجرای واقعی نخست، source55fb429 در run41150197755/job124384649206:۸۹unit، DB/Auth setup، آماده‌سازی product-provider بسته و۱۷مرحله قدیمی موفق؛ ادامه durability با p03_durable_prepare_status شکست و cleanup۶resource موفق شد. HTTP/code پاسخ همان شکست ثبت نشده بود، پس علت runtime نخست قطعی اعلام نمی‌شود. در بررسی محلی خود قرارداد frozen، fixture با kind-first JSON رد و serialize(validateTicketRequest(input)) پذیرفته شد؛ اصلاح فقط تولید اصل دادهٔ آزمون در driver است، نه بازسازی متن بازیابی‌شده یا تغییر API/SQL/validator. diagnostic بعدی فقط expected/actual HTTP/code را بدون body/token چاپ می‌کند. failed receipt محفوظ و native/DOM durability هنوز پذیرفته نیست.

برای direct RPC ناشناس، مطابق نگاشت رسمی PostgREST14 کد42501 می‌تواند401 یا403 باشد؛ هر دو فقط برای anon به‌عنوان منع دسترسی پذیرفته می‌شوند. service_role همچنان403 می‌خواهد؛404/موفقیت مجاز نیست. مرجع: https://docs.postgrest.org/en/v14/references/errors.html . این تنظیم، grant یا مجوز جدیدی ایجاد نمی‌کند.


gateway متعلق به تست، همان next.config.js آرشیو source را با تنها override logging=false بار می‌کند؛ خود فایل config/Auth/router تغییر نکرده‌اند. این تنظیم فقط لاگ درخواست/fetch در Nextdev را خاموش می‌کند تا correlation token موجود در queryِ lookup حتی در app.log خصوصی نوشته نشود. شواهد HTTP همچنان به‌صورت path/status بدون query در driver ثبت می‌شوند و خطاها سرکوب نشده‌اند. پشتیبانی logging=false و incomingRequests از config-shared/log-requests و next-dev-server همان بسته نصب‌شده15.5.28 بررسی شد؛ رفتار محصول/مجوز یا گیت انتشار تغییر نمی‌کند.

## بستهٔ نامزد انتشار؛ کد ثابت c4، بدون اعمال روی مقصد

مسئله: جلوگیری از گم‌شدن اصل تلاش و ارسال تکراری پس از بسته‌شدن کامل context. مخاطب این بسته root و بازبین انتشار است؛ مالک پیاده‌سازی START-B، مالک مقصد، caller، یکپارچه‌سازی، SSOT و انتشار root است. وابستگی باز، شناسایی واقعی مقصد و caller و حق معتبر خدمت است. خروجی قابل مشاهده، همین برگ، آرشیو دقیق Git، دو SQL فقط برای بررسی، رسیدهای رسمی و manifest هش‌دار در بستهٔ محلی p03-release-c4c4c9f است. معیار پایان این تحویل، امکان بررسی ترتیب نصب/خواندن/برگشت بدون بازاجرای آزمون یا دست‌زدن به مقصد است؛ پذیرش عملیاتی مستقل می‌ماند.

کد محفوظ PR366 در c4c4c9f0416e6a10fad11b5c0a800f0675aa3697، tree=5a22ab56f4260e40095c73eb813843a6958883aa است. مبنای stacked همان PR363 در1636258dec1701c2c6edcc4d60050c94eb0db7d6 است. این برگ پس از freeze روی شاخهٔ محلی صرفاً مستندات codex/p03-release-packet-20261031 تکمیل می‌شود؛ commit مستندات در manifest جدا از کد ثبت می‌شود. آرشیو source، بستهٔ بررسی است و شامل سطح آزمون است؛ build مقید به مقصد یا مجوز انتقال source/test page به main نیست. هیچ push یا workflow تازه برای این بسته انجام نمی‌شود.

### شاهد تازه و حدود پذیرش

run41150876762/job124386827174 روی checkout دقیق c4 موفق است:۸۹ آزمون محدود،۲۵ مرحله API و۱۱ معیار DOM. در دو گیت destroy، فرمان نامعلوم یک اثر و صفرPOST اضافی دارد؛ آماده‌سازی نامعلوم صفرcommand دارد. cleanup واقعی۱۷ process مرورگر و دو اجرای DB، هرکدام۶resource است. artifact13023256020 با SHA256=579b60622bac45c51fee4cfd1c04e429ab69ebc02a1f82a60e46b02e2114ee2b مستقل دانلود و کنترل شد؛ دو رسید رسمی همان c4 و SQLهای این بسته را مقید می‌کنند. failed55 و موفق163 حفظ می‌شوند؛ وضعیت شکست قدیمی با موفقیت تازه بازنویسی نمی‌شود.

هر پنج job عمومی run41150876796 موفق‌اند: Core124386827298، Security/SQL124386827437، Dependencies124386827516، DB124386827574 و Gate124388679652. checkout واقعی merge موقت49018a9b8eebfae59196095e5f84ee4f5859bcf8 با tree دقیقاً برابر c4 است. DB شمارش۴۰۰pass/۰fail/۰skip دارد. این merge موقت شاهد ادغام main نیست.

root پس از خواندن مستقل لاگ‌ها، دوام را فقط در محیط owned Linux/Auth/consumer پذیرفت. کد/آزمون/اجرای ایزوله و این پذیرش محدود ثبت‌اند؛ merge، deploy، عملکرد روی مقصد واقعی و پذیرش آرش هنوز از این شواهد نتیجه نمی‌شوند. login-form کامل و race واقعی SDK-null در DOM مشاهده نشده‌اند. مبلغ هزینهٔ CI زیرساخت null/UNOBSERVED است؛ خرید تازه انجام نشده، دادهٔ آزمون مصنوعی است، درخواست منبع پولی ثبت نشده و modelCalls برنامه در هر دو رسید صفر است. این صفر، محاسبات خود دستیار را پوشش نمی‌دهد.

### SQL واقعاً لازم؛ تصمیم پس از موجودی خواندنی مقصد

| موجودی واقعی مقصد | نامزد لازم و ترتیب | شرط توقف |
| --- | --- | --- |
| kernel ticket وجود ندارد، baseline دقیق سازگار است | ابتدا sql/consultation_ticket_requests.sql، سپس sql/consultation_ticket_prepared_intents.sql | هر پیش‌نیاز یا هویت نامعلوم؛ نصب اینجا انجام نمی‌شود |
| kernel ticket دقیقاً منطبق است، prepared وجود ندارد | فقط sql/consultation_ticket_prepared_intents.sql | ناسازگاری signature/تعریف/مالک/grant/trigger/RLS یا schema collision |
| هر دو دقیقاً منطبق‌اند | DDL تازه لازم نیست؛ readback و ثبت رسید | وجود نام جدول به‌تنهایی انطباق نیست |
| baseline ناموجود/ناسازگار یا نتیجهٔ نصب قبلی نامعلوم | توقف apply و بررسی catalog/تعریف/رسید توسط root | replay یا overwrite مجاز نیست |

SHA256 bytes اصلی Git برای requests برابر87a7a02774c8e215e2e72ae68de57a0083efa7de1420952275f43d5fcb20cbaa و prepared برابر60b66a3b52f76f4d3866b59a3a8e1fcf9ef823702a47200be0f17b0f929212e1 است. requests عمداً در صورت وجود schema خصوصی abort می‌کند؛ prepared هم وجود جدول را collision می‌داند. پس این فایل‌ها installer تکرارپذیرِ مقایسه‌نشده نیستند. نامزد migration رسمی فقط پس از بررسی و با CLI موجود ساخته می‌شود؛ نام/timestamp یا اتصال installer در این تحویل ساخته نشده است.

baseline موجود sql/consultation_workflow.sql پیش‌نیاز است؛ نامزد تازه‌ای برای replay همگانی نیست و خودش هر consultation collision را رد می‌کند. پیش‌نیازهای declared آن auth.uid، member_holding_versions، member_debt_positions، member_cash_flow_versions، member_cash_flow_entries، member_goals_versions، research_workbook_versions و research_workbook_reviews و نقش installer با superuser یا bypassrls هستند. نوع/ستون/توابع و ACL واقعی نیز باید با source بررسی شوند؛ فهرست نام‌ها کافی نیست. auth.users و نقش‌های موجود Supabase و UUID/hash/time توابع DB باید در همان مقصد معتبر باشند. grants/role ساختگیِ CI جایگزین این موجودی نیست.

requests علاوه بر load_consultation و access/keys از reject_mutation، uid/txt/amount/state و جداول consultation موجود استفاده می‌کند. prepared به authorized/command/capability موجود و همان رابطه/lock/trigger وابسته است و command را اجرا نمی‌کند. roster و replies وابستگی SQL تازهٔ مستقیم این بسته نیستند؛ baseline سفر عضو باید محفوظ و سازگار بماند و این دو فایل به بهانهٔ P03 دوباره نصب نمی‌شوند. sql/test و bootstrap-fixture/owned-fixture، چهار کاربر تازه و حق run-owned، هیچ‌کدام ورودی نصب محصول نیستند.

### خوانندهٔ سازگار پیش از هر نویسندهٔ آینده

ترتیب منطقی برای بررسی root: موجودی/هویت واقعی و backup/restore و ظرفیت معتبر؛ schema و RPC سازگار؛ build مقید به مقصد؛ سپس GET احرازشده از caller واقعی با بررسی actor/relation، تاریخچه، اصل UTF8/hash/time و ACL؛ تنها پس از این مراحل می‌توان فعال‌سازی جداگانهٔ حق واقعی و نویسنده را بررسی کرد. buildهای CI با placeholder یا origin آزمایشگاهی، artifact قابل نصب روی مقصد واقعی نیستند. URL خواندن بازار و کلید Auth/write نامرتبط نباید ترکیب شوند.

artifact فعلی GET و POST را در یک build دارد؛ binary مستقل reader-only یا کلید فعال‌سازی آماده‌ای در این بسته وجود ندارد. provider محصول بی‌قید not_connected باقی است و فقط fixture مستقل، در DB owned، دو actor/relation دقیق را باز می‌کند. admin، JWT metadata، client flag، env، ردیف prepared یا entitlement قدیمی حق محصول ایجاد نمی‌کند؛ fixture نباید وارد محصول شود. اتصال واقعی provider نیازمند قرارداد/مرجع اختیار جداگانه است و این بسته مجوز یا پیاده‌سازی آن نیست.

اگر DB قدیمی RPC آماده‌سازی را ندارد، خواندن جدید باید unavailable صریح بماند؛ unknown یا خرابی به فهرست خالی تبدیل نمی‌شود. تاریخچهٔ ticket قدیمی می‌تواند مستقل خوانده شود، ولی writer جدید تا durabilityReady معتبر متوقف می‌ماند. این افت کنترل‌شده، شاهد آمادگی مقصد نیست. مقصد/caller/بستهٔ نصب هنوز UNBOUND/NOT_READY است؛ تطبیق واقعی و تغییر installer متعلق به root است.

### برگشت پس از prepared intent و نتیجهٔ نامعلوم

برگشت داده با drop/delete/بازنویسی prepared، event، receipt یا تاریخچه انجام نمی‌شود. در نتیجهٔ نامعلوم نصب هم ابتدا catalog/تعریف/رسید بررسی می‌شود؛ فایل نامزد کور دوباره اجرا نمی‌شود. توقف نویسنده باید از caller و مرجع اختیار مصوب root انجام شود؛ هیچ مکانیزم عملیاتی تازه‌ای در این تحویل نصب نشده و حق واقعی محصول نیز فعال نیست.

آماده‌سازی نامعلوم فرمان ایجاد نمی‌کند: ورود واقعی تازه، metadata سرور و انتخاب صریح، lookup اصل body/token/hash؛ unknown همچنان unknown است. فقط غیبت قطعی و CAS/right معتبر می‌تواند حفظ مجددِ صریح با همان body/token را مجاز کند. فرمان نامعلوم: همان مسیر تا اصل محفوظ، سپس GET رسید قبلی؛ اثر/تاریخچهٔ منطبق یعنی تأیید همان اثر و صفرPOST دوم. فقط غیبت قطعی، CAS تغییرنکرده و حق جاری، retry صریح و عیناً یکسان را قابل بررسی می‌کند. mismatch/unavailable نوشتن را متوقف و اصل را حفظ می‌کند؛ token تازه یا انتخاب latest راه بازیابی نیست.

پس از وجود prepared، برگشت کل برنامه به163 یاb5 با نویسندهٔ فعال سازگار نیست: آن نسخه‌ها prepared را نمی‌شناسند و پیش‌مرحلهٔ دوام جدید را دور می‌زنند. خوانندهٔ سازگار c4 باید حفظ شود یا build برگشت سازگار دیگری جداگانه بررسی و اثبات شود. چنین build جایگزینی اینجا ساخته/آزموده نشده است؛ rollback آمادهٔ یک‌فرمانی ادعا نمی‌شود. root باید پیش از نصب، مسیر حفظ خواندن و توقف معتبر نوشتن را به مقصد/caller واقعی مقید کند.

### تحویل و تصمیم باز

بسته برای بررسی مستقل root آماده می‌شود؛ manifest، commit مستندات، آرشیو Git، SQLهای عیناً برابر blob و رسیدهای رسمی را جدا مقید می‌کند. این تحویل در همان برگ P03 است و دفتر وضعیت موازی نمی‌سازد. دریافت پیام با پذیرش بسته/مقصد فرق دارد. کار بعدی root، تعیین target/caller و برنامهٔ نصب/برگشت سازگار و مرجع حق واقعی است؛ پذیرش انسانی آرش و چرخهٔ کامل محصول همچنان بازند. START-B در این تحویل SQL apply، تغییر env/installer، merge/main، deploy، فعال‌سازی حق یا اجرای دوبارهٔ آزمون موفق انجام نمی‌دهد.
