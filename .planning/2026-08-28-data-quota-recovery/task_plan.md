# `P2-DATA-QUOTA-RECOVERY-001` — نقشهٔ کار

## قانونِ مطلق (Wave 1)
هیچ `DELETE`, `DROP`, `TRUNCATE`, `VACUUM FULL`, migration، تغییر Production یا
توقفِ فید. فقط اندازه‌گیری. اگر اتصال نبود، توقف بدونِ حدس.

## موج‌ها
| موج | خروجی | وضعیت |
|---|---|---|
| ۱ — ممیزیِ فقط‌خواندنی | `.planning/…/findings.md` | ✅ |
| ۲ — طراحی Hot/Cold | `docs/HOT-COLD-STORAGE-DESIGN.md` | ✅ |
| ۳ — مهارِ رشد (PR غیرتخریبی) | `lib/ops/retention.ts` + Health + رله + گاردها | ✅ |
| ۴ — برنامهٔ پاک‌سازی | `docs/DATA-RETENTION-AND-ARCHIVE-PLAN.md` | ✅ |
| گیتِ توقف | هیچ اجرایی بدونِ تأیید Command Center | ⛔ رعایت شد |

## آنچه Wave 3 تغییر داد (هیچ‌کدام روی Production اجرا نشده)
- `lib/ops/retention.ts` — سیاست + طبقه‌بندی، خالص و تست‌پذیر.
- `lib/ops/retention.test.ts` — ۱۳ تست، از جمله تلهٔ «جدولِ کوچک به‌خاطر فیدِ مرده».
- `app/api/admin/health/route.ts` — دو سیگنالِ نگهداشت.
- `relay/server.mjs` — `IR_HISTORY_SECTIONS` (پیش‌فرض `gold,currency`) + ثبتِ بخشِ غایب.
- `relay/history-sections.test.mjs` — ۶ گاردِ ساختاری.
- `scripts/prove-guards.mjs` — دو موردِ جهش؛ ۱۳/۱۳ شکست‌پذیر.
