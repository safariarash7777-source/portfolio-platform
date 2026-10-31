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
