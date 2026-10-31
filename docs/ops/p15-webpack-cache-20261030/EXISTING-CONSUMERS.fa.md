# مصرف رسید تصحیح در دو ابزار موجود — فقط بررسی

## رزرو صریح نسخهٔ۲ پیش از ویرایش — START-B،۳۱اکتبر۲۰۲۶

root ادامهٔ Capture/Verify تصحیحACL19 را به B تخصیص داد و ویرایش هم‌زمان wrapper را متوقف کرد. مبنا73b96d390e651b3b910bbfe170aa755241e6dde0 و شاخهٔ مستقل codex/ops-checkpoint-v2-20261031 در checkout موجود B است؛ c4/PR366 و doc23f9 تغییر نمی‌کنند. فایل‌های رزروشده: scripts/ops/cashflow-checkpoint/backup-checkpoint.ps1، README.md، helper خالص checkpoint-profile-v2.ps1 و آزمون offline-profile-v2.ps1 در همان پوشه؛ همین برگ ops برای قرارداد/تحویل. اگر تغییر فایل دیگری لازم شود، ابتدا دامنه با root تطبیق می‌شود.

CheckpointCrypto.cs و crypto/AES/HMAC/DPAPI، helper بومی1f1454…، gate9289f…، consumer18dcd…، binding7819e…، install-native.py، SQL/app/حقوق خدمت فریزند. نسخه۲ انتخاب صریح دارد؛ نسخه۱ و آرشیوهای قدیم با همان قرارداد هفت‌فایل و همان entropy/رمزنگاری کار می‌کنند. هیچ failed به passed تبدیل نمی‌شود. allowlist نسخه۲ دقیقاً اصل۷فایل +۵artifact تصحیح +۲supplement بیرون checkpoint +binding خام دقیق +attestation تازه است؛ اسم/طول/هش تمام۱۶قلم در manifest احرازشده و headerهای رمزنگاری مقید می‌شوند. ciphertextها نام ثابت flat دارند؛ مسیرهای source از allowlist می‌آیند.

Native Capture فقط از gate پین‌شدهٔ تازه زیر همان قفل اشتراکی و با هویت ثابت استفاده می‌کند؛ fixture آفلاین sourceMode صریح دارد و هیچ pin بومی را جایگزین نمی‌کند. Verify ابتدا HMAC manifest و هر ciphertext و سپس طول/SHA256 تمام plaintext را با همان crypto به sink حافظه کنترل می‌کند. این کد/آزمون آفلاین فقط نامزد بررسی است: SSH/Capture واقعی، انتقال پشتیبان، restore، DDL/env/deploy، خرید یا credential تازه اجرا نمی‌شود. readiness/release=false و گیت‌های currentSQL،Storage،snapshot،capacity،caller/reader/rollback مستقل‌اند؛ اجرای واقعی پس از review/preflight متعلق به root است.

### نامزد پیاده‌سازی نسخه۲؛ شواهد صرفاً آفلاین

انتخاب صریح `-Profile CorrectedAcl19V2` به همان Capture/Verify افزوده شد؛ default همان LegacyV1 است. helper خالص profile هیچ I/O یا SSH ندارد. format احرازشدهٔ manifest/header نسخه۲ است، ولی frame/AES/HMAC/DPAPI و entropy نسخه۱ بدون تغییرند.۱۶stream با نام منطقی fixed، طول و SHA256 به ciphertextهای flat v2-00.enc تا v2-15.enc مقیدند؛ اصل۷فایل و۵تصحیح و۲supplement وbinding وattestation حفظ می‌شوند. original receipt حتی در fixture باید failed باشد و native آن را با gate frozen و binding frozen کنترل می‌کند.

در مسیر بومیِ نوشته‌شده، metadata زیر یک outer sharedlock همان release، gate تازه و hash کامل dump را می‌گیرد؛ هویت و stopped proof پیش/پس کنترل می‌شوند. هر stream اصلی همان قفل و identity/path guard را دوباره می‌گیرد و طول/hash و ثبات stat و خروج process را کنترل می‌کند. binding وattestation تولیدشده در حافظه می‌مانند تا رمز شوند. پس از انتقال، gate تازهٔ دوم و metadata باید اصل۱۴stream وbinding را یکسان بیابند؛ هر دو verdict در manifest امضاشده می‌مانند. این طراحی **یک قفل SSH پیوسته در تمام مدت رمزگذاری محلی نیست**؛ هر segment guard دارد و finalpass اختلاف را رد می‌کند. بخش بومی هنوز اجرا نشده است.

