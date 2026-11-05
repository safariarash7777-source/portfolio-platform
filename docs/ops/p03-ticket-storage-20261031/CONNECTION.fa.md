# اتصال ذخیرهٔ درخواست مستقل — نخستین candidate بازبینی

مسئله: قرارداد داخلی PR358 فاقد API، writer و ذخیره بود. مخاطب این بسته عضو/مشاور آزمایشی و بازبین فنی است. START-B مالک فایل‌های جدید runtime/consumer/test، START-A مالک قرارداد و منطق مالی و root مالک integration/عملیات/پذیرش است. وضعیت پروژه فقط در COMMAND-CENTER می‌ماند.

## مبنا و مرز مالکیت

followup از `a6ce468301eb2761bb730b38f68b487c52fdb234` (PR360 پذیرفته‌شده در حد source/CI) ساخته شده است. سه فایل `tickets.ts`، `ticketIntent.ts` و `tickets.test.ts` عین Git blobهای `3bd1a87932ef8e066a94db1dcc0a525ea1d1db92` وارد شده‌اند؛ manifest در `scripts/testing/consultation-tickets/contract-source.json` است. قرارداد، `writeEnabled=false` و `authority=not_connected` را تغییر نداده است.

Workspace/Panel مشترک، رضایت، روستر، موتور مالی، چهار نمودار و lock تغییر نکرده‌اند. guard منابعِ محافظت‌شده و سه blob frozen را بررسی می‌کند. package و workflow پیش از تخصیص delta مشخص توسط root ویرایش نمی‌شوند.

## کد قابل بررسی در این commit

- `sql/consultation_ticket_requests.sql`: candidate بازبینی؛ schema خصوصی، requests/events/receipts با history افزایشی و منع mutation؛ CAS و token receipt؛ کنترل actor/consent/right در تراکنش؛ همان ترتیب قفل actor/relation موجود برای رقابت با revoke. چهار RPC عمومی محدود، بدون دسترسی مستقیم نقش برنامه به جدول/توابع خصوصی. تعویض یا overwrite schema موجود متوقف می‌شود.
- `ticketStorageServer.ts` و API leaf `/api/consultation/tickets`: SSR همان session-bound client؛ تطبیق actor؛ same-origin و محدودیت stream؛ خواندن inbox/history/lookup و ثبت TicketRequest. read نامعتبر، خالی/لغوشده فرض نمی‌شود. tokenِ مربوط به رابطه/درخواست دیگر private receipt را برنمی‌گرداند.
- `ticketStorageContracts.ts`: envelope واقعی خواندن در کنار سه قرارداد frozen؛ GET فقط شناسه‌های همبستگی دارد، نه متن/subject/intents خصوصی. metadata قابلیت، مجوز کلاینت نیست.
- `ticketStorageRequest.ts`: intent همان بایت‌های قرارداد داخلی باقی می‌ماند. timeout نتیجهٔ نامعلوم می‌دهد؛ ارسال با unresolvedPrior هیچ POST ندارد. تعیین تکلیف GET-only با همان token/requestId و receipt انجام می‌شود. retry صریح فقط پس از confirmed_absent، CAS ثابت و همان run آزمایشی، با بایت‌های قبلی آماده می‌شود. تغییر actor/relation یا revoked/disabled advisor پیش از بازگرداندن private fallback خطا می‌دهد.

`open` یک درخواست مستقل است؛ `grant` رضایت و رابطه را جایگزین نمی‌کند. پاسخ/پیگیری ticket در رویدادهای همان درخواست ذخیره می‌شود؛ `link_recommendation` فقط sessionId/version/contentHash دقیقِ نسخه‌ای که واقعاً منتشر شده است را می‌پذیرد. مانده/معامله/رضایت از ticket تغییر نمی‌کند.

## حق خدمت و fixture

