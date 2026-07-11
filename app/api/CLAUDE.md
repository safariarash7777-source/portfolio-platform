# CLAUDE.md — route handlerهای API

اینجا کدِ سرور است؛ قوانینش با UI فرق دارد:
- ورودیِ کاربر را **قبل از** اعتبارسنجی با `toLatinDigits` نرمال کن (کاربر رقم فارسی می‌فرستد).
- خطاهای کاربر-رو را **فارسی** و با status درست برگردان (الگو: `waitlist/route.ts`).
- مبلغِ پرداخت، مرجعِ معتبرش سمت سرور است (`NEXT_PUBLIC_COURSE_PRICE_TOMAN`)؛ به مبلغِ ارسالیِ کلاینت اعتماد نکن.
- روت‌های `cron/` را با هدر `Authorization: Bearer <CRON_SECRET>` احراز کن، بعد اجرا.
- فقط جایی که واقعاً لازم است (verify پرداخت، وبهوک تلگرام) `createAdminClient()` را صدا بزن؛ در بقیه `server.ts`.
