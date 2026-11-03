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

requests علاوه بر load_consultation و access/keys از reject_mutation، uid/txt/amount/state و جداول consultation موجود استفاده می‌کند. prepared به authorized/command/capability موجود و همان رابطه/lock/trigger وابسته است؛ command در این نام، validator است و prepared هرگز execute نویسنده را صدا نمی‌زند. roster و replies وابستگی SQL تازهٔ مستقیم این بسته نیستند؛ baseline سفر عضو باید محفوظ و سازگار بماند و این دو فایل به بهانهٔ P03 دوباره نصب نمی‌شوند. sql/test و bootstrap-fixture/owned-fixture، چهار کاربر تازه و حق run-owned، هیچ‌کدام ورودی نصب محصول نیستند.

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

## پیوست تطبیق catalog؛ پیشنهاد خواندنی برای root، اجرا نشده توسط B

root بستهٔ review-only با ZIP76244fe52ba94ac53e0704d80625d0eb15b57f5e54fb7736a41ec6b8d29a7d46 و manifest431902dde44f15cc273c36d36abe041e2751fd052db47c3089e704e9b0591aa5 را مستقل پذیرفت؛ این پذیرش install-ready نیست. آن بسته و manifest قبلی immutable می‌مانند؛ پیوست حاضر revision مستندات است و بایت کد/SQL c4 را تغییر نمی‌دهد. root گزارش کرد در ۳۱ اکتبر۲۰۲۶ ساعت۰۴:۲۵:۳۰ تهران، خواندن catalog از sourceID9193 فقط consultation_private، نوزده تابع baseline شامل دو wrapper عمومی و نه جدول FORCE RLS را نشان داده و namespace/RPC تیکت/prepared مشاهده نشده است. B این مشاهدهٔ مقصد را مستقلاً اجرا نکرده؛ نام/تعداد، انطباق دقیق baseline را اثبات نمی‌کند. هر دو caller خواندنی طبق گزارش root روی Linux او موفق‌اند؛ Capturev2/legacy apply هنوز متصل نیست.

### مرز وابستگی و شاهد source

مرجع قطعی این نقشه git c4، sql/consultation_ticket_requests.sql و sql/consultation_ticket_prepared_intents.sql با هش‌های بالا، sql/consultation_workflow.sql و دو adapter موجود ticketStorageServer.ts و ticketAttemptStorageServer.ts است. سه سطح را جدا مقایسه کنید:

| سطح | واقعاً لازم | چیزی که از آن نتیجه نمی‌شود |
| --- | --- | --- |
| گارد نصب requests | load_consultation(uuid,date,date)، access(public.consultation_relationships,boolean,boolean)، keys(jsonb,text[],text[])؛ نبود کامل namespace consultation_ticket_private | این سه وجودسنجی تمام dependency/ACL/بدنه را کنترل نمی‌کنند |
| SQL requests و prepared هنگام اجرا | توابع/ستون‌ها و ACL زیر؛ prepared پس از kernel دقیق؛ نبود هر collision تابع/جدول/نوع هم بررسی شود | وجود authorized/command/capability برای prepared به‌تنهایی کافی نیست |
| هر GET و POST واقعی HTTP | auth.getUser سپس parent=load_consultation با p_relation و null برای هر دو تاریخ، validateConsultationRead و ticketStorageParent، سپس RPC تیکت | سلامت kernel مستقل، سلامت مسیر مالیِ parent را اثبات نمی‌کند |

در دو candidate هیچ فراخوانی public.command_consultation، load_consultation_roster، load_consultation_replies یا command_consultation_reply وجود ندارد. load_consultation در گارد requests صرفاً وجودسنجی می‌شود ولی در هر مسیر HTTP dependency اجرایی اجباری است. خود parent به roster/replies ارجاع ندارد. نبود این دو ممکن است در سفر کامل عضو اثر بگذارد؛ این یک گیت محصول جداست و این نقشه آن را حذف یا موجود فرض نمی‌کند.

### توابع baseline، ABI و semantics لازم

| signature واقعی PostgreSQL | استفاده و رفتار لازم |
| --- | --- |
| auth.uid() → uuid | هویت واقعی session؛ بدنه/مالک/grants از Auth همان مقصد خوانده شود، نه تابع شبیه‌سازی sql/test. catalog مجوز یا معتبر بودن JWT واقعی را اثبات نمی‌کند |
| consultation_private.keys(jsonb,text[],text[]) → void | رد کلید اضافه/کمبود؛ primitive مشترک command، capability و prepare |
| consultation_private.txt(jsonb,integer,boolean) → text؛ default سوم false | همان trim و nullable/حدود؛ فراخوانی دوپارامتری به default متکی است |
| consultation_private.uid(jsonb,boolean) → uuid؛ default دوم false | از txt(jsonb,integer,boolean) استفاده می‌کند؛ actor/relation/request/reference را اعتبارسنجی می‌کند |
| consultation_private.amount(jsonb,boolean) → bigint؛ default دوم false | integer نامنفی و حد۲^۵۳−۱ برای version؛ default/return/بدنه اهمیت دارد |
| consultation_private.access(public.consultation_relationships,boolean,boolean) → boolean؛ دو default false | SECURITY INVOKER و STABLE؛ auth.uid و revocations/advisors. read با false,false تاریخچهٔ خود عضو را پس revoke نگه می‌دارد، advisor لغوشده/disabled را رد می‌کند؛ write با true,false رضایت فعال می‌خواهد |
| consultation_private.state(uuid) → text | SECURITY INVOKER و STABLE؛ آخرین event_no سشن را به draft/submitted/approved/published/withdrawn نگاشت می‌کند؛ published یا withdrawn همراه publication برای مرجع دقیق مجاز است، latest session جای reference دقیق نیست |
| consultation_private.reject_mutation() → trigger | UPDATE/DELETE جدول‌های جدید را با42501 رد می‌کند؛ نباید no-op، definer ناسازگار یا تابع overload دیگری باشد |
| public.load_consultation(uuid,date,date) → jsonb | ABI نام‌دار p_relation,p_start_on,p_end_on و هر سه defaultNULL؛ SQL SECURITY DEFINER و search_path خالی؛ private.load را صدا می‌زند. HTTP همین نام‌ها را به PostgREST می‌فرستد |
| consultation_private.load(uuid,date,date) → jsonb | parent کامل، auth/ACL/قفل رابطه و locks مالی و تاریخ تهران، bounds و serialization؛ private.relation_json، access، period و state را می‌خواند |
| consultation_private.relation_json(public.consultation_relationships) → jsonb | id/client/advisor/label/time/revoked قرارداد parent |
| consultation_private.period(jsonb) → jsonb؛ day(jsonb,boolean) → date با defaultfalse | مسیر load→period→day→txt و keys؛ حدود روز و بازه و تقویم معتبر، بدون تبدیل unknown به تاریخ حدسی |

