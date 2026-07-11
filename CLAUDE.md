# CLAUDE.md — پلتفرم آرش صفری

پلتفرم تحلیل ریسک و طراحی پرتفوی سرمایه‌گذاری برای بازار ایران. قوانین شخصی من در `~/.claude/CLAUDE.md` است؛ اینجا فقط چیزهای مخصوص این ریپو.

## استک
Next.js 15 (App Router) · React 18 · TypeScript · Tailwind 3 · Supabase (`@supabase/ssr`) · نمودار: `lightweight-charts` + `recharts` · آیکون: `lucide-react`. بدون ORM؛ دسترسی داده مستقیم با Supabase client.

## فارسی و RTL
- کل UI فارسی و راست‌به‌چپ است (`<html lang="fa" dir="rtl">`)؛ چیدمان RTL باید بی‌نقص بماند.
- اعداد/پول/تاریخ فقط با هلپرهای `lib/format.ts`: `toPersianDigits` برای نمایش، `toLatinDigits` **قبل از** اعتبارسنجی ورودی، `formatToman` (پول = عددِ صحیحِ تومان)، `formatJalali` (تاریخ جلالی). رقمِ فارسی یا تاریخ را دستی نساز — ناهماهنگیِ hydration و پارسِ اشتباه می‌آورد.

## رنگ و فونت — فقط توکن
- منبع رنگ: `tailwind.config.js` + متغیرهای `app/globals.css` (`--navy`, `--gold`, `--surface`, `--line`, …). هیچ رنگِ خارج از توکن ننویس. سایه: `shadow-institutional` / `--shadow*`.
- فونت Vazirmatn با `next/font` سلف‌هاست است. **فونت از CDN لود نکن.**

## داده — نمایش و ذخیره
- دادهٔ نمونه/دمو در UI باید برچسب صریحِ «نمونهٔ نمایشی» داشته باشد.
- ذخیره باید **append-only/نسخه‌دار** باشد؛ upsert مخربی که رکورد قبلیِ کاربر را نابود کند ممنوع.

## سه‌گانهٔ Supabase (اشتباه نگیر)
- `lib/supabase/client.ts` → کامپوننت کلاینت (مرورگر) · `server.ts` → RSC و route handler (با کوکی) · `admin.ts` → service-role، `server-only`، RLS را دور می‌زند؛ فقط verify پرداخت و وبهوک تلگرام.
- **`admin.ts` را هرگز در کامپوننت کلاینت import نکن** (کلید سرویس‌رول لو می‌رود).
- Auth در `middleware.ts`: مسیرهای `/dashboard` و `/admin` گیت می‌شوند؛ نقشِ admin از `profiles.role` در دیتابیس خوانده می‌شود (منبعِ واحدِ حقیقت).

## هنگام تغییر پوسته
منطقِ endpointهای فرم (مثل `/api/waitlist`) را عیناً حفظ کن؛ فقط ظاهر را عوض کن.

## دستورها و پذیرش
```bash
npm run dev        # توسعهٔ محلی
npm run build      # باید سبز باشد — پایان هر کار
npm run typecheck  # اگر تایپ‌ها را لمس کردی
npm run lint
```
متغیرهای محیطی در `.env` (نمونه: `.env.example`)؛ سکرت‌های service-role / زرین‌پال / تلگرام / cron فقط سمت سرور.