تأمین‌کنندهٔ محصول `consultation_ticket_private.permission` بدون شرط `not_connected` برمی‌گرداند. هیچ profile/admin/full، entitlements قدیمی، callback خرید، JWT metadata، GUC، env عمومی، expectedActorId یا writeEnabled کلاینت، حق همان خدمت ایجاد نمی‌کند. توابع عمومی همچنان auth.uid و رابطهٔ معتبر را در DB بررسی می‌کنند؛ PUBLIC/anon/service_role دسترسی اجرای این RPCها ندارند.

برای تمرین مجاز فقط در DB ایزولهٔ owned، فایل جداگانهٔ `scripts/testing/consultation-tickets/owned-fixture.sql` حاضر است. این فایل جزو SQL candidate نیست و از ماژول محصول import نمی‌شود. fixture به run جدید ثبت‌شده و چهار actor Auth نیاز دارد؛ فقط رانندهٔ عملیاتِ مالک DB می‌تواند پس از readback رضایت، جفت‌های واقعی actor/relationship را در allowlist خصوصی ثبت کند. برنامه DML آن allowlist را ندارد. اعتبار حق از همین ثبت خصوصی DB است، نه ادعای کلاینت/JWT. برچسب `owned_fixture` صرفاً آزمایشی است و serviceRightState واقعی همچنان not_connected می‌ماند.

هیچ سهمیه/مدت/قیمت/SLA تجاری تعریف نشده است. ۵۰۰ حد serialization تاریخچه است؛ writer پس از آن append تازه را رد می‌کند و reader هرگز suffix/تاریخچهٔ کوتاه‌شده را به‌جای تاریخچهٔ کامل برنمی‌گرداند.

## شاهد و گیت باز

آزمون‌های واحد مرز قرارداد/HTTP/transport و source-boundary اجرا شده‌اند. connectorهای ساختگی در تست واحد، شاهد DB/Auth یا حق واقعی نیستند. SQL candidate و fixture هنوز روی هیچ DB اجرا نشده‌اند؛ اثبات واقعی SQL/GoTrue/PostgREST/Next، بازخوانی پس از نشست تازه و UI روی این نسخه گیت باز است. consumerهای leaf و رانندهٔ native مراحل بعد همین بسته‌اند؛ این نخستین commit، جریان کامل قابل استفاده نامیده نمی‌شود.

Supabase CLI موجود نبود؛ نام timestamp migration اختراع نشده و CLI/سرویس تازه نصب نشده است. پیش از migration رسمی، root باید SQL/ACL/fixture، delta آزمون CI و profile مقصد را بازبینی کند. هیچ apply/provision/activation یا استفاده از proof حاوی کپی DB/هدف قبلی مجاز فرض نمی‌شود.

ساخت/CI موفق PR360 تکرار نشده و به این followup نسبت داده نمی‌شود. اولین typecheck عمومی به validatorهای `.next` باقی‌مانده از شاخهٔ قبلی و یک خطای نوع در کد جدید برخورد کرد؛ خطای نوع اصلاح شد و بررسی منبع tracked با حذف ورودی validatorهای کهنه جدا انجام می‌شود. cache تاریخی پاک/بازنویسی نشده است. typecheck/build تازهٔ CI هنوز لازم است.

معیار پایان این بسته: کد واقعی و default-closed محصول؛ ذخیره و تاریخچه/receipt واقعی در fixture owned؛ Auth واقعی و استقلال عضو دیگر؛ رقابت/revoke/disabled advisor؛ unknown outcome بدون replay؛ حفظ draft و prefix؛ logout/login و readback همان نسخه. root پذیرش source/CI، نصب آزمایشی، انتشار و پذیرش آرش را جدا ثبت می‌کند. مبلغ زیرساخت/داده/مدل نامعلوم null می‌ماند؛ این commit سرویس، مدل، دادهٔ تازه یا خریدی اجرا نکرده است.

مرجع فنی: [توابع پایگاه‌داده Supabase](https://supabase.com/docs/guides/database/functions)، [RLS و تفکیک grant از policy](https://supabase.com/docs/guides/database/postgres/row-level-security). wrapperهای definer محدود به دسترسی لازم به جدول خصوصی‌اند، search_path خالی و auth.uid/ACL صریح دارند؛ این انتخاب دورزدن permission error یا grant عمومی نیست.
