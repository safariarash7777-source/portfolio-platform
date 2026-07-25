# ماتریسِ متغیرهای محیطی (Environment Matrix)

> **فقط نامِ متغیرها و محلِ استفاده. هیچ مقدارِ Secret اینجا نوشته نمی‌شود.**
> منبع: grep روی کد (`process.env.*`) در تاریخ ۱۴۰۵/۰۵/۰۲. ست‌بودنِ واقعیِ مقادیر روی
> پلتفرم‌ها از این سشن راستی‌آزمایی نشد (تغییرِ env در P1-001 ممنوع بود).
>
> **بازبینیِ P1-005 (۲۰۲۶-۰۷-۲۵):** نامِ هر متغیر دوباره با grep روی کدِ `main` تطبیق داده شد.
> ردیف‌هایی که در کد پیدا نشدند با `UNKNOWN` / `DECISION_REQUIRED` علامت خورده‌اند تا
> «نوشته‌شده در سند» با «واقعاً استفاده‌شده در کد» اشتباه گرفته نشود.

## Portfolio (Vercel / Next.js)

| متغیر | عمومی/سرور | کاربرد |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عمومی | اتصالِ کلاینت/سرور به Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | عمومی | کلیدِ anon (RLS اعمال) |
| `SUPABASE_SERVICE_ROLE_KEY` | سرور | `admin.ts` — verify پرداخت، وبهوکِ تلگرام (RLS دور می‌زند) |
| `SUPABASE_SECRET_KEY` | سرور | **UNKNOWN** — در بازبینیِ ۲۰۲۶-۰۷-۲۵ هیچ ارجاعی به این نام در کدِ ریپو پیدا نشد. یا روی پلتفرم ست شده و بی‌استفاده است، یا باید از این جدول حذف شود. **DECISION_REQUIRED** |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL` | عمومی | ساختِ URLِ callback و لینک‌ها |
| `NEXT_PUBLIC_MINIAPP_URL` | عمومی | لینک به Mini App |
| `NEXT_PUBLIC_COURSE_PRICE_TOMAN` | عمومی | قیمتِ دوره (نمایش) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | عمومی | نامِ باتِ تلگرام |
| `ZARINPAL_MERCHANT_ID` | سرور | درگاهِ پرداخت |
| `ZARINPAL_SANDBOX` | سرور | حالتِ تستِ زرین‌پال |
| `TELEGRAM_BOT_TOKEN` | سرور | باتِ تلگرام |
| `TELEGRAM_CHANNEL_ID` / `TELEGRAM_PUBLIC_CHANNEL_USERNAME` | سرور | کانالِ تلگرام |
| `TELEGRAM_WEBHOOK_SECRET` | سرور | اعتبارسنجیِ وبهوکِ تلگرام |
| `RESEND_API_KEY` / `RESEND_FROM` | سرور | ارسالِ ایمیل (Resend) |
| `CRON_SECRET` | سرور | مجوزِ endpointهای `/api/cron/*` (Vercel Cron) |
| `IR_MARKET_RELAY_URL` / `IR_MARKET_RELAY_TOKEN` / `RELAY_TOKEN` | سرور | ارتباط با رله |
| `PLATFORM_WEBHOOK_SECRET` | سرور | وبهوکِ leads (miniapp→سایت) — **VERIFIED**: `app/api/leads/webhook/route.ts` همین نام را می‌خواند |
| `LEADS_WEBHOOK_SECRET` | سرور | **DRIFT / DECISION_REQUIRED** — این نام در `.env.example` هست ولی **در هیچ کدی خوانده نمی‌شود**؛ کد `PLATFORM_WEBHOOK_SECRET` می‌خواهد. اگر روی Vercel فقط `LEADS_WEBHOOK_SECRET` ست شده باشد، وبهوکِ leads **همیشه ۴۰۱** می‌دهد. باید یکی‌سازی شود (ADR-003) |
| `ICEBERG_TOKEN` | سرور | **UNKNOWN** — در بازبینیِ ۲۰۲۶-۰۷-۲۵ هیچ ارجاعی در کدِ ریپو پیدا نشد. **DECISION_REQUIRED** |

## Relay (Liara / Node)

| متغیر | کاربرد |
|---|---|
| `SUPABASE_URL` | مقصدِ نوشتنِ رله |
| `SUPABASE_SERVICE_ROLE_KEY` | نوشتنِ append-only (دور زدنِ RLS) |
| `BRSAPI_KEY` / `BRSAPI_BASE` | فیدِ اصلیِ بازار |
| `BRSAPI_COMMODITY_KEY` / `BRSAPI_COMMODITY_BASE` | فیدِ بورس کالا |
| `EOD_AFTER_HOUR` | ساعتِ آستانهٔ EOD |
| `HISTORY_RETENTION_DAYS` | نگهداشتِ `ir_market_history` |
| `CODAL_*` (ENABLED, FEED_PAGES, ARCHIVE_*, BACKFILL_*, INTERVAL_MS, ...) | تنظیمِ موتورِ کدال v3 |
| `CANDLE_*` (BACKFILL_ENABLED, BATCH, CONCURRENCY, *_CAP, ...) | بک‌فیلِ کندل |
| `SYMBOL_DETAIL_*` (DAILY_CAP, PER_CYCLE, ROTATION_N) | جزئیاتِ نماد |
| `IME_ENABLED` | فعال‌سازیِ بورس کالا |
| `RELAY_TOKEN` / `IR_MARKET_RELAY_TOKEN` | محافظتِ endpointهای رله |

## اسکریپتِ پایتونِ ارز (محلی، `.env`)

| متغیر | کاربرد |
|---|---|
| `SUPABASE_URL` | مقصدِ درجِ `fx_heavy_analytics` |
| `SUPABASE_SERVICE_ROLE_KEY` | مجوزِ درج |

## GitHub Actions (درحالِ حذف — ADR-002)

| متغیر (Secret) | وضعیت |
|---|---|
| `CRON_SECRET` | ست‌نشده → workflow skip |
| `SITE_URL` | ست‌نشده → workflow skip |

> نکتهٔ امنیتی: طبق ONBOARDING، یک توکنِ گیت‌هابِ قدیمی احتمالاً در پوشه‌های محلیِ PC لو رفته و **باید توسط آرش revoke شود** (خارج از دامنهٔ این مأموریت).
