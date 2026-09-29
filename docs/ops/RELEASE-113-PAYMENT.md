# بستهٔ اجرای واقعی — #113 «پرداخت → دسترسی»

> وضعیت: **آماده برای اجرا، اجرا نشده.** هیچ migrationی روی Production نرفته،
> هیچ بکاپی گرفته نشده، هیچ پرداختِ واقعی‌ای انجام نشده.
>
> اندازه‌گیریِ schema در ۲۰۲۶-۰۹-۱۲ با دسترسیِ **فقط‌خواندنی** به پروژهٔ
> `uooeygybrniptzdxuzhj` انجام شد. هیچ رمز یا توکنی در این سند نیست و
> نباید اضافه شود.

---

## ۱. وضعیتِ واقعیِ Production — اندازه‌گیری‌شده، نه فرض‌شده

> **وجودِ امضای تازه در فایلِ `phase24` هیچ شاهدی بر نصبش نیست.** این بخش از
> خودِ دیتابیس خوانده شده.

### جدول‌ها

| جدول | در Production | لازمِ #113 |
|---|---|---|
| `payments` · `entitlements` · `profiles` · `audit_log` · `webinar_registrations` | ✅ هست | — |
| `entitlement_durations` | ❌ **نیست** | `phase24` |
| `member_import_batches` · `member_import_rows` · `member_grants` | ❌ نیست | `phase27` |
| `radar_events` · `radar_seen` · `radar_review_flags` | ❌ نیست | `phase26` |
| `brsapi_budget_days` | ❌ نیست | `phase28` |

### توابع — مهم‌ترین یافته

| تابع | امضای امروزِ Production | چه کسی می‌تواند اجرا کند |
|---|---|---|
| `create_payment` | `(p_amount integer, p_authority text)` | **`authenticated`** و `service_role` |
| `verify_payment` | `(p_authority, p_ref_id, p_amount, p_invite_link)` | `service_role` |
| `fail_payment` | `(p_authority text)` | `service_role` |
| `register_for_webinar` | `(p_webinar_id uuid)` | `authenticated`, `service_role` |
| `finalize_paid_access` | ❌ **وجود ندارد** | — |

> 🔴 **حفرهٔ مبلغِ جعلی همین حالا در Production باز است.** `create_payment`
> دو-آرگومانی است و `authenticated` می‌تواند اجرایش کند — یعنی یک کاربرِ
> واردشده می‌تواند پرداختی با **مبلغِ دلخواه** بسازد. `phase24` دقیقاً همین را
> می‌بندد. این تنها بندِ این بسته است که ریسکِ **نکردنش** از ریسکِ کردنش
> بیشتر است.

### قیدها

- `payments`: یکتا روی `authority`، بدونِ کلیدِ خارجی روی `user_id`.
- `entitlements`: کلیدِ خارجی روی `user_id` و `granted_by` **دارد** — پس
  پرداختی با کاربرِ ناموجود در مرحلهٔ اعطا **بلند** می‌شکند، نه بی‌صدا.
- `entitlements` سیاستِ `entitlements_select_own` (`auth.uid() = user_id`) دارد.

---

## ۲. migrationها و ترتیبشان

| # | فایل | چه می‌کند | وابستگی | لازم برای |
|---|---|---|---|---|
| ۱ | `sql/phase24_payment_entitlement.sql` | امضای امنِ `create_payment`، `finalize_paid_access`، `entitlement_durations`، گاردهای وضعیت | `payments`, `entitlements`, `audit_log`, `webinar_registrations` (همه هستند) | **#113** |
| ۲ | `sql/phase25_geopolitical_intake.sql` | ورودیِ ژئوپلیتیک | مستقل | #113 (در همان PR) |
| ۳ | `sql/phase26_change_radar.sql` | رادارِ تغییر | مستقل | #120 (merge شده، اجرا نشده) |
| ۴ | `sql/phase27_member_import.sql` | ورودِ اعضا | `entitlements` + `phase24` | `D-031` |
| ۵ | `sql/phase28_brsapi_budget.sql` | شمارندهٔ بودجهٔ رله | مستقل | فعال‌سازیِ enforcement |

