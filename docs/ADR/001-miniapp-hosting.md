# ADR-001 — میزبانیِ Mini App

- **تاریخ:** ۱۴۰۵/۰۵/۰۲ (2026-07-24)
- **وضعیت:** پذیرفته‌شده (Accepted) — اجرا نشده
- **Review Date:** 2026-08-23 (۳۰ روز بعد)
- **Decision Log:** `DD-002` (Manus موقت)، `DD-003` (Docker/Coolify هدف) · تصمیمِ باز: **`D-003`** (زمانِ مجازِ cutover) — [`DECISION-LOG.md`](../DECISION-LOG.md)
- **Blockers:** `B-005`، `B-006`، `B-007`، `B-008` · Gate: `G-005`، `G-006` — [`COMMAND-CENTER.md`](../COMMAND-CENTER.md)

## Context
نسخهٔ زندهٔ Mini App روی **Manus** میزبانی می‌شود (`arash-teleapp-7shs2egu.manus.space`) و **قدیمی‌تر از `main`** است (drift بین زنده و مخزن). وابستگی به Manus باعثِ قفلِ پلتفرم و نبودِ کنترلِ کاملِ استقرار می‌شود. PR #2ِ مخزنِ `telegram-miniapp` مسیرِ استقلال از Manus + Docker + Coolify را تعریف می‌کند.

> توجه: مخزنِ `telegram-miniapp` در سشنِ P1-001 خارج از scope بود؛ جزئیاتِ PR #2/#1 راستی‌آزمایی نشد و به فازِ بعد موکول است.

## Decision
1. **Manus فقط موقتی (Legacy) است** و تا زمانِ cutover زنده می‌ماند.
2. **معماریِ هدف: Docker + Coolify روی VPS** (بر مبنای PR #2).
3. **هیچ Featureِ جدیدی روی Manus ساخته نمی‌شود** — فقط نگه‌داریِ حیاتی.
4. **Cutover قبل از Decommission**: تا وقتی نسخهٔ Docker/Coolify پایدار و تأییدشده نشده، Manus حذف نمی‌شود.

## Alternatives Considered
- **ماندن روی Manus**: رد — قفلِ پلتفرم، drift، نبودِ کنترلِ استقرار.
- **Vercel برای Mini App**: رد — محدودیت‌های اجرای باتِ تلگرام و نیاز به کنترلِ کانتینر.
- **VPS خام بدونِ Coolify**: رد — سربارِ عملیاتیِ بیشتر؛ Coolify مدیریتِ استقرار را ساده می‌کند.

## Consequences
- نیاز به provisionِ VPS + راه‌اندازیِ Coolify + Dockerfile (کارِ فاز بعد).
- یک دورهٔ هم‌زیستیِ Manus/Docker تا cutover.
- کنترلِ کاملِ استقرار و حذفِ وابستگی به Manus پس از cutover.

## Risks
- **قطعیِ سرویس** اگر cutover بدونِ تستِ کافی انجام شود → کاهش با اجرای موازی + تستِ دود.
- **وبهوکِ تلگرام**: تغییرِ آدرس نیازمندِ `setWebhook` است (در این فاز **ممنوع**؛ فقط برنامه‌ریزی).
- نشتِ داده اگر env/secret در مهاجرت درست منتقل نشود.

## Reversal Plan
تا زمانی که Manus زنده و webhook روی آن است، بازگشت = نگه‌داشتنِ Manus و لغوِ cutover. چون Manus حذف نمی‌شود، بازگشت کم‌هزینه است.

## Review Date
**2026-08-23** — بازبینیِ پیشرفتِ VPS/Coolify و آمادگیِ cutover.