Verify، HMAC manifest را پیش از parse و HMAC تک‌تک ciphertextها را پیش از decrypt کنترل می‌کند؛ تمامplaintextها با همان C# فقط در حافظه hash می‌شوند. Verify به SSH وصل نمی‌شود و تاریخ gate تاریخی را تازه نمی‌کند. `readiness=false` و`releaseAuthorized=false`، Storage/currentSQL/capacity=`NOT_VERIFIED` و snapshotCoverage محدود به exportedcore با globals/private جدا حفظ می‌شوند. مقدار false در gate frozenِ قدیمی بازنویسی نشده و با موفقیت قالب جدید به مجوز installer تبدیل نمی‌شود.

آزمون نهایی این candidate:۲۶guard/roundtrip نسخه۲ با wrapper واقعی در freshpwsh، شامل۱۶plaintext/CRLF/empty/سهbuffer، failed غیرقابل‌تبدیل، no repin/sourceMode، stalegate، traversal/duplicate/missing، tampermanifest/attestation، HMAC داخلی حتی با outer hash/MAC دوباره‌ساخته‌شده و ردSHAplaintext با fileMAC معتبر؛۱۶regression نسخه۱ نیز روی همین wrapper موفق‌اند. vector بومی فقط تابع خالص را با همان pinهای ثابت می‌سنجد؛ هیچ fixture از ورودی runtime native عبور نکرد. syntax قطعهٔ Python بومی با compile صرف، بدون exec آن، بررسی شد. خروجی آموزشی/کلیدهای تصادفی آزمایش DPAPI/ciphertext همگی فقط درtest-output نادیده‌گرفته‌شده‌اند؛ credential سرویس/کلید واقعی تازه‌ای ساخته نشده است.

در بازبینی بعدی a628، probe آفلاین نشان داد ConvertFrom-Json در pwsh این میزبان، atUTC را به DateTimeKindUtc تبدیل می‌کند؛ TryParse ضمنی روی رشتهٔ محلی، offset را از دست می‌داد و gate تازه را حدود۱۲۶۰۰ثانیه کهنه تشخیص می‌داد. این fail-closed بود و native اجرا نشده بود. helper اکنون DateTime با Kind مشخص و DateTimeOffset را با instant اصلی می‌خواند؛ string فقط با offset صریح/فرهنگInvariant پذیرفته می‌شود و Unspecified حدس زده نمی‌شود. سه regression JSON→DateTimeUTC، offset+03:30 و Unspecified افزوده شد؛ اجرای نهایی جدید **۲۹بررسی نسخه۲ موفق** است. رسید۲۶تایی a628 و شاهد probe محفوظ‌اند؛ wrapper و crypto و regression۱۶تایی نسخه۱ همان hash قبلی‌اند و تغییر نکرده‌اند.

آزمون۱۱تایی مصرف‌کننده frozen در checkout فعلی نخست یک خطای binding_changed داشت: بایت واقعی binding ویندوزی CRLF باSHA256=c4ac2888b055f06f22fbcdf82edc96b27586afd63eebb234c0f4a429fc03d251، دربرابر binding اصلی Git به طول۲۳۹۴ وSHA256=7819e0fb16bbb2c9171099cab07953c3137634d665616af509d4061306af9325. شکست محفوظ است؛ binding فعال تغییر نکرد و normalize نشد. همان۱۱آزمون روی کپی موقتِ دقیق Git73b96، بدون تغییر source یا pin و بدون اجرای gate، موفق شد. این دو شاهد جدا هستند، نه تبدیل شکست به موفقیت. مسیر native جدید هم bindingخام تغییرکرده را پیش از SSH رد می‌کند؛ root پیش از اجرای واقعی باید بایت‌های دقیق staged را مستقلاً بررسی کند.

محدودهٔ این تحویل کد/آزمون/سند قابل بررسی است؛ nativeCapture/Verify، انتقال۲٫۴GB، backup/restore، نصب/caller و پذیرش آرش **NOT_RUN/UNOBSERVED** هستند. root اطلاع داد capture بعدیِ خواندنیAuth/sequence/context در snapshot جدا تکمیل شده؛ B برای این candidate SQL جدیدی اجرا نکرده و آن شاهد را به test fixture یا مجوز نصب تبدیل نمی‌کند. شاخه کد و Draft فقط همین پنج فایل رزروشده را می‌برند؛ app/SQL/installer و C#/gate/consumer/binding frozen می‌مانند. مالک اجرای واقعی و تصمیم پذیرش root است؛ برنامه/دفتر وضعیت تازه ایجاد نشده است.

در۳۱اکتبر، مسیر بررسی صریح به همان ابزارهای پشتیبان و نصب مشاوره افزوده شد. هر دو روی Linux موجود اجرا شدند و [رسید مستقل اجرا](../../plan/development-v04-20261029/evidence/P15-existing-consumers-root-20261031.json) دارند: ابزار پشتیبان ساعت۰۴:۲۱:۵۵تهران و نصب‌کننده ساعت۰۴:۲۲:۴۴تهران. این تغییر کد و اجرای caller است؛ نصب یا قالب تازه پشتیبان نیست.