**ترتیبِ اجباری:** ۱ → ۴ (چون `phase27` روی `entitlements`ِ بازتعریف‌شده کار
می‌کند). بقیه مستقل‌اند و هر ترتیبی مجاز است.

**پیشنهاد برای این انتشار: فقط ۱ و ۲.** رادار و ورودِ اعضا و بودجه به مسیرِ
مشتری ربطی ندارند و هر migrationِ اضافه سطحِ ریسک را بی‌دلیل بزرگ می‌کند.

---

## ۳. سازگاریِ نسخهٔ برنامه با schema — پیش و پس از migration

این جدول تعیین می‌کند **چه چیزی اول منتشر شود**.

| نسخهٔ برنامه | schema قبل از `phase24` | schema بعد از `phase24` |
|---|---|---|
| `main` امروز (`2344179`) | ✅ کار می‌کند — `create_payment(amount, authority)` را صدا می‌زند | ⚠️ **می‌شکند**: امضای دو-آرگومانی `DROP` شده |
| `#113` | ⚠️ **می‌شکند**: امضای چهار-آرگومانی وجود ندارد | ✅ کار می‌کند |

> **هیچ نسخه‌ای با هر دو schema سازگار نیست.** پس پنجرهٔ ناسازگاری اجتناب‌ناپذیر
> است و باید **کوتاه** شود، نه نادیده گرفته شود.
>
> شکست در هر دو جهت **بلند** است (`function ... does not exist`)، نه بی‌صدا —
> یعنی پرداختِ ناموفق دسترسی نمی‌دهد و در لاگ دیده می‌شود. همین بلندبودن است
> که این پنجره را قابلِ‌تحمل می‌کند.

### ترتیبِ انتشار

```
۱) بکاپ + اثباتِ restore          ← بدونِ این، هیچ قدمِ بعدی
۲) اجرای phase24 (+ phase25)      ← از این لحظه main امروز می‌شکند
۳) merge و دیپلویِ #113           ← پنجره بسته می‌شود
۴) smoke test
```

**پنجرهٔ ناسازگاری = فاصلهٔ گامِ ۲ تا گامِ ۳.** برای کوتاه‌کردنش:

- دیپلویِ Vercel را **پیش از** گامِ ۲ آماده کن (preview سبز، آمادهٔ promote).
- گامِ ۲ و ۳ را پشتِ سرِ هم اجرا کن، نه با فاصلهٔ ساعتی.
- در ساعتِ کم‌ترافیک (شب) انجام بده.
- در این پنجره فقط **ساختِ پرداختِ تازه** می‌شکند؛ پرداخت‌های `pending` قبلی
  از مسیرِ callback نهایی می‌شوند و آسیبی نمی‌بینند.

### بازگشت (rollback)

| وضعیت | اقدام |
|---|---|
| بعد از گامِ ۲، پیش از گامِ ۳ | `phase24` را برنگردان — فقط گامِ ۳ را جلو ببر. برگرداندنِ schema پنجره را **طولانی‌تر** می‌کند |
| بعد از گامِ ۳، اشکالِ برنامه | دیپلویِ Vercel را به نسخهٔ #113ِ قبلی برگردان. schema دست‌نخورده می‌ماند |
| اشکالِ خودِ schema | restore از بکاپِ گامِ ۱ در محیطِ ایزوله، تأیید، بعد تصمیم — **نه** restore مستقیم روی Production |

> ⚠️ `phase24` امضای قدیمی را `DROP` می‌کند. بازگشتِ schema یعنی اجرای نسخهٔ
> قبلیِ آن تابع از `phase5`، که **حفرهٔ مبلغِ جعلی را دوباره باز می‌کند**. پس
> بازگشتِ schema آخرین گزینه است، نه اولین.

