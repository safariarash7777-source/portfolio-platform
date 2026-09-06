# نمونه‌های طراحی — بازبینی‌نشده

> ⚠️ **هیچ‌کدام از این‌ها تصویب نشده‌اند.** پیشنهادِ بصری‌اند، نه تصمیم.
> وضعیتشان در [`COMMAND-CENTER.md`](../../COMMAND-CENTER.md) §۱۳ دنبال می‌شود.
> نیازهای پشتِ آن‌ها (`R-001`…`R-012`) در همان سند §۱۲ است — همه `PROPOSED`.

## فایلِ نمونه

`market-core-prototype.html` — یک فایلِ مستقل و بدونِ وابستگی. در مرورگر باز کنید.
توکن‌های رنگ عیناً از `app/globals.css` آمده‌اند تا نمونه با محصول یکی باشد.

با نوارِ بالای صفحه می‌توان عوض کرد: **صفحه** (خانهٔ عضو / صندوق / نماد) ·
**اندازه** (دسکتاپ / موبایل) · **حالتِ داده** (کامل / ناقص / کهنه / خطا) · **تم** (روشن / تیره).

لینکِ مستقیم به یک حالت هم کار می‌کند:

```
market-core-prototype.html#fund/mobile/stale/dark
market-core-prototype.html#symbol/partial
```

## اسکرین‌شات‌ها

| فایل | صفحه | حالت |
|---|---|---|
| `01-home-desktop-full.png` | خانهٔ عضو | دسکتاپ · دادهٔ کامل · روشن |
| `02-fund-desktop-full.png` | صندوق | دسکتاپ · دادهٔ کامل · روشن |
| `03-symbol-desktop-full.png` | نماد | دسکتاپ · دادهٔ کامل · روشن |
| `04-home-mobile-error.png` | خانهٔ عضو | موبایل · **خطا** |
| `05-fund-mobile-stale-dark.png` | صندوق | موبایل · **کهنه** · تیره |
| `06-symbol-desktop-partial.png` | نماد | دسکتاپ · **ناقص** |
| `07-fund-desktop-partial-dark.png` | صندوق | دسکتاپ · **ناقص** · تیره |

## چطور بازتولید کنم

```bash
/opt/pw-browsers/chromium --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1440,1300 --virtual-time-budget=2500 \
  --screenshot=out.png \
  "file://$PWD/docs/assets/design-review/market-core-prototype.html#fund"
```

> **دامِ شناخته‌شده:** Chromiumِ headless کمینه‌عرضِ viewport ≈ ۴۸۵px دارد.
> برای عکسِ موبایل، `--window-size=800,…` بدهید و در hash کلیدواژهٔ `mobile` را بگذارید
> تا از قابِ شبیه‌سازِ ۳۹۰px استفاده شود. عکس‌گرفتن با `--window-size=390` تصویرِ
> بریده و جابه‌جا می‌دهد — این یک artifactِ عکس‌برداری است، نه باگِ چیدمان.
