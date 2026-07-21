# راهنمای پروژه: داشبورد نرخ ارز ایران

داشبورد **Streamlit** برای تحلیل و پیش‌بینی نرخ ارز/طلا/سکه (مدل‌های PPP و پولی). رابط کاملاً **فارسی/RTL**. صاحب: آرش صفری.

> قوانین عمومی در `~/.claude/CLAUDE.md` هم اعمال می‌شوند؛ این فایل فقط مواردِ خاصِ همین پروژه است.

## معماری (فایل → نقش)
- `app.py` — نقطه‌ی ورود و کل UI/تب‌ها؛ نمودارها با helperِ `brand_fig()` یکدست می‌شوند.
- `data_sources.py` (ds) — واکشی داده (tgju، اکسل، حباب‌ها) + سیستم برند: `brand_css()`, `BRAND`, `PLOT_FONT`, `PLOT_COLORS`. توابع کلیدی: `load_excel_data()`, `fetch_live_dollar()`, `fetch_bubbles_snapshot()`.
- `models.py` (m) — مدل‌های اقتصادی: PPP (Cassel) و رویکرد پولی (Frenkel–Mussa) + فرمول‌های حباب.
- `econometrics.py` (ec) — اقتصادسنجی · `forecast.py` (fct) — پیش‌بینی · `backtest.py` (bt) — بک‌تست · `sensitivity.py` — تحلیل حساسیت (`SensitivityAnalyzer`).
- `publication.py` (pub) — خروجی/گزارش · `assistant.py` — دستیار · `gemini.py` — کلاینت Gemini AI · `etfbaz.py` — کلاینت ETFbaz API.

## اجرا
- لانچرِ رسمی: `start_dashboard.ps1` (idempotent؛ اگر بالا باشد فقط مرورگر را باز می‌کند). مسیر را از محل خود اسکریپت می‌گیرد — **مسیر را hardcode نکن**.
- **پورت ثابت 8501**، `--server.headless true`. تندرستی: `http://localhost:8501/_stcore/health`.
- اجرای دستی: `python -X utf8 -m streamlit run app.py --server.port 8501 --server.headless true`.

## دیپلوی (پنل ادمینِ سایت)
- داشبورد روی **لیارا، داخلِ ایران** میزبانی می‌شود و در `/admin/fx` سایت (`portfolio-platform`) داخلِ iframe می‌آید. خارج از ایران tgju ‏۴۰۳ می‌دهد ⇒ نرخِ زنده و بورس می‌میرند.
- محافظت با توکنِ HMAC کوتاه‌عمر: `auth_gate.py` اینجا ↔ `lib/fxToken.ts` در ریپوی سایت. **قالبِ توکن در دو فایل باید یکی بماند.**
- `FX_REQUIRE_AUTH=1` در `Dockerfile` ست است و طراحی fail-closed است: نبودِ `FX_EMBED_SECRET` یعنی داشبورد بسته، نه عمومی. این را برعکس نکن.
- راهنمای کامل و عیب‌یابی: `DEPLOY.md`.

## Encoding (مهم روی ویندوز)
- همیشه UTF-8: `PYTHONUTF8=1` و `PYTHONIOENCODING=utf-8`. متن فارسی روی cp1252 برنامه را کرش می‌کند.
- app.py خودش `stdout/stderr` را روی utf-8 مجدداً تنظیم می‌کند — این تکه را حذف نکن.
- فایل‌ها را همیشه با `open(..., encoding='utf-8')` باز کن.

## داده و کش
- کش با `@st.cache_data` و TTL مناسب: داده‌ی تاریخی بدون ttl، نرخ زنده `ttl=3600`، حباب `ttl=300`.
- **منابع داده:** tgju از پروکسی/مستقیم؛ **TSETMC فقط داخل ایران در دسترس است و باید پروکسیِ خارجی را دور بزند**؛ ETFbaz API از `etfbaz.py`.

## رابط و برند
- تم (در `.streamlit/config.toml`): طلاییِ `#B8860B` روی زمینه‌ی کرمِ `#F8F7F4`، متن `#1A1A1A`. رنگ/فونت را از `ds.BRAND` و `ds.PLOT_*` بردار — **رنگ را سخت‌کد نکن**.
- همه‌ی متن‌ها فارسی/RTL. نمودارها را با `brand_fig()` بساز (فرمت تومان روی محور Y، legend پایین).

## راز/کلید
- `.streamlit/secrets.toml` کلید Gemini را نگه می‌دارد. این فایل را در خروجی/لاگ چاپ نکن و جابه‌جا/کامیت نکن.

## وابستگی‌ها
`streamlit, pandas, numpy, plotly, requests, openpyxl, lxml, statsmodels, arch` (در `requirements.txt`).