---

## ۴. بکاپ و اثباتِ restore

### تهیه

بکاپ از کنسولِ Supabase (`Database → Backups`) یا با `pg_dump`. **رشتهٔ اتصال
را در چت نفرست** — فقط در ترمینالِ خودت.

```bash
# در ترمینالِ خودت؛ رشتهٔ اتصال از کنسولِ Supabase
pg_dump --format=custom --no-owner --no-acl \
        --file="backup-$(date +%F-%H%M).dump" "$PGURL"
```

### اثباتِ restore — **وجودِ فایل کافی نیست**

معیارهای موفقیت، همه در یک دیتابیسِ **یک‌بارمصرف و ایزوله**:

| # | معیار | چطور سنجیده می‌شود |
|---|---|---|
| ۱ | restore بدونِ خطا تمام شود | `pg_restore --exit-on-error` |
| ۲ | همهٔ جدول‌های بحرانی موجود باشند | `payments`, `entitlements`, `profiles`, `audit_log`, `webinar_registrations` |
| ۳ | شمارشِ ردیف‌ها با مبدأ بخواند | فقط **عدد**، بدونِ هیچ دادهٔ شخصی |
| ۴ | قیدها و سیاست‌ها زنده باشند | `entitlements_user_id_fkey`, `payments_authority_key`, `entitlements_select_own` |
| ۵ | توابع همان امضا را داشته باشند | همان جدولِ بخشِ ۱ |
| ۶ | یک نوشتنِ آزمایشی کار کند | درج و حذف در یک تراکنشِ `ROLLBACK` |

```bash
# همه روی دیتابیسِ یک‌بارمصرف — هرگز روی Production
createdb restore_check
pg_restore --exit-on-error --no-owner --no-acl -d restore_check backup-*.dump
psql -d restore_check -c "\dt public.*"
psql -d restore_check -tAc "select count(*) from public.payments"
psql -d restore_check -tAc \
  "select conname from pg_constraint where conname in
   ('entitlements_user_id_fkey','payments_authority_key')"
dropdb restore_check
```

`docs/ops/BACKUP-RUN-CARD.md` همین را با جزئیاتِ بیشتر دارد.

---

## ۵. متغیرهای محیطی — نام و محل، **بدونِ مقدار**

> هیچ‌کدام از این مقادیر را در چت، PR، لاگ یا issue ننویس.

### Vercel → Project Settings → Environment Variables (Production)

| نام | نقش | حساس |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | آدرسِ پروژه | خیر |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | کلیدِ عمومی | خیر |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS را دور می‌زند — فقط verify پرداخت و وبهوکِ تلگرام | 🔴 **بله** |
| `ZARINPAL_MERCHANT_ID` | شناسهٔ پذیرنده | 🔴 بله |
| `ZARINPAL_SANDBOX` | `1` = محیطِ آزمایشی | خیر |
| `COURSE_PRICE_TOMAN` | **منبعِ واحدِ مبلغ** — مبلغ هرگز از کاربر نمی‌آید | خیر |
| `NEXT_PUBLIC_SITE_URL` | ساختِ آدرسِ callback | خیر |

### Liara → App → Environment (فقط رله)

| نام | نقش |
|---|---|
| `BRSAPI_KEY` · `BRSAPI_COMMODITY_KEY` | کلیدهای فید 🔴 |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | نوشتنِ رله 🔴 |
| `BRSAPI_CLIENT_ENABLED` | `0` امروز |
| `BRSAPI_BUDGET_ENFORCE_LEGACY` | `0` امروز — شرایطِ روشن‌کردنش در `BRSAPI-CLIENT-DESIGN.md` |

---

## ۶. درگاه — چه امکانِ تستی دارد

