# ارزیابی فقط‌خواندنی لیارا و Hermes — بازخوانی ۳۱ اکتبر ۲۰۲۶

این بخش از سابقهٔ۲۹اکتبر پایین تازه‌تر است؛ مرجع وضعیت همان [COMMAND-CENTER](../../../COMMAND-CENTER.md#development-v04-program-20261030) است. نصب، انتقال کد/اعتبارنامه/پشتیبان، ارتقا، ری‌استارت، تغییر سرویس، login یا فراخوانی مدل انجام نشد.

## بازخوانی ۳۱ اکتبر ۲۰۲۶

**نتیجه:** SSH اکنون با کلید موجود و strictknownhost فرمان فقط‌خواندنی را کامل کرد؛ علت timeout پیش ازاحرازِ۲۹اکتبر همچنان نامعلوم است و تنظیم شبکه/sshd عوض نشد. ازنظر منابع، اجرای محدود یک worker متنی قابل بررسی است؛ بستهٔ Linux، حجم واقعی نصب، دسترسی مدل و انتقال مالکیت اجرا هنوز تأیید نشده‌اند. نتیجهٔ حاضر مجوز نصب نیست.

[رسید واقعی سرور](P15-Hermes-native-root-20261031.json) از۰۶:۱۷:۵۲ تا۰۶:۱۷:۵۷تهران است. شناسه/تصویر source همان مقصد بررسی‌شده و DB سالم است؛ proof قدیمی متوقف است. health باقیماندهٔ unhealthy روی container متوقف را خرابی copy یا اجرای آن نمی‌نامیم.

| اندازه‌گیری | مقدار | حدود تفسیر |
|---|---|---|
| پردازنده |۴logicalCPU؛ busy۱۶٫۰۵۱٪ در۲٫۰۰۱ثانیه | نمونه کوتاه از کل۴CPU؛ ظرفیت پایدار/اوج یا benchmarkHermes نیست |
| loadaverage |۲٫۴۸ /۲٫۲۹ /۲٫۰۶| بارهای۱/۵/۱۵دقیقه، نه درصدCPU |
| RAM قابل‌استفاده |۵٫۳۳۵GiB از۷٫۷۰۸GiB | مقدارMemAvailable، نه RAM رزروشده برای عامل |
| دیسک `/` قابل‌استفاده |۱۳٫۰۸۹GiB | f_bavail؛۳٫۰۸۹GiB بالاتر ازguard۱۰GiB پشتیبان |
| Python سیستم سرور |۳٫۱۲٫۳| وجودPython، سازگاریruntimeHermes را ثابت نمی‌کند |

GiB=۲³⁰بایت. Dockerstats در پنجرهٔ جدا خوانده شد؛ CPUخام آن۱۰۰٪ را برای یکcore می‌شمارد. DBاصلی۲۵۸٫۶MiB/CPU۰٫۰۵٪، FX۲۷۵٫۶MiB/۰٫۸۶٪، storageمرحله۱۴۳٫۱MiB/۳۸٫۴۰٪ و داشبورد مالی۴۲٫۳۸MiB/۰٫۰۶٪ بودند. این نمونه‌ها هم‌زمانِدقیق با/proc/stat نیستند و BlockIO/NetIO انباشته را throughput لحظه‌ای نمی‌نامیم. فهرست کامل همان رسید است؛ هیچ container متوقف/حذف/ری‌استارت نشد. درPATH وچهارمسیرنام‌برده Hermes مشاهده نشد؛ نصب درهمهٔ مسیرها/حساب‌های سرور جست‌وجو نشده است.

## نسخه و اجرای موجود واقعاً کجاست؟

[رسید source/launcher](P15-Hermes-local-source-root-20261031.json) فایل اجرایی واقعی ویندوز، Gitf42f579 وstamp نسخه`0.21.5+4905.gf42f579` را نشان می‌دهد؛ pyproject0.0.0 شماره انتشار نیست. shebang خودlauncher بهPython۳٫۱۴٫۷ پین‌شده اشاره دارد؛ پنج ماژول خوانده‌شده دقیقاً باGit آننسخه برابر بودند. هیچauthstore/token/configمحرمانه خوانده نشد و Hermes اجرا نشد.

[زمان‌بند موجود](P15-Hermes-local-scheduler-root-20261031.json) واقعاً روی ویندوز وcheckout`research-r2-r5-20261027`/Git7cfe261 است؛ Ready/LastTaskResult1 و آخرینguard`worker_lock_requires_review` موفقیت نیست. `modelCalled` درآخرینlog خوانده‌شده غایب وnull است، نهfalseساختگی. قفل/ledger/زمان‌بند دست‌نخورده‌اند. policyموجود همانopenai-codex،gpt-6.1-sol/high،toolsetsnone/safemode،۱turn،۱۸۰ثانیهrun/۲۱۰ثانیهtimeout و۲۴تلاشrollingday است؛ شمار تلاش برنامه، تضمین شمار درخواست یا سقف هزینهٔمدل نیست.

خواندن تازهٔ **همان worker درmodeفقطreconcile** باbridge/find در۰۶:۴۴:۱۰–۳۲تهران پاسخ معتبر داد: [۱۳pending/۱۳absent/۰unknown](P08-Hermes-reconcile-current-root-20261031.json). state/worker.lock/last-run قبل و بعد byte-hash برابرند؛ نهmodel،append،تغییرledger یاretry اجرا شد وID/digestهای شخصی دررسید منتشر نشدند. absent فقط نبودنتیجهٔذخیره‌شده برایهمانdigestهای جست‌وجوشده دراینلحظه است؛ نه نبودمدل/هزینه درگذشته، نه نبودرکوردمرتبط باکلیدهویت دیگر، و نه مجوزاجرای مجدد. recoveryRequired همچنانtrue است و قفل خودکار برداشته نشد.

## اتصال اشتراکی؛ پشتیبانی مستند با اتصال واقعی فرق دارد

[مستندات Hermes](https://hermes-agent.nousresearch.com/docs/integrations/providers) مسیرopenai-codex باOAuth را دارد؛ همان صفحه جزئیات مصرف quota/پلن آن را کامل مستند نمی‌داند. این منبع، حق حساب یا دسترسی مدل تنظیم‌شدهٔ این پروژه را ثابت نمی‌کند.

[راهنمای رسمی OpenAI برای ابزار متن‌باز](https://developers.openai.com/siwc/token-sharing-open-source) استفادهٔمجاز ازChatGPTplan را باOAuthclient/hostID/scopes جدا توضیح می‌دهد؛ identity به‌تنهایی مجوز inference نیست. [مسیرVM](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) حفظهویت مستقلhost و حفاظت/انتقال ثبت‌نام همان ابزار را لازم می‌داند. انتقال دراینمأموریت انجام نشده است. [حدود فعلی](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) قراردادResponsesباstorefalse/streamtrue و محدودیت قابلیت‌ها دارد؛ دسترسی مدل بافهرست مدل‌ها یا tokencache قدیمی اثبات نمی‌شود.

درپنجماژول نسخهٔنصب‌شده، markerمسیرbackendCodex دیده شد؛ markerهایdirectscope/hostID جدید درهمین پنجفایل نبودند. این بررسی محدود نه اثبات نبودکلپیاده‌سازی درکلHermes است، نه حکم ناسازگاری تمامprovider. تطبیق دقیق ایننسخه با مسیرمجاز، حساب/مدل/منطقهٔخدمت و سهمیه رویVM **UNOBSERVED** است. حساب موجود، نشستCLIدیگر یا APIkey را خودکار قرض/منتقل نمی‌کنیم؛ paidfallback مجاز نیست و مصرف/هزینهٔواقعیِتأییدنشده null می‌ماند.

## پیشنهاد محدود؛ اجرا نشده

راهنمای [DockerHermes](https://hermes-agent.nousresearch.com/docs/user-guide/docker) حداقل۱GBRAM/۱core/۵۰۰MBdata و نیازبیشتر برایمرورگر را می‌آورد؛ imageکاملPython۳٫۱۴ وChromium دارد، پس toolsetsnone به‌معنی کوچک‌بودن imageنیست. [FAQرسمی](https://hermes-agent.nousresearch.com/docs/reference/faq) نیز rangeدرpyproject را اثبات سازگاریPython۳٫۱۲ نمی‌داند. پیشنهاد، حفظنسخهٔدقیق موجود وruntimeLinux سازگار است؛ latest/ارتقا یا تغییرPython سرویس‌های فعلی انتخاب نشده است.

شروع پیشنهادی فقط **یک مأموریت هم‌زمان**،۱CPU،MemoryHigh۱GiB/MemoryMax۱۵۳۶MiB،PIDs۱۲۸،همان۱turn وtimeout۲۱۰ثانیه، بدونمرورگر/مدل‌محلی/افزونه یا نصب خودکار اضافه است. این سقف‌ها پیشنهادند، نه اندازه‌گیریمصرف واقعیHermes. دسترسیroot/Dockersocket/کلیدمدیریتی عمومی یاپورت تازه لازم پیشنهاد نمی‌شود؛ bridge محدود موجود باید جدا تطبیق شود.

کل footprintاضافی بستهLinux/runtime/rollback/state/cache/log باید پیشاپیش اندازه‌گیری و در۲GiB جا شود؛ درآنصورت حدود۱۱٫۰۹GiB برایguard۱۰GiB باقی می‌ماند. اگرجا نشد **NO_GOهمانمرحله**، بدونحذفbackup،prune،توقف سرویس یا ارتقا. RAMقابل‌استفاده دست‌کم۲GiB برای سرویس‌های فعلی حفظ وپایداری زیرمشاهده سنجیده شود؛ نمونهٔ دوثانیه‌ای تأیید آن نیست.

تا تعیینمالک یگانهٔledger/شناسه‌ها/قفل ونتایجنامعلوم، Linuxworker بازمان‌بند ویندوز هم‌زمان فعال نمی‌شود. مدل وحقusage/عدمpaidfallback باید درآزمون جداگانهٔمجاز ثابت شوند؛ اکنون مدلی فراخوانی نشده است. بستهLinux باحجم/پین معلوم، بازیابیstate، auth/bridge وcutover/rollback هنوز بازند؛ این گزارش فقط ارزیابی وپیشنهاد است، نه دستور اجرا.

---

## سابقهٔ ۲۹ اکتبر؛ اعداد و محدودیت‌های زیر تاریخی‌اند

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
