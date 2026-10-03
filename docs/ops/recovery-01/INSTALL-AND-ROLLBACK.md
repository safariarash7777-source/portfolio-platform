# RECOVERY-01 — دستور نصب منتخب و بازگشت سازگار

مالک اجرا P00 است. مقصد وب همان portfolio-platform-fawn.vercel.app و مقصد دیتابیس portfolio-stage-db-1 متصل به backend اصلی است؛ نام stage/preview آن را sandbox نمی‌کند. این دستور هنوز اجرا نشده است. حساب‌ها و داده‌های دموی8443/8444/8445 به این مقصد منتقل نمی‌شوند.

## گیت‌های پیش از اثر واقعی

- SHA نهایی شاخه تحویل، CI همان SHA، hash کد/schema/config و baseline ظاهر390/1440 ثبت شوند. CI شاخه‌های سازنده به نسخه ترکیبی نسبت داده نشود.
- بکاپ تازه همین مقصد، checksum خصوصی و بازیابی PG17 بدون port/App/Auth/cron فعال، با شمارش/ساختار/مجوز و حفظ هویت/سابقه تأیید شود. بکاپ Supabase سپتامبر جای این شاهد نیست.
- پیش‌شرط‌های فعلی auth.users/auth.uid، profiles(id,role)، نقش‌ها، deny_mutation و RLS جدول‌های legacy دوباره با کاتالوگ تطبیق شوند. DDL منتخب روی بازیابی ایزوله PG17 آزمایش شود؛ هیچ رکورد خصوصی در خروجی نرود.
- snapshot/ref استقرار فعلی و تنظیمات لازم خارج Git به‌صورت خصوصی محفوظ باشند. نویسنده آماده‌سازی خصوصی تا نصب و پذیرش flag خاموش بماند.

## زنجیره منتخب

1. اصلاح مستقل `supabase/migrations/20261003100542_recovery_legacy_holdings_owner_only.sql`: هر دو policy holdings فقط مالک؛ TRUNCATE نقش‌های client ممنوع. portfolio_versions هدف تخصیص مدیر تغییر نمی‌کند؛ هیچ ردیف مالی تغییر نمی‌کند.
2. `sql/phase32_member_holdings.sql`، سپس `supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql`، سپس `supabase/migrations/20261003094327_member_investment_scope_reviews.sql`. بخش مشاور phase38 و phase35/36/37 نصب نمی‌شوند. بند اختیاری reference در phase32 طبق قرارداد اصلی guarded است؛ از provenance خالی، تأیید پژوهش یا تخصیص قطعی استنتاج نمی‌شود.
3. `sql/phase34_research_workbook_versions.sql` همان blob اصلی برای نسخه‌ها و بازبینی پژوهش؛ approval انسانی و مختص نسخه است. پژوهش بازگردانده‌شده پس از approval، نسخه تازه و تصمیم انسانی تازه می‌خواهد. publication/cohort schema در بسته نیست.
4. reload schema-cache PostgREST با `NOTIFY pgrst, 'reload schema'` و شاهد کاتالوگ/grants/RLS/RPC مقصد؛ دیدن DDL موفق جای آزمون HTTP نیست.
5. انتشار برنامه از SHA نهایی با ظاهر فعلی و backend/cookie context اصلی؛ flag خصوصی فقط پس گیت مقصد و راه بازگشت فعال شود. rollout محدود و ورود امن مالک/اعضای مجاز، بدون پیام انبوه یا ورود داده ساختگی به صفحه واقعی.

هر فایل مستقل transaction دارد؛ نتیجه هر گام ثبت شود و شکست به معنای نصب بقیه نیست. تاریخچه قدیمی و تازه حذف/تبدیل نشود. SQLهای sql/test و پایگاه‌های آزمون صرفاً CI هستند و روی مقصد اصلی نصب نمی‌شوند.

## ترتیب بازگشت

پیش از تعویض binary، نوشتن سازگار را متوقف کنید: `docs/ops/recovery-01/P04-ROLLBACK-FREEZE.sql` برای RPCهای مالی و `sql/P07-ROLLBACK-FREEZE.sql` برای INSERT نسخه/review پژوهش. schema-cache دوباره reload و رد واقعی نوشتن بررسی شود. flag خصوصی به‌تنهایی writer قدیمی را متوقف نمی‌کند.

سپس deployment/config/assets قبلی را برگردانید؛ همه table/body/history و UUIDها محفوظ بمانند. سیاست owner-only جدول holdings در بازگشت حفظ می‌شود و استثنای admin قدیمی دوباره باز نمی‌شود. phase34 را در حالت freeze دوباره اجرا نکنید، چون INSERT را دوباره grant می‌کند. بازشدن نوشتن فقط بعد نصب writer سازگار، کنترل حفظ body خصوصی و پذیرش مجوز/نسخه انجام شود.

برای FX، receipt و rollback مستقل همان image محدود ثبت شده‌اند؛ تغییر مدل/داده اقتصادی و کل PR212 در این تحویل نصب نشده است. برای رله، نسخه فعال PaaS و replica/بودجه مصرف هنوز نیاز به رسید اپراتور دارند؛ guard سهمیه یا backfill تا آن گیت نصب نمی‌شود.

## شاهد پذیرش پس انتشار

مالک واقعی از همان دامنه وارد پنل شود، refresh/logout/relogin و لینک‌های موجود را ببیند. عضو فقط داده مجاز خودش را ببیند؛ دارایی/بدهی و تأیید دامنه به نسخه مشخص سروری بسته باشند. B و نقش admin بدون مجوز اختصاصی به داده خصوصی A دسترسی نداشته باشند؛ UI/REST/RPC با نشست واقعی جدا آزموده شوند. پژوهش reload/خواندن مستقل، private/no-store، approve→return→نسخه تازه→تأیید انسانی را بگذراند. چهار شاهد بصری390/1440 و چرخه‌های طبیعی داده با منبع/زمان/واحد ثبت شوند. این دستور، CI یا صفحه login200، پذیرش واقعی را اعلام نمی‌کند.