همهٔ privateهای بالا طبق source SECURITY INVOKER و search_path خالی‌اند؛ فقط access/state/relation_json در این مجموعه STABLE‌اند و بقیه defaultVOLATILE. public.load_consultation wrapper DEFINER است. public.command_consultation و private.execute مستقیماً dependency اجرای تیکت نیستند، ولی برای هم‌زمانی، revoke/consent writer باید همان lock consultation_relation و ترتیب actor→relation را نگه دارد. تغییر بدنهٔ access یا writer قفل را با تطبیق signature نمی‌توان نادیده گرفت.

در سطح kernel بعدی، requests دوازده تابع می‌سازد: هشت private شامل permission/capability/recommendation/command/authorized/history/load/execute و چهار wrapper عمومی. prepared هشت تابع اضافه می‌کند: پنج private شامل prepared_access/prepared_metadata/prepared_receipt/prepare/prepared_load و سه wrapper عمومی. prepared به authorized(uuid)، command(jsonb)، capability(uuid,uuid) و جدول‌های requests/events وابسته است؛ اجرای command(jsonb) فقط validate/normalize است و با execute(jsonb) نویسنده تفاوت دارد. permission محصول باید همان NOT_CONNECTED ثابت بماند؛ بدنهٔ owned_fixture اختلاف مجاز محصول نیست.

ABI عمومی جدید: load_consultation_ticket_inbox(p_relationship uuid)، load_consultation_ticket(p_relationship uuid,p_request uuid)، lookup_consultation_ticket(p_relationship uuid,p_request uuid,p_client_token text)، command_consultation_ticket(p_request jsonb)، prepare_consultation_ticket_attempt(p_body text)، lookup_consultation_ticket_attempt(p_relationship uuid,p_preparation uuid,p_client_token text)، load_consultation_ticket_attempts(p_relationship uuid)، همگی →jsonb. نام آرگومان، نبود overload ناخواسته، SECURITY DEFINER، search_path خالی و lock_timeout=3s باید مقایسه شوند. وجود تابع با نوع آرگومان درست و نام آرگومان نادرست ممکن است PostgREST را بشکند.

pg_catalog نیز لازم است: gen_random_uuid()→uuid، sha256(bytea)→bytea، convert_to(text,name)→bytea، encode(bytea,text)→text، hashtext(text)→integer، pg_advisory_xact_lock(integer,integer)→void و clock_timestamp()→timestamptz. query باید signature/نسخه/encoding را بخواند؛ نیازی به اجرای این توابع یا نصب pgcrypto در این طرح نیست. قفل‌ها از hashtext کلیدهای ثابت source استفاده می‌کنند؛ تغییر نامشان ناسازگاری semantics است.

### جداول/ستون‌های مستقیم baseline و مسیر parent

جدول زیر ستون‌هایی را نشان می‌دهد که واقعاً خوانده/ارجاع می‌شوند؛ این فهرست حداقل مصرف است، نه اجازهٔ صرف‌نظر از constraint، rowtype کامل، ordinal/type/nullability یا ستون اضافیِ ناسازگار. public.consultation_relationships و sessions در متغیرهای composite و SELECT* استفاده می‌شوند. FK جدید به auth.users(id) و consultation_relationships(id) علاوه بر نوع uuid به PK/UNIQUE معتبر و اختیار REFERENCES نصب‌کننده نیاز دارد.

