# مصرف‌کننده و تمرین native ایزوله

ادامهٔ همان بستهٔ P03.5 و همان مالکیت است؛ وضعیت جاری/پذیرش همچنان با root در COMMAND-CENTER ثبت می‌شود.

دو route واقعی محصول `/dashboard/consultation/requests` و `/admin/consultation/requests` مصرف‌کنندهٔ همان API/SQL هستند. صفحهٔ leaf با SSR هویت را تأیید می‌کند؛ Workspace نیز تغییر/قطع هویت، مجوز رابطه، متن کنترل‌شده، نگه‌داری تلاش ثابت و بازخوانی مستقل را مدیریت می‌کند. هیچ دادهٔ fixture، mock API یا شاخهٔ نمایشی در ماژول برنامه import نمی‌شود. در محصولِ فاقد provider، ثبت بسته و نبودِ حق صریح است. هم تغییر actor/relation و هم revoked/disabled advisor، پیش از fallback خصوصی داده را کنار می‌گذارند. خرابی بررسی حق ثبت، با capability=unavailable تاریخچهٔ مجاز را خالی/مخفی نمی‌کند؛ مجوز دسترسی خارج از آن catch بررسی می‌شود.

آزمون‌های `ticket-storage-ui.test.tsx` اجرای handler/hook واقعی با seam کنترل‌شده‌اند و شاهد DOM/مرورگر/Auth/DB نیستند. آن‌ها حفظ draft، GET-only recovery، منع ثبت دوم، تغییر actor و کنارگذاشتن private fallback را می‌سنجند. مرور React، exhaustive dependencies، مدیریت refهای epoch، labels/کلیدها، عدم ذخیره در مرورگر و کنترل حالت نامعلوم انجام شده است؛ این مرور انتخاب ظاهر یا پذیرش لمس/مرورگر نیست.

## زیرساخت موجود با lineage مشخص

`native-auth-runtime.mjs` و gateway این پوشه، مشتق test-only از فایل‌های پذیرفته‌شدهٔ `67aeda9ff84fb1d3e936fc39564c0e551b3ff17e` هستند. منبع frozen و محصول PR360 تغییر نکرده‌اند. `native-infrastructure-lineage.json` hash منبع و مشتق و تغییرهای محدودِ root path/label، یک profile بسته، چهار actor و route/bootstrap/فهرست سناریو را ثبت می‌کند. تصویرهای موجود DB/Auth/Node و mapping صریح PostgREST v14.17 همان lineage هستند؛ fallback به tag یا مقصد دیگر وجود ندارد.

راننده فقط Linux GitHub Actions موجود، RUNNER_TEMP خصوصی، origin ثابت `http://localhost:32189`، DB تازه با tmpfs، سرویس‌های بدون host bind روی شبکهٔ internal و ingress loopback را می‌پذیرد. proof حاوی copied DB، credential اصلی، staging/production، Docker لپ‌تاپ یا runtime/tool تازه مصرف نمی‌شود. برنامهٔ Next از آرشیو exact Git همین SHA و lock فعلی بالا می‌آید؛ ساخت UI آزمایشی یا HTTP response ساختگی در رانندهٔ native وجود ندارد. host app از نظر egress کاملاً مسدود ادعا نمی‌شود؛ transport راننده و gateway مقصدهای ثابت دارند.

bootstrap خالیِ risk فقط پیش‌شرطهای همان آزمایش قبلی START-A را برای این DB تازه فراهم می‌کند؛ assessment/قیمت/model/right واقعی ایجاد نمی‌کند. تنها fixture جدا می‌تواند با جدول خصوصی run/actor/relationship مجوز آزمایشی بدهد. claim یا profile نقش، مجوز همان خدمت نیست. GoTrue اعضای واقعیِ تست را ایجاد و password grant صادر می‌کند؛ SDK موجود همان session را با getUser تأیید و PostgREST آن JWT را اعتبارسنجی می‌کند. هیچ JWT عضو دستی ساخته نمی‌شود. چهار actor و grantها در state خصوصیِ همان run ثبت می‌شوند و آن state/credentialها artifact عمومی نمی‌شوند.

## سناریو و حدود شاهد

رانندهٔ `native.mjs`، با دو مرحلهٔ setup و پانزده مرحلهٔ دارای بررسی، این مسیرها را اجرا می‌کند:

- پروندهٔ واقعاً ذخیره‌شده با دارایی اظهارشدهٔ ۱میلیون تومان و ماندهٔ cashflow۵۸۰هزار تومان، برنامهٔ نامعلوم null؛ رضایت از API واقعی و basis دقیق.
- provider محصول در DB و HTTP بسته است؛ profile admin هم حق ایجاد نمی‌کند. سپس grant صریح fixture متعلق به همان run/UUIDهای صادرشده/رابطهٔ واقعی.
- POST واقعی با header201 عمداً body خود را از دست می‌دهد؛ transport هیچ Response جایگزین نمی‌سازد. lookup واقعی همان token، receipt و event را می‌یابد؛ unresolved دوباره POST نمی‌کند.
- خرابی عمدی provider در همان DB آزمایشی، history مجاز را حفظ می‌کند؛ تعریف و hash provider fixture عیناً بازگردانده می‌شود.
- signout واقعی، password session تازه، SDKgetUser و GET مستقل همان رویداد؛ این مرحله مرورگر واقعی نامیده نمی‌شود.
- replay تنها پس از اثر تأییدشده و برای سنجش idempotency؛ duplicate request/actor tamper و دو actor واقعی در CAS هم‌زمان، بدون overwrite.
- draft/submit/approve/publish جدا در محیط صرفاً ساختگی، link دقیق نسخه و hash، پاسخ مشاور و پیگیری عضو در رویدادهای واقعی.
- عضو دیگر/مدیر نامرتبط و RPC مستقیم رد شوند؛ private tables grant برنامه نداشته باشند؛ close رویداد تازه و terminal باشد.
- disabled advisor و changed relation رسید خصوصی نگیرند؛ revoke واقعی، تاریخچهٔ عضو را نگه دارد و خواندن مشاور/نوشتن تازه را رد کند.
- hash تمام نسخه‌ها و ردیف‌های مالی پیش/پس یکسان بماند؛ مدل یا هدف عملیاتی لمس نشود.

تا اجرا، این فهرست **طراحی راننده است، نه نتیجهٔ native**. خروجی موفق باید sourceSHA، ۱۷ مرحلهٔ واقعاً موفق و پاک‌سازی فقط منابع owned را در رسید sanitized ثابت کند. خطا/خروجی نامعلوم مجوز rerun کور نیست؛ intent/state خصوصی و log پالایش‌شده ابتدا بررسی می‌شوند. فایل‌های frozen، خطاهای قبلی و تاریخچه پاک نمی‌شوند. برنامهٔ اصلی به fixture حق آزمایشی متصل نشده است.

چهار literal تخصیص‌یافتهٔ root در test:core ثبت می‌شوند؛ آزمون UI و آزمون lineage/profile در job native صریح اجرا می‌شوند. deps/lock تغییری ندارند. CI جدید فقط همین followup را می‌سنجد؛ شاهد قدیمی a6/3bd/67 جای آن نیست.

مرورگر، mobile/desktop interaction، نصب مقصد، storage binary backup، حق تجاری واقعی و پذیرش آرش همچنان گیت‌های جدا هستند. مجوز این تمرین به انتشار شخصی، provision یا activation هدف عملیاتی تبدیل نمی‌شود.
