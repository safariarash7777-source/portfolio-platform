# معماریِ Production — «قطب‌نمای بازار»

> سندِ پایهٔ معماری (Baseline). مأموریت P1-001. تاریخ: ۱۴۰۵/۰۵/۰۲ (2026-07-24).
> این سند «واقعیتِ زندهٔ امروز» را ثبت می‌کند، نه آرزوها. هر ادعا شواهدِ ممیزیِ P0-002 دارد.
>
> **نقشِ این سند: معماریِ کلان (ساختارِ نسبتاً پایدار).**
> برای **وضعیتِ عملیاتیِ لحظه‌ای** — SHAها، بلاکرهای باز، PRهای باز، آمادگیِ محیط‌ها —
> منبعِ حقیقت [`COMMAND-CENTER.md`](./COMMAND-CENTER.md) است، نه این فایل. اگر این دو
> اختلاف داشتند، **COMMAND-CENTER تازه‌تر است**.
> تصمیم‌های باز/بسته در [`DECISION-LOG.md`](./DECISION-LOG.md).

## ۱) سرویس‌ها و میزبانی

| سرویس | میزبان | نقش | دامنه/مرجع |
|---|---|---|---|
| **Portfolio (سایت)** | **Vercel** | Next.js 15 App Router؛ UIِ فارسی/RTL، RSC، Auth، ادمین | (دامنهٔ Vercel — production) |
| **Supabase** | Supabase Cloud | دیتابیس Postgres 17 + Auth + RLS | ref صحیح: **`uooeygybrniptzdxuzhj`** (منطقه us-east-2) |
| **Relay (relay/)** | **Liara** (PaaS ایران) | از داخلِ ایران دادهٔ BrsApi را می‌گیرد و به Supabase می‌نویسد | `arsadata.liara.run` |
| **Mini App (فعلی)** | **Manus (Legacy)** | نسخهٔ زندهٔ قدیمی‌تر از main | `arash-teleapp-7shs2egu.manus.space` |
| **Mini App (هدف)** | **Docker + Coolify/VPS** | معماریِ هدف بر مبنای PR #2 (هنوز مستقر نشده) | (VPS — تعیین‌نشده) |

> **ref منسوخ:** `lqfcyihuthdoqybwptxh` دیگر معتبر نیست و Production نیست (در ممیزی P0-002 غیرقابل‌دسترس بود). فقط در اسناد تاریخی/گزارشِ Audit با برچسبِ _deprecated_ می‌ماند؛ در هیچ راهنمای فعالِ Deployment استفاده نشود.

## ۲) جریانِ یکپارچگی (Integration Flow)

```
BrsApi (داخل ایران)
   │  (فقط از IP ایران در دسترس)
   ▼
Relay @ Liara (relay/server.mjs)  ──►  Supabase (uooeygybrniptzdxuzhj)
   │   جدول‌های append-only:                     ▲
   │   ir_market_snapshots, ir_market_history,   │ می‌خواند (RSC، کلید anon + RLS)
   │   symbol_history, codal_reports/feed,        │
   │   fx_rates, index_history, market_breadth    │
   ▼                                              │
(EOD/ادواری)                          Portfolio @ Vercel ──► کاربر (فارسی/RTL)

Mini App @ Manus (Legacy)  ──►  (لید/تعامل تلگرام)  ──►  [هدف: نوشتن به Supabase.leads]
```

- **Auth گیت** در `middleware.ts`: مسیرهای `/dashboard`، `/admin`، `/terminal`؛ نقشِ admin از `profiles.role` (منبعِ واحدِ حقیقت).
- **پرداخت**: زرین‌پال؛ رکورد در `payments` (append-only، `authority` یکتا، RPCهای SECURITY DEFINER). جزئیات در `docs/MIGRATION-LEDGER.md`.

## ۳) Schedulerها (زمان‌بندی)

| Scheduler | مالکِ واقعی | کارها |
|---|---|---|
| **Vercel Cron** | Portfolio (منبعِ اصلی) | `/api/cron/alerts` (روزانه ۰۶:۰۰)، `/api/cron/telegram-sync` (روزانه ۰۳:۰۰) — از `vercel.json` |
| **Relay Scheduler** | Relay @ Liara (مستقل) | چرخه‌های فید بازار/کدال/کندل/IME داخلِ خودِ رله |
| **GitHub Actions Cron** | ~~duplicate~~ (درحالِ حذف) | `cron-alerts.yml` + `cron-telegram-sync.yml` — بدونِ سکرت skip می‌شدند (سبزِ کاذب). ADR-002 |

> **درفتِ کامنتِ کد ↔ `vercel.json` (VERIFIED 2026-07-25):** کامنتِ بالای
> `app/api/cron/alerts/route.ts` می‌گوید «هر ۵ دقیقه (Vercel Cron)»، اما `vercel.json`
> این مسیر را **روزانه `0 6 * * *`** زمان‌بندی کرده است. **`vercel.json` منبعِ حقیقت است**؛
> کامنت کهنه است. همین درفت در `docs/archive/content-hub.md` هم هست («هر ۶ ساعت» برای
> `telegram-sync` درحالی‌که واقعیت `0 3 * * *` روزانه است).
> پیامدِ عملی: **هشدارهای قیمت روزی یک‌بار ارزیابی می‌شوند، نه هر ۵ دقیقه** — اگر انتظار
> رفتارِ ۵دقیقه‌ای هست، این یک بلاکرِ محصولی است، نه یک اشتباهِ تایپی.
> علتِ محتمل: محدودیتِ پلنِ Hobbyِ Vercel (حداکثر کرانِ روزانه) — **INFERRED**، از این سشن
> راستی‌آزمایی نشد. اصلاحِ کامنت/ارتقای پلن خارج از دامنهٔ P1-005 بود. **DECISION_REQUIRED**

## ۴) دامنه‌ها (خلاصه)
- Portfolio: دامنهٔ Vercel (production).
- Relay: `arsadata.liara.run` (endpointِ عمومیِ `/debug` بدونِ سکرت وضعیت می‌دهد).
- Mini App Legacy: `arash-teleapp-7shs2egu.manus.space`.

## ۵) Unknownهای باقی‌مانده
- دامنهٔ نهاییِ Portfolio روی Vercel (custom domain?) — **UNVERIFIED** در این سند.
- VPS/Coolifyِ هدفِ Mini App هنوز provision نشده — **DECISION/PENDING** (ADR-001).
- آیا `symbol_history` نویسندهٔ روزانه دارد یا فقط بک‌فیل؟ — **UNVERIFIED** (از دادهٔ لحظه‌ای قطعی نشد).
- ست‌بودن/نبودنِ سکرت‌ها روی Vercel/Liara از این سشن قابلِ راستی‌آزمایی نیست (تغییرِ env ممنوع بود).
