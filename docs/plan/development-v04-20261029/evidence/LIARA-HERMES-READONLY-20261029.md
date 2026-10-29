# ارزیابی فقط‌خواندنی لیارا و Hermes — ۲۹ اکتبر ۲۰۲۶

مالک بررسی: هماهنگ‌کننده موجود `01a187f6…/local`. این پیوست شاهد است؛ وضعیت پروژه در [COMMAND-CENTER](../../../COMMAND-CENTER.md#development-v04-20261029) باقی می‌ماند. پایان این بررسی تا `2026-10-29T15:34:26Z`؛ آخرین تلاش SSH همین نوبت نیز پیش از banner timeout شد.

## نتیجه قابل اتکا

| موضوع | مشاهده | حد نتیجه |
|---|---|---|
| ماشین موجود | پنل احرازشده لیارا، `arsadata-backend`، Ubuntu24.04، روشن، ۴ هسته، RAM اسمی۸GB، دیسک اسمی۸۰GB | مشاهده صفحه اطلاعات کلی؛ مصرف، فضای آزاد یا سلامت guest نیست |
| SSH مستقیم | `BatchMode=yes / StrictHostKeyChecking=yes / ConnectTimeout=8`، کلید مدیریتی موجود؛ TCP22 timeout پیش از banner | احراز هویت آغاز نشد؛ رد کلید/مجوز، خرابی sshd یا firewall اثبات نشده |
| مسیر proxy موجود | CONNECT22 پاسخ۲۰۰ داد، انتظار banner بعدی timeout شد | پذیرش CONNECT اثبات رسیدن به sshd نیست؛ مسیر جایگزین نیز SSH قابل استفاده نداد |
| API مدیریت | مستقیم timeout؛ از proxy موجود با اعتبارنامه محلی HTTP401 | علت اعتبارنامه/مسیریابی تفکیک نشده؛ هیچ token refresh یا تغییر شبکه انجام نشد |
| دورنما | دکمه در پنل موجود دیده شد؛ ابزار کنترل پنجره هندسه قابل استفاده نداشت و capture timeout شد | بازشدن کنسول و اجرای فرمان داخل ماشین تأیید نشده |
| CPU/RAM/disk واقعی | فرمان‌های `uptime/free/df/docker stats` به علت timeout اجرا نشدند | اعداد مصرف/فضای آزاد فعلی **نامعلوم**؛ عدد تاریخی۶٫۸۸GB به امروز منتقل نمی‌شود |

صرف روشن‌بودن ماشین علت قطع SSH را روشن نمی‌کند. هیچ `Permission denied` در تلاش‌های این نوبت دریافت نشد. پروکسی، VPN، firewall، sshd و تنظیمات لیارا تغییر نکردند. این شکست دسترسی فقط عملیات وابسته به guest را نگه می‌دارد.

## Hermes موجود و اتصال مدل

- فایل اجرایی و source موجود در `%LOCALAPPDATA%/hermes` خوانده شد؛ source revision=`f42f579cf8bac4918ac9599bece71618afadd846`. نسخه pyproject=`0.0.0` شناسه انتشار قابل اتکا نیست؛ commit مبنای فنی است.
- مسیر پژوهش موجود از `openai-codex` و `gpt-6.1-sol` استفاده می‌کند؛ policy همان `hourly-deep-v1`، یک turn، run budget۱۸۰ثانیه، timeout۲۱۰ثانیه، حداکثر۲۴تلاش در rolling day. `--toolsets none / --safe-mode` و ورودی فایل محدود دارد. این مشاهده کد است، نه اجرای مدل.
- فقط metadata اعتبارنامه خوانده شد: یک ورودی OAuth برای `openai-codex`، وجود access/refresh token، آخرین refresh ثبت‌شده `2026-10-21T08:17:49.72545Z` و وضعیت cached=`ok`. توکن، شناسه حساب و متن تنظیمات محرمانه چاپ/منتقل نشد. این cache هشت‌روزه، حق خدمت و اعتبار اتصال امروز یا روی Linux را اثبات نمی‌کند.
- Hermes در [مستندات رسمی provider](https://hermes-agent.nousresearch.com/docs/integrations/providers) مسیر OpenAI Codex با OAuth را دارد. [راهنمای رسمی احراز هویت Codex](https://learn.chatgpt.com/docs/auth) مسیر اشتراک ChatGPT و API مبتنی بر مصرف را تفکیک می‌کند. پشتیبانی این provider در Hermes به معنی تضمین quota، پشتیبانی رسمی OpenAI از هر کلاینت ثالث یا اتصال موفق همین حساب روی سرور نیست.
- [نصب رسمی Hermes](https://hermes-agent.nousresearch.com/docs/getting-started/installation) Linux را پوشش می‌دهد؛ نصب پیش‌فرض می‌تواند browser/CUA و وابستگی‌های اضافی بیاورد. انتخاب پیشنهادی برای این worker فقط CLI و inference دوردست است؛ مدل محلی/GPU و مرورگر لازم نیست. هیچ installer یا login/model command اجرا نشد.
- task محلی `Portfolio-Research-Hermes` به checkout موجود `research-r2-r5-20261027` اشاره دارد؛ LastTaskResult=1، شاهد موفقیت نیست. قفل، ledger، scheduler و intent دست‌نخورده ماندند؛ نبود PID مجوز retry یا اثبات نبود مصرف قبلی نیست.

## پیشنهاد استقرار؛ اجرا نشده

پیشنهاد مهندسی، مشروط به اندازه‌گیری واقعی و حفظ سرویس‌های فعلی: تنها **یک مأموریت هم‌زمان**، بدون صف پنهان یا اجرای موازی لپ‌تاپ/سرور. همان ledger و digest و بازیابی GET باید مالک یگانه اجرا را مشخص کنند؛ انتقال یا راه‌اندازی دو scheduler مجاز نیست.

سقف آغاز پیشنهادی برای worker بدون مرورگر: `CPUQuota=50%` از یک هسته، `MemoryHigh=512MiB`، `MemoryMax=768MiB`، `TasksMax=64` و timeout همان۲۱۰ثانیه موجود؛ low CPU/IO priority، بدون دسترسی root یا Docker socket. این اعداد اندازه‌گیری مصرف Hermes نیستند و تا rehearsal واقعی فقط پیشنهادند؛ محدودشدن منابع نباید retry مدل خودکار بسازد.

شرط ورود: مصرف سرویس‌ها و OOM/PSI در چند نمونه، MemAvailable دست‌کم۲GiB، inode و فضای آزاد اندازه‌گیری شود؛ guard موجودِ حداقل۱۰GiB برای backup/restore پس از بودجه نصب/rollback محفوظ بماند. بودجه جداگانه بسته/venv/log/state و رشد آن باید با حجم واقعی تعیین شود؛ دیسک اسمی۸۰GB کفایت را ثابت نمی‌کند. کمبود ظرفیت با prune، حذف backup، توقف سرویس یا ارتقا در این بررسی جبران نمی‌شود.

پیشنهاد فعلی **عدم نصب تا شاهد ظرفیت و اتصال پشتیبانی‌شده روی مقصد** است. root مسئول بازیابی خواندن guest از دسترسی موجود، نمونه‌برداری CPU/RAM/disk و service stats است. START-B فقط تطبیق قرارداد worker/intent را مستقل ادامه می‌دهد. نصب، انتقال credential/state، ری‌استارت، ارتقا، هزینه تازه و فراخوانی مدل انجام نشده‌اند.

## کنترل بازتولید و انتشار شواهد

فرمان read-only برنامه‌ریزی‌شده فقط زمان UTC، uptime، `/proc/stat`، `/proc/meminfo`، `df`/inode، `systemctl is-active ssh/sshd`، socket22 و metadata allowlist از Docker را برمی‌گرداند؛ نه env، command line برنامه‌ها، لاگ خصوصی یا credential. اجرای آن در guest هنوز موفق نشده است. ثبت حاضر گزارش نتیجه و محدودیت آزمون است، نه رسید ساختگی مصرف منابع.
