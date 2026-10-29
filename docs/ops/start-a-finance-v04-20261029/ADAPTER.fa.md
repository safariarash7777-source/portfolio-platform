# adapter و گیت نوشتن — فقط candidate و rehearsal

اجازه جاری، توسعه/آزمون ایزوله است. **نصب اصلی، فعال‌سازی گیت، GRANT، حساب یا تغییر محیط عملیاتی در این تحویل انجام نمی‌شود.** حق تجاری خدمت همچنان تصمیم مستقل D024 است.

## ترتیب اجباری و بسته اتمیک

۱. ابتدا reader/API تازه مستقر و با SQL قدیمی آزموده شود: نبود capability برابر خاموش؛ تاریخچه خوانا. reader قدیمی strictkeys است و capability تازه را نمی‌پذیرد؛ بنابراین استقرار reader سازگار باید **قبل از DDL** باشد، حتی وقتی writer خاموش است.

۲. پس از گیت‌های مقصد/پشتیبان/restore/۱۰GiB و اختیار صریح عملیات، adapter فقط payload **اتمیک** زیر را بسازد: r2 immutable + companion گیت. بین توسعه enum و نصب default-off هیچ commit جدا وجود ندارد. installer PR314 مستقل و پیش‌نیاز است؛ baseline یا roster/replies در adapter جدید دوباره اجرا نمی‌شوند.

| فایل | SHA256 |
|---|---|
| `20261029142010_consultation_feedback_states.sql` | `32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda` |
| `20261029160723_consultation_feedback_rollout_guard.sql` | `5b3538d2a4526c91ac0af092b86a81b3e7bb140dab88ad20aef30abff2ff03e2` |
| `rollback-rollout.sql` | `bb8964f7d07df1575c8a70bf762987e4830600ccacfe72eac63e4af79e9377ba` |
| `rollback-candidate.sql` | `aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa` |

payload apply فعلی SHA256=`c53de46a216a57b90afaff760c0474cb5d95911f56ff022832fd1536affae8a8` است. آرشیو r2 ابزار انتقال قبلی و immutable می‌ماند؛ **به‌تنهایی بسته نصب نهایی این نسخه نیست**.

۳. گیت در `consultation_private.feedback_rollout` با مقدار false ساخته می‌شود. جدول خصوصی، FORCE RLS، بدون دسترسی مستقیم anon/authenticated/service_role است؛ نقش admin برنامه دسترسی تازه‌ای نمی‌گیرد. در kernel برای partial/not_done، قفل اشتراکی ردیف معتبرِ enabled گرفته می‌شود؛ خاموش‌شدن هم‌زمان نمی‌تواند کنترل را دور بزند. GET موجود همان capability را برمی‌گرداند؛ POST پیش از write دوباره از همان read معتبر می‌خواند و kernel مرجع نهایی است. نبود capability خاموش است. خاموش‌شدن، تاریخچه را پنهان و متن فرم باز را حذف نمی‌کند.

۴. فعال‌سازی، عمل جداگانه مالک عملیات پس از پذیرش reader و rehearsal است؛ نیازمند reader_sha واقعی و reviewed_at است. هیچ مسیر تازه‌ای برای اعطای نقش/فعال‌سازی عضو ساخته نشده و در این تحویل فقط پایگاه **ساختگی ایزوله** برای آزمون روشن و خاموش شده است. SHA ساختگی آزمون شاهد استقرار reader نیست.

## reuse، کنترل و رسید

`install-feedback.py` helper دقیق PR314 با هش `5b5b0829…` را بارگذاری می‌کند و همان اعتبارسنجی هویت/backup/copy، قفل `.cashflow-release.lock` و نوشتن fsync/exclusive را بازاستفاده می‌کند. بایت‌ها بدون تبدیل پنهان تطبیق داده می‌شوند. `--mode source` بدون **reader-attestation واقعی و تازه هماهنگ‌کننده** اصلاً وارد عملیات نمی‌شود. این فایل قرارداد `consultation-feedback-reader.v1` دارد: شناسه source، SHA reader/deployment/رسید مستقل، URL، checkedAt، hash payload و شش شاهد oldSqlRead/missingCapabilityOff/newSqlRead/newHistoryReadable/uiWriterOff/postWriterOff. این یک attestation بیرونی و متصل به binding است، نه ادعای اینکه adapter خودش استقرار آنلاین را دیده است. همان attestation باید از پیش در rehearsal کپی حضور داشته باشد.

