# ADR-002 — مالکیتِ Scheduler

- **تاریخ:** ۱۴۰۵/۰۵/۰۲ (2026-07-24)
- **وضعیت:** پذیرفته‌شده (Accepted)
- **Review Date:** 2026-08-23 (۳۰ روز بعد)

## Context
سه مسیرِ زمان‌بندی هم‌زمان وجود داشت: **Vercel Cron** (`vercel.json`)، **Relay Scheduler** (داخلِ رله روی Liara)، و **GitHub Actions Cron** (`cron-alerts.yml`, `cron-telegram-sync.yml`). دو workflowِ گیت‌هاب به‌خاطرِ نبودِ سکرت‌های `CRON_SECRET`/`SITE_URL` با `exit 0` **skip** می‌شدند و **سبزِ کاذب** تولید می‌کردند — این توهمِ «کران سالم است» را می‌ساخت درحالی‌که endpointِ واقعی هرگز صدا زده نمی‌شد.

## Decision
1. **Vercel Cron منبعِ اصلیِ زمان‌بندیِ Portfolio است**: `/api/cron/alerts` (روزانه ۰۶:۰۰)، `/api/cron/telegram-sync` (روزانه ۰۳:۰۰).
2. **Relay Scheduler مستقل باقی می‌ماند** (چرخه‌های فیدِ بازار/کدال/کندل داخلِ رله).
3. **GitHub Actions Cron منبعِ Production نیست** و دو workflowِ تکراری **حذف می‌شوند** (PR جدا: «chore: remove misleading duplicate cron workflows»).

## Alternatives Considered
- **افزودنِ سکرت به GitHub Actions** برای واقعی‌کردنِ آن‌ها: رد — دوباره‌کاری با Vercel Cron و منبعِ سردرگمی.
- **حذفِ Vercel Cron و اتکا به GitHub**: رد — Vercel Cron به سرویسِ زنده نزدیک‌تر و ساده‌تر است.
- **نگه‌داشتنِ workflowها به‌صورت غیرفعال**: رد — همان سبزِ کاذب و بدهیِ فنی می‌ماند.

## Consequences
- CIِ مخزن دیگر سبزِ کاذبِ کران تولید نمی‌کند.
- منبعِ حقیقتِ زمان‌بندی روشن: Vercel (سایت) + Relay (داده).
- حذفِ workflowها **endpointهای `/api/cron/*` و `vercel.json` را تغییر نمی‌دهد**.
- **ارجاعِ کهنهٔ باقی‌مانده (VERIFIED 2026-07-25):** `docs/archive/content-hub.md` هنوز
  `.github/workflows/cron-telegram-sync.yml` را به‌عنوان یک مسیرِ زمان‌بندیِ فعال توصیف
  می‌کند (و زمان‌بندیِ Vercel را «هر ۶ ساعت» می‌گوید که با `0 3 * * *` نمی‌خوانَد). این فایل
  عمداً **archive** است و در دامنهٔ این ADR اصلاح نشد؛ به‌عنوان بدهیِ مستنداتیِ شناخته‌شده
  ثبت می‌شود تا کسی آن را راهنمای فعال نگیرد.

## Risks
- اگر روزی Vercel Cron قطع شود و کسی گمان کند GitHub Actions پشتیبان است → با حذفِ workflowها این توهم برداشته می‌شود (ریسکِ مثبت).
- نیاز به مانیتورینگِ مستقلِ اجرای Vercel Cron (خارج از این ADR).

## Reversal Plan
بازگردانیِ دو فایلِ workflow از تاریخچهٔ گیت و ست‌کردنِ سکرت‌ها، اگر تصمیم شد GitHub Actions منبعِ کران شود. کاملاً برگشت‌پذیر.

## Review Date
**2026-08-23** — تأییدِ سلامتِ Vercel Cron و نبودِ رگرسیون.
