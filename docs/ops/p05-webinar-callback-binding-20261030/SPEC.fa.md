# P05 — اتصال قطعی callback وبینار به تراکنش ثبت‌شده

> سابقهٔ برش PR351@92؛ **NOT_READY** و مبنای نصب نیست. قرارداد نامزد جایگزین در [P05 binding v1](../p05-webinar-binding-v1-20261030/CONTRACT.fa.md) است. محتوای زیر گزارش تاریخی همان برش محدود است؛ عبور آزمون‌های آن، اثبات هدف معتبر خرید نیست.

پایه دقیق `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc` از main، شاخه مستقل `codex/p05-webinar-callback-binding-20261030`. root پس از تطبیق مسیر واقعی، **app/api/webinars/payment/callback/route.ts** و harness موجود **lib/zarinpal.test.mjs** را برای این برش رزرو کرد. callback عمومی، helper/provider، start-route، package، SQL/Auth/env و فایل‌های مشترک تغییر نمی‌کنند. شاخه از PR91، آزمایشگاه یا P11 منشعب نیست.

## شاهد موجود

۱۳۳ آزمون آفلاینِ فعلی قبل از تغییر موفق‌اند، ولی اتصال ردیف‌ها را نمی‌آزمایند. schema پرداخت `amount` تومان و `pending/paid/failed` دارد؛ callback وبینار مبلغ را از قیمت جاری وبینار می‌خواند، به payment_id ورودی می‌نویسد، وضعیت نامعتبر `verified` می‌نویسد و خطاهای ذخیره را نادیده می‌گیرد. registration.payment_id و user_id با authority تراکنش تطبیق داده نمی‌شوند. مسیر شروع وبینار نیز از callback عمومی استفاده و amount_toman ناسازگار درج می‌کند؛ **شکاف initiation خارج این برش و همچنان باز است**. این اصلاح تحویل فروش end-to-end یا مجوز فعال‌سازی نیست.

## قرارداد اصلاح محدود

۱. Authority/Status/registration_id/payment_id باید غیرمبهم باشند. مرجع مبلغ و کاربر، ردیف payments خوانده‌شده با authority است؛ payment.id باید همان شناسه در callback و registration.payment_id باشد، user_id هر دو یکسان باشد. نبود/خطای خواندن، mismatch یا شکل نامعتبر → unknown؛ پیش از provider/نوشتن متوقف شود. قیمت جاری وبینار جای مبلغ ثبت‌شده را نگیرد.

شناسهٔ خود وبینار پس از خواندن اولیه نیز در readback و شرط تغییر ثبت‌نام ثابت می‌ماند؛ عوض‌شدن webinar_id میان verification و ذخیره، پرداخت را به وبینار دیگری منتقل نمی‌کند.

۲. همان verifyPayment فعلی با قرارداد سه‌حالتی ثابت استفاده شود؛ هیچ API/SDK/واحد/قیمت/مدت تازه نیست. query NOK مدرک شکست نیست. unknown هیچ fail/paid/grant/دعوت/پیامی تولید نکند. `failed` فقط از شکست قطعی و ثبت مستقل تأییدشده بیاید؛ `paid` از پاسخ provider به‌تنهایی نتیجه نشود.

۳. پرداخت فقط از RPCهای موجود verify_payment/fail_payment عبور کند؛ هیچ مستقیم‌نویسی وضعیت `verified` یا payment ساخته نشود. پس از درخواست ذخیره، با هویت ثابت و **خواندن مستقل** همان payment، مبلغ/authority/user/id/status/ref و زمان ثبت موفق تطبیق یابد. خطا/پاسخ گم‌شده مجوز تکرار خودکار writer نیست؛ یک readback می‌تواند ثبت واقعی را تأیید کند، وگرنه unknown بماند.

۴. ثبت‌نام فقط اگر همان user/payment و pending باشد، پس از paid معتبر با شرط مقایسه و تغییر به paid ثبت شود و دوباره مستقل خوانده شود؛ free/refunded یا اتصال تغییرکرده احیا نشود. این برچسب فقط وضعیت پرداخت همین ثبت‌نام است، نه حق مشاوره یا entitlement تازه. audit وبینار فقط پس از تأیید تغییر pending→paid تلاش شود؛ بازپخشِ paid/paid به provider، writer، audit یا پیام تکراری نرود. audit مالی موجود در RPC حفظ است؛ exactly-once بودن side-effect بیرون تراکنش ادعا نمی‌شود.

۵. callback تکراری، payment paid معتبر + registration paid معتبر را از همان مرجع می‌خواند و بدون verify/نوشتن دوباره همان نتیجه را می‌دهد. اگر payment paid ولی ثبت‌نام pending باقی مانده، فقط همان اتصال با readback و تغییر شرطی بررسی شود؛ تراکنش یا حق دیگری ساخته نشود. خطای ذخیره/خواندن یا ref ناسازگار → unknown، نه failed یا success حدسی.

۶. ظرفیت، دیررس/۱۵دقیقه، refund، انتقال حقوق قبلی و مدت/شرایط خدمت از نو تعریف نمی‌شوند. اعتبار کسب‌وکاری/اجازه حضور از تسویه جداست؛ containment و flagهای موجود باز/حذف نمی‌شوند. عرضه/خرید/verify زنده، کلید، پیام، DDL و DB عملیاتی این برش نیستند.

## آزمون و تحویل

- RED→GREEN روی همان TS واقعیِ callback در VM با ورودی‌های canonical کامل و I/O جایگزین‌شده؛ تماس واقعی provider/DB/Telegram/email صفر. fixture فعلی تقویت می‌شود؛ harness جدید محصول/سرویس/کلید ساخته نمی‌شود.
- موارد معنی‌دار: bindingهای authority/id/payment_id/user و query تکراری؛ مبلغ ذخیره‌شده در برابر قیمت تغییرکرده؛ provider unknown/NOK/شکست قطعی؛ error و نتیجه گم‌شدهٔ settlement/readback؛ ref ناسازگار؛ failure ذخیره‌شده در برابر success؛ registration failed-before/after-commit، تغییر اتصال و refunded؛ بازپخش paid/paid و recovery همان partial ثبت؛ هیچ entitlement/دعوت/پیام/charge تازه.
- lint، typecheck، scan، diff و CI روی source دقیق؛ Preview پروژه موجود فقط metadata build بررسی می‌شود. **هیچ endpoint callback با شناسه ساختگی یا verify زنده در Preview/Production فراخوانی نمی‌شود.** آزمون آفلاین شاهد نصب schema یا رفتار درگاه اصلی نیست.
- خروجی PR مستقل با کد/آزمون/شاهد و محدودیت initiation، policy و نصب؛ main/پذیرش آرش ادعا نمی‌شود. برگشت با revert همین برش؛ بدون تغییر schema/پرچم‌ها.