زرین‌پال **سندباکس** دارد: `sandbox.zarinpal.com` با همان قراردادِ
`PaymentRequest`/`PaymentVerification`. کد از راهِ `ZARINPAL_SANDBOX` پشتیبانی
می‌کند (`lib/zarinpal.ts`).

| مرحله | با سندباکس | نیازِ پولِ واقعی |
|---|---|---|
| ساختِ پرداخت و گرفتنِ `authority` | ✅ | خیر |
| هدایت به درگاه | ✅ | خیر |
| callbackِ موفق و `verify` | ✅ | خیر |
| ساختِ `entitlement` و باز شدنِ دسترسی | ✅ | خیر |
| callbackِ تکراری و هم‌زمان | ✅ | خیر |
| **تأییدِ نهاییِ درگاهِ واقعی** | ❌ | ✅ — یک تراکنشِ کم‌مبلغ |

> کلِ مسیر با سندباکس قابلِ اثبات است. اگر تراکنشِ واقعی لازم شد، **مبلغ و
> دلیلش را پیش از خرج اعلام می‌کنم** و منتظرِ تأیید می‌مانم.

---

## ۷. smoke test پس از انتشار

همه با **حسابِ آزمایشی** و درگاهِ سندباکس:

| # | گام | معیارِ قبولی |
|---|---|---|
| ۱ | `/` و `/market` باز شوند | ۲۰۰، بدونِ خطای کنسول |
| ۲ | ورود با حسابِ آزمایشی | نشست ساخته شود |
| ۳ | `/dashboard` | «دسترسی کامل» **نداشته باشد** |
| ۴ | شروعِ پرداخت | ردیفِ `pending` با `purpose` درست |
| ۵ | تلاشِ ساختِ پرداخت با مبلغِ دلخواه از کنسولِ مرورگر | **رد شود** (`permission denied`) |
| ۶ | تکمیلِ پرداخت در سندباکس | `paid` + دقیقاً **یک** `entitlement` |
| ۷ | باز کردنِ دوبارهٔ همان URLِ callback | دسترسیِ دوم ساخته **نشود**، خطا هم ندهد |
| ۸ | `/dashboard` | «دسترسی کامل» با تاریخِ پایانِ درست |
| ۹ | حسابِ آزمایشیِ دوم | دادهٔ حسابِ اول را **نبیند** |
| ۱۰ | حسابی با دسترسیِ منقضی | پیامِ «دوره به پایان رسیده»، نه پیامِ کاربرِ تازه |

مرحلهٔ ۵ و ۷ مهم‌ترین‌اند: یکی حفرهٔ مبلغ را می‌سنجد و دیگری دسترسیِ مضاعف را.

---

## ۸. آنچه از تو لازم است

| # | اقدام | کجا | چرا من نمی‌توانم |
|---|---|---|---|
| ۱ | گرفتنِ بکاپ و اجرای معیارهای بخشِ ۴ | ترمینالِ خودت + کنسولِ Supabase | رشتهٔ اتصال لازم دارد و **نباید** به من داده شود |
| ۲ | اجرای `phase24` (+ `phase25`) | Supabase SQL Editor | همان |
| ۳ | تأییدِ `ZARINPAL_SANDBOX=1` و `COURSE_PRICE_TOMAN` | Vercel | دسترسی به تنظیماتِ پروژه ندارم |
| ۴ | تأییدِ دیپلویِ Vercel | کنسولِ Vercel | دامنه از محیطِ من با ۴۰۳ بسته است |
| ۵ | تعدادِ replicaِ Liara | کنسولِ Liara | هیچ توکنِ `LIARA*` در محیط نیست |
| ۶ | ارسالِ نامهٔ `D-026` | ایمیل/پنلِ BrsApi | پیامِ بیرونی نمی‌فرستم |

پس از ۱ و ۲، بگو تا merge و دیپلویِ #113 و smoke test را جلو ببرم.
