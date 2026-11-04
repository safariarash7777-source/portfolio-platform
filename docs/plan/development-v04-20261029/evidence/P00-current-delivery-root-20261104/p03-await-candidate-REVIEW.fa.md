# P03 — نامزد محدود await؛ بدون انتشار و بدون replay

## منبع و یافتهٔ قطعی

controller بررسی‌شده `d6ccafec6b0ea793c9cb7a90a11d4d43833a71c9` و برنامه `e0b930927563d7f9f6d79e848917c4ba0d77ed6f` با tree `c6c67f2a78cd2cf672cf4f489f81e7f14cb041da` هستند. capsule والد دقیقاً `54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255` و driver آن `e8b12e8f44e80e6fc41719028769ea126a16a4250f0a6b0e2433d8481b643850` است. این دو اصل تغییر نکرده‌اند.

در `overlay/scripts/testing/consultation-tickets/composition-member-phase.mjs:68`، نتیجهٔ `validateTicketPreparationReceipt` بدون await در `prepared` قرار می‌گرفت. تعریف واقعی در `lib/consultation/ticketAttemptStorageContracts.ts:49–56` از نوع async است و در خط۵۵ `ticketBodyHash` را await می‌کند. پس مقدار قبلی Promise بود، نه receipt؛ خواندن `prepared.preparationId` در خط۷۱ شناسهٔ receipt را منتقل نمی‌کرد و رد اعتبارسنجی نیز در آن فراخوانی await نمی‌شد. `validateTicketRequest` در `tickets.ts:70` و `validateTicketReceipt` در `tickets.ts:173` همگام‌اند؛ ایراد دقیقاً همان فراخوانی prepare است.

این نقصِ منبع اثبات شده است، اما علت قطعی run41816967134 اعلام نمی‌شود. آن رسید نتیجهٔ HTTP و محل دقیق خطا را نشان نمی‌دهد. `project_attested_counts` در controller خطوط۱۱۵۳–۱۱۷۰ فقط فایل‌های مستقیم `intent-NNN.json` را می‌شمارد؛ composition/CDP را نمی‌شمارد. ترکیب پنج parent و سه other می‌تواند با grant/save/submit/approve/publish و denied-prepare/link-prepare/link-command سازگار باشد، اما این تطبیق فرضیه است، نه شاهد اجرای آن‌ها یا commit.

## تغییر مجاز و محدوده

فقط یک `await` پیش از همان validator اضافه شده است. درخواست جدید، تکرار، تغییر 403 مورد انتظار، بودجه، Auth، SQL، توکن، body، شمار پذیرش یا fallback افزوده نشده است. گره‌های دیگر capsule byte-exact هستند؛ فقط phase و pin همان phase در `assembled-overlay.json` تغییر می‌کنند. متادیتای نسب capsule قدیمی بازنویسی نشده است.

capsule تازه در همین پوشه با نام `sealed-p03-composition-e0-await-v1.tar` ساخته شده است. `PROPOSED-await.patch` تغییر تک‌خطی را نشان می‌دهد. root مالک پذیرش، pinهای controller، run.py، ثبت CI، workflow و تصمیم اجرای بعدی است. هیچ‌یک از آن‌ها اینجا تغییر نکرده‌اند.

## آزمون واقعی و قابل بازبینی

چهار regression آفلاین با چهار probe موجود R5 موفق شدند. این‌ها دادهٔ ساختگی آزمون‌اند، نه حساب یا پایگاه واقعی:

1. منبع phase از **خود capsule پین‌شده** خوانده می‌شود؛ برگشت همان await باید کل phase را byte-exact به والد برگرداند. تنها دو عضو capsule مجاز به تغییرند.
2. نمونهٔ معتبر روی source قدیمی و validator واقعی e0، نقص Promise/receipt را نشان می‌دهد: RPC ساختگی شناسهٔ undefined می‌گیرد و انتظار 403 ثابت رد می‌شود. این counterexample کنترل‌شدهٔ آفلاین است، نه اجرای دوبارهٔ run شکست‌خورده.
3. source اصلاحی با همان validator، شناسهٔ واقعیِ resolved receipt را عیناً و در JSON به RPC ساختگی می‌فرستد؛ ترتیب prepare → link → RPC و انتظار 403 حفظ می‌شود.
4. bodyHash نامعتبر، در **همان validator واقعی async** reject می‌شود؛ link و RPC پس از آن صفر بار فراخوانی می‌شوند و replay رخ نمی‌دهد.

۱۴ منبع/fixture از Git دقیق e0 در JSON inert با path/text/bytes/SHA/Gitblob ذخیره شده‌اند؛ متن دقیق قبل از compile با SHA، شمار bytes و Gitblob واقعی کنترل می‌شود. هیچ فایل فعال frozen-e0/*.ts در این revision تحویل نمی‌شود. هیچ validator، قرارداد ticket یا hash مالی stub نشده است؛ فقط حمل‌ونقل و RPC برای آفلاین‌بودن mock هستند. TypeScript موجود استفاده شده؛ وابستگی نصب نشده است. R5 در همان فرایند Node بارگذاری و نسخه/hash guard و probe کنترل می‌شوند. این guard پیشگیری از I/O تصادفی است، نه sandbox سیستم‌عامل.

Node محلی 24.22.1 بود. Linux/Node22 CI، capsule adoption، native، SQL، شبکه، private log، حساب، محیط و مقصد اجرا یا تغییر نکرده‌اند. تست‌های آفلاین، صحت runtime، منشأ خطای run41816967134 یا مجوز replay را ثابت نمی‌کنند.

بارگذاری compiler به مسیر مطلق ویندوز در کد وابسته نیست: `createRequire(__filename)` نسخهٔ project-relative را پیدا می‌کند. برای packet بیرون از پروژه می‌توان `--typescript-module=<reviewed compiler module>` را صریح داد؛ hash فایل compiler پیش از require با manifest کنترل می‌شود و env برای تعیین آن خوانده نمی‌شود. composer نیز مسیر repository و compiler را فقط از آرگومان صریح می‌گیرد. هنگام انتقال به CI باید همین bytes compiler یا نصب موجودِ هم‌hash در دسترس باشد؛ تست‌ها این وابستگی را پنهان نمی‌کنند. مقدار 403 در آزمون، پاسخ mock تابع RPC است و هیچ پذیرش Auth واقعی نیست.

پیشنهاد projection، **اعمال‌نشده و جداگانه**، در `PROJECTION-PROPOSAL.fa.md` است تا اصلاح await با توسعهٔ diagnostics مخلوط نشود. پین‌های نهایی و hash تمام فایل‌ها در receipt و manifest ثبت می‌شوند.


## بسته‌بندی revision2

نسخهٔ اول مهرشده دست‌نخورده است. capsule، phase و چهار سناریوی آزمون تغییر نکرده‌اند؛ فقط محل خواندن ۱۴ ماژول از فایل فعال TypeScript به canonical-validator-fixture.json منتقل شد. actual() متن همان JSON را با pins واقعی e0 کنترل و compile می‌کند. Node/Next هیچ نسخهٔ فعال کپی‌شده از محصول برای typecheck نمی‌بیند. فایل .gitattributes کنار packet، JSON/CJS/MJS/tar/patchهای پین‌شده را raw نگه می‌دارد و proposal آن در ATTRIBUTES-PROPOSAL.patch است؛ این attributes فقط داخل پوشهٔ اختصاص‌یافتهٔ packet اعمال شود، نه جایگزین attributes ریشه. root مالک ثبت wrapper در CI موجود و pinهای run.py/workflow است.