| جدول | ستون‌های مصرف‌شده و نوع source | مسیر |
| --- | --- | --- |
| auth.users | id uuid کلید معتبر | FK actor/opened_by؛ auth.uid وابستگی هویت جدا |
| consultation_relationships | id/client_id/advisor_id uuid؛ created_at timestamptz؛ client_label text برای parent | authorized، actor/role، clock ordering، composite access؛ parent |
| consultation_advisors | user_id uuid، enabled/is_owner boolean؛ display_name text برای parent | access و owner action و parent |
| consultation_revocations | relationship_id uuid | access و relation_json؛ ستون‌های actor_id/revoked_at بخشی از baseline کامل‌اند ولی ticket مستقیم نمی‌خواند |
| consultation_sessions | id/relationship_id uuid، version integer، content_hash text؛ session_key/actor_id uuid، body jsonb، created_at timestamptz در parent | reference دقیق و parent؛ خود تیکت body توصیه را بازنویسی نمی‌کند |
| consultation_events | session_id uuid، kind text، event_no bigint؛ id/actor_id uuid، created_at timestamptz، note text در parent | state و parent؛ ترتیب event_no و uniqueness معتبر لازم است |
| consultation_publications | session_id uuid | مرجع منتشرشده و parent؛ approval_id/actor_id/published_at برای upstream baseline حفظ شوند |
| consultation_private_notes | session_id uuid، note text | فقط parent برای advisor مجاز |
| consultation_actions | id/session_id/action_key/actor_id uuid، version integer، status/text text، created_at timestamptz | فقط parent؛ bound۵۰۰ |
| member_holding_versions | id/user_id uuid، version integer | parent آخرین نسخه؛ rowtype کامل حفظ شود |
| member_holding_positions | version_id uuid؛ position_key/title/manual_label/symbol/unit/valuation_source text؛ qty/ownership_pct numeric؛ declared_value bigint؛ valuation_as_of/as_of date | parent؛ title و valuation ستون‌های recovery موجود لازم‌اند؛ این جدول حتی در گارد اولیه workflow صریح چک نشده ولی runtime از آن می‌خواند |
| member_debt_positions | version_id uuid؛ debt_key/title text؛ balance_toman/next_installment_toman bigint؛ balance_as_of/next_due_on date | parent، همان نسخهٔ دارایی |
| member_cash_flow_versions | id/user_id uuid؛ period_start/period_end date؛ version/entry_count integer؛ account_definitions/scope_account_keys/opening/coverage jsonb | parent؛ count entries باید با entry_count سازگار باشد |
| member_cash_flow_entries | version_id uuid؛ entry_key/basis/kind/category/note/account_key/from_account_key/to_account_key text؛ amount_toman bigint؛ occurred_on date؛ source jsonb | parent، serialization کامل رویدادها |
| member_goals_versions | id/user_id uuid؛ version integer؛ payload jsonb | parent، rowtype کامل حفظ شود |

نام‌های consultation در جدول بالا در schema public هستند؛ financialها هم public هستند. نهمین جدول baseline، consultation_command_receipts، مسیر writer اصلی است و parent/ticket از آن نمی‌خواند؛ با این وجود در snapshot کامل baseline باید PK(actor_id,client_token)، immutability، ACL/RLS و تعریفش حفظ شود. جدول‌های جدید requests/events/receipts و prepared_intents باید عین تعریف candidate با ستون‌های NOTNULL، PK/FK/UNIQUE/CHECK و index و trigger و RLS مقایسه شوند؛ گزارش فقط تعداد ستون کافی نیست.

### کدام همراه CI بوده و چه چیزی upstream است

sql/test/supabase_bootstrap.sql و profile_explicit_grants.sql نقش/Auth/profiles آزمایشگاهی می‌سازند؛ portfolio_precondition.sql شکل آزمونی portfolio و deny_mutation و وابستگی‌های دیگر را می‌سازد. اینها پیش‌شرط نصب محصول نیستند. bootstrap-fixture.sql فقط دو جدول خالی risk_assessments/risk_revalidations برای load_consultation_roster می‌سازد؛ هیچ مسیر ticket/attempt یا parent load به این دو دسترسی ندارد. owned-fixture.sql حق دو actor/relation در DB owned و توابع fixture را ایجاد می‌کند؛ نه dependency محصول است، نه ورودی apply.

فایل‌های مالی phase32/recovery/cash-flow/goals در CI شکل baseline لازم برای parent را فراهم کردند؛ **جدول/قرارداد حاصل وابستگی runtime است، replay خود فایل‌های تاریخی لازم/مجاز فرض نمی‌شود**. phase34 research_workbook_versions/reviews برای نصب اصلی workflow و private.research_current و تأیید/انتشار upstream استفاده می‌شود؛ ticket/prepare و parent.load در source c4 مستقیماً research_current یا این دو جدول را صدا نمی‌زنند. profiles(role) نیز در policyهای پژوهش و endpointهای مالی/مرز نقش برنامه استفاده شده، اما خود دوcandidate یا parent.load آن را SELECT نمی‌کنند. امنیت Auth/role کل برنامه گیت جداگانهٔ خود را حفظ می‌کند. roster/replies همراه سفر و آزمون هستند؛ هیچ object آنها نباید بی‌دلیل به preflight مستقیم kernel افزوده یا برای عبور از آن ساخته شود.

### ACL، مالک wrapper و FORCE RLS

baseline source هر نه جدول public مشاوره را ENABLE+FORCE RLS، بدون policy و با REVOKE از PUBLIC/anon/authenticated/service_role می‌سازد؛ private schema و private functions نیز default-deny هستند. همهٔ جدول‌ها غیر از advisors، trigger UPDATE/DELETE و TRUNCATE به reject_mutation دارند. sequence consultation_events_event_no_seq هم direct grant به این چهار مقصد ندارد. private ticket schema و جدول‌های جدید ENABLE RLS دارند ولی FORCE در candidate نیامده؛ prepared هم همین است. تغییر FORCE/policy/trigger باید اختلاف ثبت شود، نه خودکار اصلاح شود.

مالک واقعی هر SECURITY DEFINER wrapper هویت اجرایی آن است. اختیار لازم دو لایه دارد: USAGE schema/EXECUTE توابع private و auth.uid، SELECT تمام جدول‌های callgraph و INSERT جدول‌های نویسنده و اختیار default/sequence در صورت مصرف؛ و امکان عبور از FORCE RLS baseline. در baselineِ بدون policy، مالک عادی جدول با FORCE از RLS عبور نمی‌کند؛ rolsuper یا rolbypassrls واقعیِ خود نقش definer یا مسیر سیاستیِ جداگانه و بررسی‌شده لازم است. عضویت در نقشی که BYPASSRLS دارد به‌تنهایی آن attribute را ارث نمی‌دهد. BYPASSRLS هم جای SELECT/INSERT/EXECUTE SQL grant را نمی‌گیرد. این طرح برای کمبود اختیار GRANT/تغییرrole/کاهشRLS پیشنهاد یا اجرا نمی‌کند؛ اختلاف یک مانع release برای root است.

