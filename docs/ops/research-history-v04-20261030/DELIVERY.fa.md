# P10.1 — نخستین برش projection تاریخچه

این رسیدِ تاریخیِ برش projection343 است؛ اتصال consumer روی مبنای B330 در `docs/ops/research-history-consumer-v04-20261030/DELIVERY.fa.md` مستند شده است. رجیستری این شاخه اکنون افزایشی و با حفظ B، هر دو آزمون projection/panel را اجرا می‌کند.

## مسیر استفاده

`projectResearchHistory(snapshots)` در `lib/intelligence/research-history.ts` فقط metadata ازقبل خوانده‌شده را دریافت می‌کند. sourceهای شناخته‌شده: worker_state، worker_last_run، workbook_versions و workbook_reviews. sourceId یک alias ثابت و غیرحساس برای همان scope/مقصد است؛ برای اتصال نسخه و بازبینیِ یک مقصد باید یکسان باشد. readAt زمان خواندنِ تحویل‌شده است؛ تابع ساعت جاری نمی‌خواند. شکست reader با status=unavailable تحویل می‌شود؛ دادهٔ خوانده‌نشده با [] جعل نمی‌شود. نبود source به not_supplied و ساختار ناسازگار به invalid می‌رود. invalidRows تعداد metadata کنارگذاشته‌شده را نگه می‌دارد.

نوع‌های VersionHistoryMetadata و ReviewHistoryMetadata با Pick از قرارداد فعلی store صادر می‌شوند. تابع data را unknown می‌پذیرد و فقط فیلدهای مشخص را بازمی‌سازد؛ حتی body/title/note/draft/provenance را برای حذف‌کردن هم نمی‌خواند. actorId و referenceها برای consumer مجاز هستند؛ این تابع مجوز یا مسیر عمومی ایجاد نمی‌کند.

شناسه رویداد مستقل از readAt است؛ دوباره‌خواندن همان metadata یک اقدام تازه نمی‌سازد. readAt آخرین مشاهدهٔ معتبر تحویل‌شده باقی می‌ماند. تعارض در یک مرجع، همان رویداد را از خروجی حذف و conflictingReferences را ثبت می‌کند؛ طرف اول/آخر برنده نمی‌شود. ترتیب خروجی مرجع است، نه ادعای ترتیب رخدادهای نامعلوم. last-run بدون زمان نمی‌تواند runهای مستقل را از هم بشمارد؛ رویدادش با gap صریح undated_report_not_unique_run یک مشاهدهٔ محدود است.

## منبع و مسیر review موجود

- `scripts/agents/research-worker.ts`: state schema۱/۲، entries[digest] و last-run؛ entryAt فقط فیلد at منبع است. startedAt/completedAt ساخته نمی‌شوند. started/ready/stored/failed و نتیجه last-run صرفاً وضعیت گزارش‌شده‌اند؛ writeOutcome=unknown حتی برای stored/unchanged. هیچ find/append/model/retry از projection اجرا نمی‌شود. attempts/requestAliases دفتر جامع انتقال‌ها نیستند و به رخداد ساختگی تبدیل نمی‌شوند.
- `lib/intelligence/workbook-store.ts`: نسخه از StoredVersion؛ بازبینی از StoredReview. `openWorkbook` از `store.reviews(all.map(v => v.id))` می‌خواند. implementation فعلی در `app/api/admin/intelligence/workbooks/route.ts`، `research_workbook_reviews` را با id/version_id/decision/note/reviewed_at می‌خواند؛ reviewed_by در خروجی قرارداد نیست، پس actor بازبینی null/not_in_contract است، حتی اگر property اضافه‌ای به ورودی تزریق شود.
- createdBy معتبر نسخه فقط هویت است، نه نقش. reader recent ستون created_by را نمی‌گیرد؛ نسخه کامل ممکن است داشته باشد. createdAt/reviewedAt خودشان باقی می‌مانند و timezone باید صریح باشد؛ precision میکروثانیهٔ منبع حفظ می‌شود. زمان غایب/نامعتبر null با gap است.
- بازبینی versionId خودش را حفظ می‌کند؛ v1 با وجود v2 همان v1 می‌ماند. اگر metadata همان versionId در همان sourceId حاضر نباشد یا متعارض باشد، version/workbookId حدس زده نمی‌شوند. approved_internal انتشار یا نتیجه ارزیابی عملکرد نیست.

## آزمون و مرز پذیرش

۱۱ آزمون اختصاصی موفق: dedupe در schema۱/۲ و خواندن تکراری، نساختن انتقال‌های میانی، زمان/actor ناموجود و زمان نامعتبر، نگه‌داشتن بازبینی v1 پس از v2، مرجع یتیم و مقصد متفاوت، تعارض مستقل از ترتیب ورودی، unknown write، عدم دسترسی/نشت فیلد خصوصی، unavailable/empty/not_supplied/invalid و مرجع ناسالم. typecheck و eslint scoped نیز موفق‌اند.

فرمان بازتولید: `npx --no-install tsx --test lib/intelligence/research-history.test.ts`؛ این فایل هنوز در رجیستری test:core نیست، مالک رجیستری root است. آزمون‌ها مصنوعی‌اند؛ ۴۲entry محلی root خوانده یا به این fixtureها کپی نشده‌اند. هیچ ادعای live/allAnalysts/appendOnly/اتمامP10 یا پذیرش runtime نداریم. همه پوشش‌ها در خروجی false/محدودند.

این برش consumer، readerIO، UI، writer یا adapter مقصد نصب نمی‌کند. قدم بعد با هماهنگ‌کننده: reader مجاز metadata و سیاست scope/پوشش و سپس قرارداد ثبت آینده، با گیت جدا و حفظ lock/intent/budget. workbook-store/helpers/sharedrefs/worker/ledger/Hermes/primary دست‌نخورده‌اند؛ source محصول از lab339 مستقل است.
