"""
دروازهٔ دسترسیِ داشبورد هنگام میزبانی روی اینترنت (لیارا).

مسئله: داشبورد داخل iframe در پنلِ ادمینِ سایت نشان داده می‌شود، اما iframe
هیچ محافظتی نیست — هرکسی آدرسِ لیارا را داشته باشد مستقیم بازش می‌کند و
`middleware.ts` سایت هم فقط مسیرهای دامنهٔ خودِ سایت را گیت می‌کند.

راه‌حل: سایت (که خودش نقشِ admin را از Supabase چک کرده) یک توکنِ
کوتاه‌عمرِ HMAC می‌سازد و در آدرسِ iframe می‌گذارد. اینجا امضا و انقضا بررسی
می‌شود. کلیدِ مشترک فقط روی سرور است و هیچ‌وقت به مرورگر نمی‌رود.

    token = "{exp}.{sub}.{sig}"
    sig   = base64url( HMAC-SHA256(FX_EMBED_SECRET, "{exp}.{sub}") )

متغیرهای محیطی:
    FX_REQUIRE_AUTH = "1"  → اجبارِ احراز هویت (در Dockerfile ست شده).
                             نبودنش یعنی اجرای محلی و دروازه باز است.
    FX_EMBED_SECRET        → کلیدِ مشترک با سایت. اگر FX_REQUIRE_AUTH=1 باشد و
                             این خالی باشد، اپ **بسته** می‌ماند (fail-closed) —
                             تا فراموشیِ ست‌کردنِ کلید، داشبورد را عمومی نکند.
    FX_TOKEN_TTL           → حداکثر عمرِ مجازِ توکن به ثانیه (پیش‌فرض ۶۰۰).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

import streamlit as st

_SESSION_KEY = "_fx_authorized"
_MAX_TTL = int(os.environ.get("FX_TOKEN_TTL", "600"))


def _sign(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def verify_token(token: str, secret: str, now: float | None = None) -> tuple[bool, str]:
    """
    اعتبارسنجیِ توکن. خروجی: (معتبر؟، دلیلِ رد).

    ترتیبِ بررسی عمداً «امضا اول، انقضا بعد» است تا پیامِ خطا دربارهٔ اینکه
    توکنِ جعلی بوده یا فقط منقضی، به مهاجم چیزی نگوید (هر دو یک پیام می‌گیرند).
    """
    now = time.time() if now is None else now
    if not token or not secret:
        return False, "توکن یا کلید موجود نیست"
    parts = token.split(".")
    if len(parts) != 3:
        return False, "قالبِ توکن نامعتبر است"
    exp_s, sub, sig = parts
    if not hmac.compare_digest(_sign(secret, f"{exp_s}.{sub}"), sig):
        return False, "امضای توکن نامعتبر است"
    try:
        exp = int(exp_s)
    except ValueError:
        return False, "انقضای توکن نامعتبر است"
    if exp <= now:
        return False, "توکن منقضی شده است"
    if exp - now > _MAX_TTL + 60:
        # امضا درست است ولی عمر غیرعادی — یعنی سازندهٔ توکن باگ دارد. نپذیر.
        return False, "عمرِ توکن بیش از حدِ مجاز است"
    return True, ""


def require_access() -> None:
    """
    اگر دسترسی مجاز نبود، صفحه را با پیامِ فارسی متوقف می‌کند.

    پس از یک‌بار تأیید، نتیجه در `st.session_state` می‌ماند؛ بنابراین انقضای
    توکن کاربرِ درحال‌کار را وسطِ کار بیرون نمی‌اندازد. توکن فقط برای **ورود**
    لازم است، نه برای ادامهٔ نشست.
    """
    if not os.environ.get("FX_REQUIRE_AUTH") == "1":
        return                                   # اجرای محلی — دروازه باز
    if st.session_state.get(_SESSION_KEY):
        return

    secret = os.environ.get("FX_EMBED_SECRET", "")
    if not secret:
        _deny("پیکربندی ناقص است: کلیدِ `FX_EMBED_SECRET` روی سرور تنظیم نشده.",
              "تا وقتی این کلید ست نشود داشبورد بسته می‌ماند — این عمدی است "
              "تا فراموشیِ پیکربندی، داشبورد را در دسترسِ عموم نگذارد.")
        return

    token = st.query_params.get("t", "")
    if isinstance(token, list):
        token = token[0] if token else ""

    ok, _reason = verify_token(token, secret)
    if not ok:
        _deny("دسترسی مجاز نیست.",
              "این داشبورد فقط از داخلِ پنلِ مدیریتِ سایت باز می‌شود. "
              "از مسیر «پنل مدیریت ← داشبورد ارز» وارد شوید. "
              "اگر صفحه را باز گذاشته‌اید و این پیام آمد، صفحهٔ پنل را تازه کنید.")
        return

    st.session_state[_SESSION_KEY] = True


def _deny(title: str, detail: str) -> None:
    st.markdown(
        "<div dir='rtl' style='font-family:Tahoma,sans-serif;max-width:34rem;"
        "margin:4rem auto;padding:1.5rem;border:1px solid #E5E1D5;border-radius:12px;"
        f"background:#F8F7F4;color:#1A1A1A'><h3 style='margin:0 0 .5rem'>🔒 {title}</h3>"
        f"<p style='margin:0;line-height:2;color:#4A4A4A'>{detail}</p></div>",
        unsafe_allow_html=True,
    )
    st.stop()
