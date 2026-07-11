# رلهٔ بازار ایران

سرویس سبک Node.js برای دریافت قیمت‌های بازار ایران (طلا، سکه، ارز، صندوق‌های طلا) از منابع داخلی و ارائه به سایت اصلی.

## چرا لازم است؟

سایت روی Vercel (سرورهای خارج از ایران) میزبانی می‌شود. منابع داده بازار ایران (tgju، fipiran) درخواست‌های با IP خارجی را 403 می‌دهند. این رله روی یک هاست ایرانی اجرا می‌شود و داده را واسطه‌گری می‌کند.

## دیپلوی

### لیارا (پیشنهادی)

1. در [liara.ir](https://liara.ir) یک برنامه NodeJS بسازید (کوچک‌ترین پلن کافی است)
2. فقط محتوای این پوشه (`relay/`) را دیپلوی کنید
3. یک توکن قوی بسازید:
   ```bash
   openssl rand -hex 24
   ```
4. در تنظیمات برنامه لیارا env بگذارید:
   - `RELAY_TOKEN=<خروجی بالا>`
   - `PORT` را خود لیارا ست می‌کند

### VPS ایرانی (جایگزین)

```bash
cd relay
RELAY_TOKEN=<token> node server.mjs
# یا با PM2:
RELAY_TOKEN=<token> pm2 start server.mjs --name relay
```

## Endpoints

| مسیر | توضیح | نیاز به توکن |
|-------|--------|---------------|
| `GET /healthz` | بررسی سلامت → `ok` | خیر |
| `GET /market.json` | داده بازار ایران (JSON) | بله |

## ساختار پاسخ `/market.json`

```json
{
  "gold":     [{ "id": "geram18", "faName": "طلای ۱۸ عیار (گرم)", "price": 4823000, "unit": "toman", "change": 1.2 }],
  "currency": [{ "id": "price_dollar_rl", "faName": "دلار آمریکا", "price": 92500, "unit": "toman", "change": -0.4 }],
  "funds":    [{ "id": "fund-11143", "faName": "صندوق طلای لوتوس", "price": 98700, "unit": "toman", "change": 0.8 }],
  "stocks":   [],
  "fetchedAt": 1783800000000
}
```

## اتصال به سایت

بعد از دیپلوی، در Vercel → Settings → Environment Variables:

| نام | مقدار |
|-----|-------|
| `IR_MARKET_RELAY_URL` | `https://<app>.liara.run` (بدون `/` انتهایی) |
| `IR_MARKET_RELAY_TOKEN` | همان `RELAY_TOKEN` |

سپس Redeploy کنید. فایل `lib/market-ir.ts` خودکار داده را از رله می‌گیرد.

## منابع داده

- **طلا و سکه:** tgju.org API
- **ارز:** tgju.org API
- **صندوق‌های طلا:** fipiran.ir Fund Compare API
- **سهام:** (آینده — نیاز به کلید brsapi.ir)

## کش

کش ۵ دقیقه‌ای داخلی. اگر منبعی جواب ندهد، همان بخش خالی (`[]`) برمی‌گردد بدون crash.