برای دو operation `apply` و `rollback`، مسیرهای intent/before/after/result جدا زیر checkpoint موجود نگهداری می‌شوند. metadata/ACL/RLS تمام اشیای قبلی، از جمله افزونه PR314، ثابت می‌مانند؛ فقط prosrc سه تابع command/execute/load و قید وضعیت از مقایسه حذف و با postcondition دقیق جدا تطبیق داده می‌شوند. اشیای جدول گیت تازه نیز دقیقاً مستثنا و دسترسی/RLS آن جدا کنترل می‌شود. fingerprint SHA256 سطرهای مشاوره/پاسخ/مالی قبل و بعد برابر بماند؛ تغییر هم‌زمان مشروع هم به‌صورت silent pass پذیرفته نمی‌شود و نیازمند بررسی مالک است.

فرمان‌های زیر **کد آماده بررسی** هستند، نه دستور مجاز اجرای primary این نوبت:

```text
python3 scripts/testing/consultation-feedback/install-feedback.py --mode copy --operation apply --attestation ACTUAL_BACKUP_ATTESTATION --reader-attestation ACTUAL_READER_ATTESTATION
python3 scripts/testing/consultation-feedback/install-feedback.py --mode source --operation apply --attestation SAME_BACKUP_ATTESTATION --reader-attestation SAME_READER_ATTESTATION
```

## نتیجه نامعلوم و برگشت

اگر پاسخ DDL گم شد، intent و نتیجه اولیه حفظ می‌شوند؛ run بعدی ممنوع است. `--reconcile` فقط همان binding/intent/beforeSha و kernel OLD/NEW، catalog و تاریخچه را می‌خواند؛ DDL، start/stop، intent تازه یا جایگزینی رسید اولیه ندارد. کپی خاموش باید توسط مالک مجازش جدا آماده شود. `MATCHED_TARGET_STATE_READBACK` صرفاً مشاهده اثر منطبق است؛ native/human acceptance نیست. OLD، metadata/history drift، تغییر گیت یا binding، unresolved می‌ماند؛ از OLD، نبود قطعی اجرای آینده یا اجازه replay نتیجه نمی‌شود. checkpoint تاریخی فقط برای readback بررسی ساختاری می‌شود و اعتبار نوشتن تازه ایجاد نمی‌کند.

```text
python3 scripts/testing/consultation-feedback/install-feedback.py --reconcile --mode source --operation apply --attestation ORIGINAL_ATTESTATION --reader-attestation ORIGINAL_READER_ATTESTATION
```

rollback نیز operation مستقل، backup/reader/rehearsal و intent خود را لازم دارد. پیش از تاریخچه جدید و با گیت خاموش، اول companion و سپس r2 در **یک transaction** برمی‌گردند. پس از partial/not_done یا هنگام روشن‌بودن گیت، rollback PT409 می‌دهد؛ تاریخچه و reader سازگار باقی می‌مانند. هیچ برگشت خودکاری وجود ندارد.

## فرمان آزمون و حد شاهد

```text
python scripts/testing/consultation-feedback/linux-check.py --artifact R2_ARCHIVE
python scripts/testing/consultation-feedback/rehearsal.py
node node_modules/tsx/dist/cli.mjs --test lib/consultation/contracts.test.ts lib/consultation/server.test.ts components/consultation/consultation-ui.test.tsx
```

Linux verifier و unit با fcntl واقعی اجرا شده‌اند؛ transport unit ساختگی است. PG17 payload/query واقعی را روی دو پروفایل مجوز و هویت SQL ساختگی آزموده؛ این native Auth/API نیست. پذیرش Auth/API جدا، مقصد واقعی اصلی، پذیرش آرش و حق تجاری همچنان گیت مستقل‌اند.