## مسیر استفاده و نسخه

- [backup-checkpoint.ps1](../../../scripts/ops/cashflow-checkpoint/backup-checkpoint.ps1)، کنش `ReviewCorrectedCheckpoint`، checkpoint ثابت `20261030T215307Z` و همان helper بررسی‌شده. این کنش Destination، Fixture و OfflineFixture نمی‌پذیرد و هیچ پوشه/کلید/فایل پشتیبان نمی‌سازد.
- [install-native.py](../../../scripts/testing/consultation/install-native.py)، گزینه `--review-corrected-checkpoint`، فقط بسته بررسی‌شده را از stdin می‌خواند؛ پیش از مسیرهای قدیمی SQL/container برمی‌گردد. این گزینه با `--source` یا `--target-copy` ترکیب نمی‌شود.
- [مصرف‌کننده مشترک نسخه۱](../../../scripts/ops/cashflow-checkpoint/corrected-checkpoint-consumer.py) برای هر دو نام caller مجاز است. کد آن با SHA ثابت، کد gate با SHA ثابت و binding تاریخی با SHA ثابت پین‌اند. packet شامل سه مقدار base64 به نام consumer، gate و binding است؛ ورودی نصب‌کننده حداکثر۱۲۸KiB است. ابزار پشتیبان همین بسته را از فایل‌های بررسی‌شده موجود می‌سازد؛ هیچ credential داخل packet نیست.

```powershell
pwsh -NoProfile -File scripts/ops/cashflow-checkpoint/backup-checkpoint.ps1 -Action ReviewCorrectedCheckpoint -CheckpointId 20261030T215307Z -ReviewedHelperSha256 1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2
```

کدها از طریق SSH در حافظه اجرا شدند؛ فایل منبع روی سرور نصب نشد. gate همان قفل اشتراکی، هویت مبدأ/کپی، کپی متوقف و بدون شبکه، اصل failed، تصحیح مستقل۱۹ACL و کل dump را تازه می‌خواند. هیچ نتیجه cached به‌جای بررسی زنده وارد نمی‌شود. زمان خروجی PowerShell ممکن است با منطقه محلی نمایش داده شود؛ hash اصل فایل‌های receipt مربوط به بایت‌های همان فایل‌هاست.

## نتیجه آزمون

۱۱ آزمون مرزی موفق‌اند: تغییر کد/binding، ورودی نامعتبر، نام caller خارج فهرست، بازبرچسب‌زدن failed، تغییر هویت/آرشیو/شبکه، ورود مجوز نوشتن و خروج زودهنگام مسیر بررسی از نصب‌کننده. این آزمون‌ها SSH/SQL/Docker ندارند. علاوه بر آن، هر دو caller واقعاً gate را روی Linux اجرا کردند و اصل failed و تصحیح مستقل را با هم مصرف کردند؛ dump کامل۲٬۴۰۶٬۵۴۶٬۲۹۵بایت در هر اجرای جدید خوانده شد. تکرار خواندن برای دو caller تازه است، نه بازاجرای backup/restore.

هر۱۶ آزمون قدیمی Capture/Verify پس از این تغییر موفق‌اند؛ C# رمزگذاری، AES/HMAC/DPAPI، قالب هفت‌فایلی و شرط اصلی passed تغییر نکرده‌اند. نسخه و hash دقیق بایت‌های اجراشده در رسید است. داده/کلید/فایل رمزگذاری‌شده آموزشی آزمون داخل Git وارد نشد.

## محدودیت باقی‌مانده و اقدام بعدی

`readOnlyConsumerIntegrated=true` فقط همین دو مسیر بررسی است. `captureVerifyProfileIntegrated=false` و `legacyApplyPathIntegrated=false` صریح می‌مانند. اصل failed به passed تبدیل نمی‌شود؛ مسیر قدیمی Capture/Verify هنوز نمی‌تواند بسته تصحیح‌شده را آرشیو و تصدیق کند و مسیر اعمال قدیمی همچنان checkpoint۲۳اکتبر دارد. این گزینه جدید، راهی برای اعمال SQL جدید با آن نصب‌کننده قدیمی نیست.

برای نصب، profile نسخه‌دار رمزگذاریِ همه رسیدهای وابسته، بازیابی مستقل، وضعیت schema/ظرفیت تازه، build متصل به مقصد، خواننده سازگار قبل از نویسنده، برگشت نسخه، Storage binary در صورت وابستگی و حق واقعی خدمت هنوز گیت جدا هستند. مسئول اتصال عملیاتی و مقصد root است؛ هیچ SQL، شروع/توقف container، انتقال پشتیبان، نصب، Hermes یا هزینه تازه از این دو اجرا انجام نشد.