authenticated فقط EXECUTE روی wrapperهای عمومی لازم و USAGE schema public/auth لازم را دارد؛ private EXECUTE/جدول/ستون نباید از PUBLIC، direct grant، نقش موروثی یا custom default privileges نشت کند. service_role هم با داشتن BYPASSRLS از منع EXECUTE خودکار عبور نمی‌کند. proacl=NULL یعنی defaultACL است، نه «بدون grant»؛ default اجرای FUNCTION می‌تواند PUBLIC باشد. ACL ستون را هم بخوانید: REVOKE جدول به‌تنهایی امتیاز SELECT ستونیِ جدا را نفی نمی‌کند. typacl/مالک rowtype، schema CREATE/USAGE، role membership و grant option هم در diff ثبت شوند. privilege خوانندهٔ catalog با privilege صاحب definer یا authenticated یکی نیست.

### طرح query خواندنی؛ root پس از بررسی می‌تواند اجرا کند

تمام کدهای زیر **پیشنهاد بررسی‌نشده روی مقصد** هستند؛ B آنها را حتی محلی روی DB اجرا نکرده است. هیچ query دادهٔ عضو، body، token، session/JWT، کلید یا جدول کسب‌وکار را SELECT نمی‌کند. function body فقط متن تعریف schema است و خروجی catalog باید خصوصی بماند. اجرای app RPC، auth.uid، SET ROLE، EXPLAIN ANALYZE، function test و هر DDL/DML خارج از این طرح‌اند. نام sourceID9193 را با receipt اتصال root مقید کنید؛ dbname به‌تنهایی شاهد هویت شبکه نیست. پیش از ادامه اگر شمار objectها غیرمنتظره/خروجی truncate شده است، توقف و scope review؛ LIMIT کور برای سبزکردن diff نگذارید.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
SELECT current_database() AS database_name, current_user AS catalog_reader,
       session_user AS login_role,
       current_setting('server_version_num') AS server_version_num,
       current_setting('server_encoding') AS server_encoding,
       current_setting('transaction_read_only') AS read_only;
-- Continue the following SELECTs in this snapshot; COMMIT when all are captured.
```

۱. inventory بدون تکیه به وجود type یا RPC. نبود namespace/جدول باید ردیف absent بدهد؛ به‌ویژه برای access که آرگومان composite دارد، to_regprocedure روی type غایب می‌تواند خود query را خطادار کند، پس ابتدا جدول/type را بخوانید. scope مثبت baseline همان نه جدول است، نه شمارش همهٔ اسم‌های شبیه به consultation.

```sql
SELECT wanted.name, n.oid IS NOT NULL AS present,
       owner.rolname AS owner, n.nspacl
FROM (VALUES ('auth'),('public'),('consultation_private'),
             ('consultation_ticket_private')) AS wanted(name)
LEFT JOIN pg_namespace n ON n.nspname = wanted.name
LEFT JOIN pg_roles owner ON owner.oid = n.nspowner
ORDER BY wanted.name;

