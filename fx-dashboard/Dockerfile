# داشبورد نرخ ارز — ایمیجِ اجرا روی لیارا (میزبانیِ داخل ایران).
#
# چرا داخل ایران: داشبورد مستقیم از tgju می‌خواند و tgju به درخواستِ خارج از
# ایران ۴۰۳ می‌دهد (همان دلیلی که relay/ در ریپوی سایت وجود دارد). میزبانیِ
# خارجی یعنی نرخِ زنده، تبِ حباب و بورس مرده.
FROM python:3.12-slim

# UTF-8 اجباری: متنِ فارسی روی locale پیش‌فرض، لاگ و برنامه را می‌اندازد.
ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=1 \
    # کشِ مقادیر بحرانیِ PSY روی مسیرِ نوشتنی (فایل‌سیستمِ کانتینر فقط /tmp را
    # مطمئن نوشتنی دارد). با مسیرِ بردارشدهٔ psy._bsadf_k0 بازتولیدش چند ثانیه است.
    PSY_CV_CACHE=/tmp/psy_cache \
    # fail-closed: روی هاست همیشه احراز هویت لازم است. اگر FX_EMBED_SECRET ست
    # نشود، auth_gate اپ را بسته نگه می‌دارد تا فراموشی، داشبورد را عمومی نکند.
    FX_REQUIRE_AUTH=1 \
    STREAMLIT_SERVER_PORT=8501 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_SERVER_HEADLESS=true \
    # لازم برای نمایش داخل iframe از دامنهٔ دیگر: کوکیِ XSRF با SameSite=Lax در
    # فریمِ cross-site فرستاده نمی‌شود و اپ می‌شکند. جایگزینِ محافظت، دروازهٔ
    # توکنِ auth_gate.py است.
    STREAMLIT_SERVER_ENABLE_CORS=false \
    STREAMLIT_SERVER_ENABLE_XSRF_PROTECTION=false \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

WORKDIR /app

# numpy/pandas/lxml/statsmodels/arch همگی چرخِ manylinux برای cp312 دارند، پس
# کامپایلر لازم نیست. اگر روزی بیلد به‌خاطرِ نبودِ wheel شکست، این خط را باز کنید:
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
#     && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./
RUN mkdir -p /tmp/psy_cache

EXPOSE 8501
CMD ["streamlit", "run", "app.py"]