WITH scope(schema_name,table_name) AS (VALUES
 ('auth','users'),
 ('public','consultation_advisors'),('public','consultation_relationships'),
 ('public','consultation_revocations'),('public','consultation_sessions'),
 ('public','consultation_private_notes'),('public','consultation_events'),
 ('public','consultation_publications'),('public','consultation_actions'),
 ('public','consultation_command_receipts'),
 ('public','member_holding_versions'),('public','member_holding_positions'),
 ('public','member_debt_positions'),('public','member_cash_flow_versions'),
 ('public','member_cash_flow_entries'),('public','member_goals_versions'),
 ('consultation_ticket_private','requests'),
 ('consultation_ticket_private','events'),
 ('consultation_ticket_private','receipts'),
 ('consultation_ticket_private','prepared_intents')
)
SELECT s.schema_name, s.table_name, c.oid IS NOT NULL AS present,
 c.relkind, owner.rolname AS owner, c.relrowsecurity, c.relforcerowsecurity,
 c.relacl, c.reltype::regtype::text AS rowtype, t.typacl,
 (SELECT jsonb_agg(jsonb_build_object(
   'ordinal',a.attnum,'name',a.attname,
   'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
   'identity',a.attidentity,'generated',a.attgenerated,'columnAcl',a.attacl,
   'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
  FROM pg_attribute a LEFT JOIN pg_attrdef d
   ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,
   'validated',k.convalidated,'deferrable',k.condeferrable,
   'deferred',k.condeferred,'definition',pg_get_constraintdef(k.oid,false))
   ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
 (SELECT jsonb_agg(jsonb_build_object('name',x.relname,'valid',i.indisvalid,
   'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid))
   ORDER BY x.relname) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid
   WHERE i.indrelid=c.oid) AS indexes,
 (SELECT jsonb_agg(jsonb_build_object('name',g.tgname,'enabled',g.tgenabled,
   'function',g.tgfoid::regprocedure::text,
   'definition',pg_get_triggerdef(g.oid,false)) ORDER BY g.tgname)
   FROM pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal) AS triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,
   'roles',ARRAY(SELECT CASE WHEN rid=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(rid)::text END FROM unnest(p.polroles) AS u(rid)),
   'using',pg_get_expr(p.polqual,p.polrelid),
   'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
   FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
FROM scope s LEFT JOIN pg_namespace n ON n.nspname=s.schema_name
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=s.table_name
LEFT JOIN pg_roles owner ON owner.oid=c.relowner
LEFT JOIN pg_type t ON t.oid=c.reltype
ORDER BY s.schema_name,s.table_name;
```

۲. متن و metadata توابع و امضای builtin. query نام‌محور overloadها را هم نشان می‌دهد؛ در scope حاضر هر تابعی که source انتظار ندارد اختلاف است. اگر baseline typeها موجودند، identity_arguments/result/argnames/defaults را با جدول ABI بالا و source تطبیق دهید. namespace ticket غایب در خروجی صفر تابع دارد و این به‌تنهایی فقدان wrapperهای public را اثبات نمی‌کند، بنابراین public جدا scope شده است.

```sql
SELECT n.nspname AS schema_name, p.proname,
 pg_get_function_identity_arguments(p.oid) AS identity_arguments,
 p.proargnames, p.pronargdefaults,
 pg_get_function_arguments(p.oid) AS arguments_with_defaults,
 pg_get_function_result(p.oid) AS result,
 l.lanname AS language, p.prokind, p.prosecdef, p.provolatile,
 p.proisstrict, p.proleakproof, p.proparallel, p.proretset,
 p.proconfig, owner.rolname AS owner, owner.rolsuper, owner.rolbypassrls,
 p.proacl, p.prosrc,
 CASE WHEN p.prokind='f' THEN pg_get_functiondef(p.oid) END AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
JOIN pg_roles owner ON owner.oid=p.proowner
WHERE (
 n.nspname IN ('consultation_private','consultation_ticket_private') OR
 (n.nspname='auth' AND p.proname='uid') OR
 (n.nspname='public' AND p.proname IN (
  'load_consultation','command_consultation',
  'load_consultation_ticket_inbox','load_consultation_ticket',
  'lookup_consultation_ticket','command_consultation_ticket',
  'prepare_consultation_ticket_attempt','lookup_consultation_ticket_attempt',
  'load_consultation_ticket_attempts')))
ORDER BY n.nspname,p.proname,identity_arguments;

SELECT signature, to_regprocedure(signature) IS NOT NULL AS present
FROM (VALUES ('pg_catalog.gen_random_uuid()'),
 ('pg_catalog.sha256(bytea)'),('pg_catalog.convert_to(text,name)'),
 ('pg_catalog.encode(bytea,text)'),('pg_catalog.hashtext(text)'),
 ('pg_catalog.pg_advisory_xact_lock(integer,integer)'),
 ('pg_catalog.clock_timestamp()')) AS wanted(signature)
ORDER BY signature;
```

pg_get_functiondef فرمت canonical سرور است و با SHA فایل SQL Git مقایسهٔ مستقیم نمی‌شود. برای LANGUAGE sql/plpgsql با بدنهٔ dollar-quoted موجود در این source، prosrc را با **همان متن بین delimiterها در blob Git LF** و metadata declaration جدا مقایسه کنید؛ newline/trim را خودکار نرمال نکنید. تغییر صرف فرمت بیرون بدنه با تغییر lock/شرط/security یکی نیست؛ اختلاف باید با گزارش object/field/expected/observed طبقه‌بندی شود. auth.uid از release/Auth همان مقصد expected می‌گیرد، نه mock CI. signature موجود+body نامعلوم یعنی UNPROVEN، نهPASS. pg_depend در بدنه‌های string-based sql/plpgsql همهٔ ارجاع‌ها را ثبت نمی‌کند؛ absence در pg_depend این callgraph source را نفی نمی‌کند.

۳. نقش‌ها، membership، default ACL و ACL مؤثر. نقش catalog_reader، wrapperowner مشاهده‌شده و هر deployment ownerِ مصوب root باید به scope نقش‌ها افزوده شوند؛ owner آینده هنوز تعیین نشده است. queryهای زیر wrapperهای موجود و خصوصی‌های مربوط را می‌گیرند و membership را فقط برای نقش‌های مؤثر همین scope باز می‌کنند؛ نقش جدید یا SET ROLE ندارند.

```sql
WITH RECURSIVE seeds(oid) AS (
 SELECT oid FROM pg_roles WHERE rolname IN
  ('anon','authenticated','service_role',current_user,session_user)
 UNION SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('consultation_private','consultation_ticket_private')
    OR (n.nspname='public' AND p.proname IN
      ('load_consultation','command_consultation',
       'load_consultation_ticket_inbox','load_consultation_ticket',
       'lookup_consultation_ticket','command_consultation_ticket',
       'prepare_consultation_ticket_attempt','lookup_consultation_ticket_attempt',
       'load_consultation_ticket_attempts'))
), reachable(oid) AS (
 SELECT oid FROM seeds UNION
 SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member=r.oid
)
SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcanlogin,
 (SELECT jsonb_agg(jsonb_build_object('parent',parent.rolname,
   'adminOption',m.admin_option,
   'inheritOption',to_jsonb(m)->>'inherit_option',
   'setOption',to_jsonb(m)->>'set_option') ORDER BY parent.rolname)
  FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
  WHERE m.member=r.oid) AS memberships
FROM reachable x JOIN pg_roles r ON r.oid=x.oid ORDER BY r.rolname;

SELECT creator.rolname AS creator, n.nspname AS schema_name,
 d.defaclobjtype, d.defaclacl
FROM pg_default_acl d JOIN pg_roles creator ON creator.oid=d.defaclrole
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclnamespace=0 OR n.nspname IN
 ('public','auth','consultation_private','consultation_ticket_private')
ORDER BY creator.rolname,n.nspname,d.defaclobjtype;

-- Expand each observed proacl using its actual owner and PostgreSQL defaults.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
 pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
WHERE n.nspname IN ('consultation_private','consultation_ticket_private')
 OR (n.nspname='public' AND p.proname IN
   ('load_consultation','command_consultation',
    'load_consultation_ticket_inbox','load_consultation_ticket',
    'lookup_consultation_ticket','command_consultation_ticket',
    'prepare_consultation_ticket_attempt','lookup_consultation_ticket_attempt',
    'load_consultation_ticket_attempts'))
ORDER BY n.nspname,p.proname,args,grantee;
```

همین aclexplode را برای nspacl با acldefault('n',nspowner)، relacl جدول با acldefault('r',relowner)، sequence با acldefault('s',relowner) و typacl با acldefault('T',typowner) به‌کار ببرید؛ حروف کوچک/بزرگ مهم‌اند: s برای SEQUENCE است و S برای FOREIGN SERVER. attacl پیش‌فرضِ grant ستونی ندارد و null با آرایهٔ خالی aclitem[] جایگزین می‌شود. scope جدول همان جدول‌های query۱ است؛ sequence صریح public.consultation_events_event_no_seq و هر dependency واقعی از pg_depend برای defaultهاست. defaultACL خروجی همهٔ creatorهای مرتبط را می‌دهد؛ unrelated creator را با دلیل حذف کنید، نه با تصور owner یگانه.

برای اثر عضویت/PUBLIC، علاوه بر ACL خام، ضرب نقش‌های شناخته‌شده در objectهای همان scope و توابع builtin/Auth را با has_schema_privilege(role_oid,nsp_oid,'USAGE')، has_schema_privilege(...,'CREATE')، has_function_privilege(role_oid,proc_oid,'EXECUTE')، has_table_privilege(role_oid,table_oid,privilege) برای هرکدام SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER، has_any_column_privilege(...,'SELECT') و در صورت true ستون‌به‌ستون has_column_privilege(role_oid,table_oid,attnum,'SELECT') و has_sequence_privilege(...,'USAGE') بررسی کنید. oidها فقط از LEFT JOIN catalogِ موجود برداشته شوند؛ نقش یا object غایب را null/MISSING ثبت کنید و به has_* نفرستید. has_* تابع catalog است و app function را اجرا نمی‌کند؛ بااین‌حال این SELECTها هم اینجا صرفاً طرح هستند، نه شاهد runtime.

برای definerowner، جدول‌های جدید نیازمند SELECT و INSERT و baseline فقط SELECT/EXECUTE است؛ برای ساخت candidate، CREATE schema/جدول/تابع و REFERENCESِ FK و زبان لازم، موضوع اختیار نصب‌کننده است که با اختیار runtime خلط نمی‌شود. querycatalog مجوز عملیاتی استفاده از این اختیار نیست. دسترسی runtime authenticated به تابع auth.uid و public wrapper را از دسترسی private جدا نگه دارید؛ در baseline app هیچ direct table/column/private EXECUTE نمی‌گیرد. خروجی role graph ممکن است مسیرهای غیرموروثی SET ROLE را نشان دهد؛ بدون آزمون یا تغییرrole، آن را grant مؤثر خودکار حساب نکنید.

۴. جمع‌بندی snapshot با COMMIT؛ ثبت catalogdiff خارج DB. برای هر object: نام کامل+identity args، field، expected از blob c4 یا baseline موجودِ تأییدشده، observed از receipt همان snapshot، طبقهٔ EXACT/MISSING/DIFFERENT/UNOBSERVED و دلیل اثر. تعریف/owner/grant/نوع/constraint/index/trigger/RLS/policy/default/role context جدا مقایسه شوند؛ OID و شمارهٔ attnum مربوط به objectهای متفاوت بین دوDB را شناسهٔ جهانی فرض نکنید. attnum داخل همان rowtype ترتیب ستون را ثابت می‌کند. نتیجهٔ JSON null مثل policies=null را به معنای «خروجی query ناقص» یا «انطباق» حدس نزنید؛ presence/count و capture completeness جدا ثبت شوند.

```sql
COMMIT;
```

اگر private kernel کاملاً غایب است، catalogdiff جدیدها MISSING_EXPECTED_BEFORE_INSTALL و baseline هنوز NEEDS_EXACT_DIFF است؛ نصب آماده اعلام نمی‌شود. اگر schema یا بخشی از wrapper/type/table جدید وجود دارد، partial collision به معنای STOP_RECONCILE است، نه دستور ادامهٔ نیمهٔ دوم. تغییر RLS/owner/grants برای عبور از تفاوت، نصب roster/replies، replay مالی/پژوهش یا fixture، اجرای candidate، و تغییر Capturev2/legacy apply هیچ‌کدام بخشی از این تحویل نیست. root با همین نقشه می‌تواند گپ فنی baseline/caller را بررسی کند؛ تصمیم تازه‌ای از آرش برای صرفِ catalogdiff لازم فرض نشده است.

مرجع semantics privilege/definer و RLS، مستندات رسمی Supabase است: https://supabase.com/docs/guides/database/functions و https://supabase.com/docs/guides/database/postgres/row-level-security . جزئیات acldefault/has_* در https://www.postgresql.org/docs/16/functions-info.html ، FORCE/BYPASS در https://www.postgresql.org/docs/16/ddl-rowsecurity.html و prosrc در https://www.postgresql.org/docs/16/catalog-pg-proc.html مستقلاً بررسی شد؛ نسخهٔ واقعی مقصد باید از catalog خوانده شود. این منابع جای readback خصوصی catalog یا پذیرش روی مقصد واقعی را نمی‌گیرند.

## مقایسهٔ فایل catalog واقعی root؛ بدون اجرای SQL توسط B

root نه SELECT catalog و snapshot/effectivePrivilege را در همان REPEATABLE READ READ ONLY روی source واقعی اجرا و فایل خروجی را تحویل داد. B فقط فایل محلی را خواند و با blob ثابت Git c4 مقایسه کرد؛ اتصال یا اجرای تازهٔ SQL توسط B انجام نشد. پیشنهاد0702، بستهٔ انتشار قبلی، JSON خام root و diagnostic اولیهٔ او تاریخی و دست‌نخورده می‌مانند.

ورودی: outputs/v04-program-20261030/p03-baseline-catalog-result-20261031.json با SHA256=324baa92392f69b5fa8c483fe0864d99b4386276ff93e1671f57de695bfb178e؛ sourceId=9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c و querySHA256=dd4fc43c375dcbeeeaf44804a78f7eb5d503eee68b37e1a99e3d93f6d8d24a7d. نسخه PG17.6 با server_version_num=170006، encoding=UTF8، read_only=on و snapshot25961:25961: است. زمان receipt در ۳۱ اکتبر۲۰۲۶ ساعت۰۴:۳۵:۵۶ تهران است؛ snapshot catalog در01:05:56.145447Z و receipt در01:05:56.357142Z صادر شده‌اند. snapshot فقط همین catalog است، نه backup یا پذیرش رفتار برنامه.

خروجی مقایسهٔ محلی: outputs/member-consultation-journey-20261031/p03-baseline-dependency-field-diff-20261031.json با SHA256=a7da94d3658c5d6d1b383500ed722a4bd9728bc11b4bfef34af5e7bee369eefa. این receipt هش ورودی‌ها، declaration/prosrc و metadata، ستون/قید/index/trigger و مجوز مشاهده‌شده را جدا نگه می‌دارد. اسکریپت صرفاً offline فایل و Git را می‌خواند؛ DB driver، parser/server PostgreSQL، اجرای function، آزمون مجدد یا DDL ندارد. استخراج lexical فقط برای declarationهای محدود همین source است، نه ابزار اثبات هم‌ارزی هر SQL.

### بدنهٔ خام و خطای diagnostic قبلی

از۱۹ تابع baseline، سه prosrc بایت‌به‌بایت برابرند: reject_mutation، public.command_consultation و public.load_consultation. شانزده prosrc دیگر **DIFFERENT_BODY_BYTES** می‌مانند؛ هر شانزده با تبدیل صرف CRLF→LF در کپی حافظهٔ diagnostic برابر source هستند و bareCR همگی صفر است. برای هرکدام SHA256 خام هر دو طرف و تعداد CRLF ثبت شده است؛ هیچ trim/بازنویسی منبع یا بدنهٔ فعال انجام نشده است. این تشخیص مجوز نرمال‌کردن SQL، کاهش guard بایتی یا اعلام overallEXACT نیست.

در diagnostic اولیهٔ root، proconfig برای research_current فقط با expected search_path مقایسه شده بود و lock_timeout=3s اضافی به‌نظر رسید. declaration واقعی git c4 در sql/consultation_workflow.sql:177 و reference محفوظ0702 هر دو صریحاً SET search_path='' SET lock_timeout='3s' دارند. observed نیز دقیقاً ['search_path=""','lock_timeout=3s'] است. در مقایسهٔ جدید تمام SETهای declaration استخراج و با کل proconfig جفت شدند؛ اختلاف واقعی تنظیمات مشاهده نشد. root نیز false-positive ابزار اولیه را تأیید کرد؛ فایل قبلی حفظ می‌شود و هیچ گیت نصب با آن عبور نکرده است.

### ماتریس فیلدهای مقایسه‌شده

| دامنه | شمار و روش مقایسه | نتیجه و حد |
| --- | --- | --- |
| ABI/metadata تمام۱۹ تابع baseline |۲۶۶ فیلد: identity args، نام args، تعداد/default expression، result، language، kind، definer، volatility، strict، leakproof، parallel، retset و کل proconfig؛ reference با خود blob Git دوباره تطبیق شد | همهٔ فیلدهای این scope برابر؛ این برابری شامل شانزده body خام نمی‌شود |
| نه جدول consultation |۴۶ ستون کامل با نام/ordinal/type/nullability/default/identity/generated/columnACL؛ rowtype و relkind و ENABLE/FORCE نیز مقایسه شدند | اختلاف فیلد یا ستون اضافی مشاهده نشد؛ هر نه جدول r، مالک مشاهده‌شده postgres و FORCE RLS دارند |
| constraintهای baseline |۳۴ قید؛ PK/FK/UNIQUE با کلید و جدول مرجع، شش CHECK با mapping معناییِ صریح source→canonical catalog و flags validated/deferrable/deferred | همه منطبق با scope؛ CHECKها raw SQL byte equality یا نتیجهٔ parser ادعا نشده‌اند. نام‌های خودکار constraint چون در source تصریح نشده‌اند observed نگه داشته شدند، نه جعل expected نام |
| index/trigger/policy baseline |۱۶ index با definition/ready/valid؛۱۶ trigger با نام/function/enabled/event/row-or-statement؛ نبود policy و نبود index/trigger غیرمنتظره | همه مطابق تعریف source؛ advisors طبق source trigger immutable ندارد؛ بقیه هریک دو trigger دارند |
| parent مالی در شش جدول موجود |۶۶ ستون کاملِ source حاصل phase32+recovery/cash-flow/goals، ازجمله qty nullable و هفت ستون افزودهٔ recovery؛۱۸ قید کلیدی PK/FK/UNIQUE و SELECT مالک parent | فیلدهای مقایسه‌شده بدون اختلاف؛ جدول‌های مالی و ستون title/valuation موجودند. CHECKها/policyهای نویسندهٔ مالی در خروجی حفظ شدند ولی این تحویل ممیزی مجدد کل نویسندگان مالی نیست |
| auth.users(id) | uuid، NOTNULL، نبود generated/identity، PK(id) معتبر و raw ACL موجود | FK target از نظر این فیلدها معتبر است؛ صرفِ catalog، caller/JWT یا اختیار عملیاتی installer تازه را اثبات نمی‌کند |
| builtinها | هر هفت signature پیشنهادی snapshot موجود است | وجود signature ثبت شده؛ اجرای digest/UUID/lock یا رفتار runtime روی مقصد انجام نشده است |
| objectهای تیکت/prepared | namespace خصوصی، چهار جدول و۲۰ تابع candidate غایب‌اند | MISSING_EXPECTED_BEFORE_INSTALL؛ وجود baseline دلیل نصب خودکار نیست و جزئیات candidate روی مقصد هنوز قابل readback نیست |

در این ماتریس متفاوت‌بودن fieldهای انتخاب‌شده صفر و object غیرمنتظرهٔ baseline صفر است؛ این عدد تعریف‌شده در receipt با وضعیت byte-different بدنه‌ها، scope پوشش‌داده‌نشده و پذیرش عملیاتی جمع زده یا جایگزین نمی‌شود. schema واقعی Auth با mock CI مقایسه نشده است. auth.uid موجود SQL/STABLE/INVOKER با UUID result است و تعریفش sub را از claim setting session می‌خواند؛ هش آن ثبت شده ولی اصالت release Auth و معتبر بودن session/caller واقعی گیت جداست.

### مالک و ACL موجود، و پوششِ محدود receipt

هر دو wrapper اصلی موجود مالک postgres دارند: rolsuper=false و rolbypassrls=true. تمام baseline helperها SECURITY INVOKER و مالک postgres هستند. در capture، authenticated روی دو wrapper عمومی EXECUTE دارد و anon/service_role ندارند؛ هر سه app role روی۱۷ helper خصوصی EXECUTE و USAGE schema خصوصی ندارند. postgres روی همان helperها execute/schemaUsage دارد. اینها فیلدهای واقعی catalog هستند؛ به مالک یا caller آیندهٔ candidate تعمیم نمی‌یابند.

raw ACL هر نه جدول baseline فقط postgres=arwdDxtm/postgres است؛ ACL تک‌ستون‌ها null و policyها null‌اند. در نقش‌های anon/authenticated/service_role، SELECT/INSERT/UPDATE/DELETE و شاخص allColumnsSelect روی هر نه جدول false است؛ postgres true و BYPASSRLS خودش true است. allColumnsSelect=false به‌تنهایی «هیچ ستون قابل خواندن نیست» معنی نمی‌دهد؛ در این بررسی raw columnACL و tableACL و نبود عضویت برای سه app role هم جدا دیده شد. ۱۱۸ ردیف privilege-policy مقایسه شده است:۷۶ تابع،۳۶ جدول baseline و۶ ردیف SELECT مالک شش جدول مالی.۱۸ ردیف privilege دیگر مالی، رفتار موجود endpointهای مالی‌اند و این تحویل آنها را به حق تیکت تبدیل نمی‌کند.

raw schemaACL برای consultation_private فقط postgres=UC است؛ public برای PUBLIC/appRoleها USAGE و برای pg_database_owner مالکیت/CREATE را نشان می‌دهد، نه CREATE همگانی. auth schema برای postgres USAGE دارد و raw ACL تابع auth.uid دارای PUBLIC EXECUTE است؛ raw ACL auth.users نیز REFERENCES برای postgres نشان می‌دهد. بااین‌حال capture، ردیف effective has_* مربوط به auth.uid/auth.users یا sequence و CREATE نصب‌کنندهٔ آینده را ندارد؛ اینها **UNOBSERVED_EFFECTIVE_CAPTURE** می‌مانند و «کلACLمقصد exact» اعلام نمی‌شود. sequence مورد استفادهٔ upstream writer با خواندن event_no توسط state یکی نیست؛ مصرف sequence در writer اصلی گیت جدا را حفظ می‌کند.

defaultACL موجودِ creator postgres در public برای function/table/sequence به سه appRole grant اولیه می‌دهد، اما ACL واقعی objectهای baseline بعد REVOKE محدود است. بنابراین defaultACL را با ACL فعلی یکی نگیرید؛ wrapper جدید باید پس از هر نصب مجاز ACL واقعی خودش را بازخوانی کند. در pg_default_acl.defaclobjtype مقدار **S بزرگ به معنی sequence** است؛ این واژگان با آرگومان تابع acldefault فرق دارد که **s کوچک برای sequence** و S بزرگ برای foreign server می‌خواهد. این تمایز از مستندات رسمی PG17 تأیید شد: https://www.postgresql.org/docs/17/catalog-pg-default-acl.html . هیچ defaultACL یا grant تغییر نکرد.

### گیت باز و تحویل بعدی

این تحویل مقایسهٔ فایل واقعی با source است؛ overallEXACT، INSTALL_READY یا تأیید نصب اعلام نمی‌شود. sourceID و snapshot و شمارش از receipt root می‌آیند؛ B اتصال تازه به DB نساخته است. فیلدهای ABI/نوع/ستون/قید baseline اکنون شاهد مقایسه دارند و proconfig false-positive رفع تشخیصی شده؛ شانزده اختلاف raw body با diagnostic CRLF و محدودیت privilege capture آشکار می‌مانند.

مالک ادامه root است: پذیرش محدودِ این matrix، تصمیم فنی دربارهٔ guard بایتی baseline بدون تغییر خام، پوشش خواندنی لازم Auth/sequence/installer context، اتصال Capturev2/legacy apply و برنامهٔ reader/rollback مقید به مقصد. body/JSON واقعی parent، data quality/null/date، Auth/RPC caller، حق واقعی خدمت و پذیرش آرش از catalog نتیجه نمی‌شوند. هیچ SQL، GRANT، آزمون تکراری، branch code، نصب، تغییر حق، پاک‌سازی یا replay برای این پیوست انجام نشده است.
