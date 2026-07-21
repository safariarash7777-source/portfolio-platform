"""
کلاینت سبک Gemini (Google AI Studio) برای داشبورد.
────────────────────────────────────────────────────────────────────────────
کلید از این منابع به‌ترتیب خوانده می‌شود (هیچ‌وقت در کد هاردکد نشود):
  ۱) .streamlit/secrets.toml  →  GEMINI_API_KEY
  ۲) متغیر محیطی              →  GEMINI_API_KEY

نمونهٔ استفاده:
    import gemini
    if gemini.is_configured():
        res = gemini.ask("بازار طلا را در یک پاراگراف تحلیل کن.")
        print(res["text"])
"""
from __future__ import annotations

import os

import requests

DEFAULT_MODEL = "gemini-2.5-flash"
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _secret(name: str) -> str | None:
    """مقدار یک کلید را از secrets استریم‌لیت یا متغیر محیطی می‌خواند."""
    try:
        import streamlit as st
        if name in st.secrets:
            return str(st.secrets[name])
    except Exception:  # noqa: BLE001  (خارج از اجرای استریم‌لیت)
        pass
    return os.environ.get(name)


def _get_key() -> str | None:
    return _secret("GEMINI_API_KEY")


def _redact(s) -> str:
    """کلید API را از متن خطا حذف می‌کند تا در UI/لاگ لو نرود."""
    s = str(s)
    key = _get_key()
    if key and key in s:
        s = s.replace(key, "***")
    return s


# گوگل در ایران مسدود است. بسته به نوع فیلترشکن، یا اتصال مستقیم کار می‌کند (حالت TUN/سیستمی)
# یا باید از پراکسی محلی رد شد. این کلاینت هر دو را امتحان می‌کند و مسیر موفق را کش می‌کند.
_GOOD_TRANSPORT = None   # None=نامشخص | {"http":None,...}=مستقیم | {"http":proxy,...}=پراکسی


def _transports() -> list:
    """ترتیب تلاش: مسیر موفقِ کش‌شده، سپس مستقیم، سپس پراکسی پیکربندی‌شده (GEMINI_PROXY)."""
    direct = {"http": None, "https": None}    # عبور صریح از هر پراکسی محیط (مناسب TUN/VPN سیستمی)
    p = _secret("GEMINI_PROXY")
    proxy = {"http": p, "https": p} if p else None
    order, seen, out = [], set(), []
    if _GOOD_TRANSPORT is not None:
        order.append(_GOOD_TRANSPORT)
    order.append(direct)
    if proxy:
        order.append(proxy)
    for t in order:
        k = str(t)
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


def _request(method: str, url: str, **kw):
    """
    درخواست HTTP با fallback خودکار بین مستقیم و پراکسی.
    ۴۰۳ (مسدودیت جغرافیایی/شبکه‌ای ایران) هم «شکست مسیر» تلقی می‌شود تا مسیر دیگر امتحان شود.
    فقط مسیری که پاسخ غیر-۴۰۳ بدهد کش می‌شود.
    """
    global _GOOD_TRANSPORT
    last_resp = None
    last_err = None
    for t in _transports():
        try:
            r = requests.request(method, url, proxies=t, **kw)
        except (requests.exceptions.ProxyError,
                requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            last_err = e
            if _GOOD_TRANSPORT == t:
                _GOOD_TRANSPORT = None
            continue
        if r.status_code == 403:        # احتمالاً مسدودیت ایران روی این مسیر → مسیر بعدی
            last_resp = r
            if _GOOD_TRANSPORT == t:
                _GOOD_TRANSPORT = None
            continue
        _GOOD_TRANSPORT = t             # مسیر سالم → کش
        return r
    if last_resp is not None:
        return last_resp               # همهٔ مسیرها ۴۰۳ → همان ۴۰۳ را برگردان
    raise last_err if last_err else RuntimeError("no transport available")


def is_configured() -> bool:
    return bool(_get_key())


def list_models() -> list:
    """فهرست مدل‌های در دسترس (برای تست اتصال)."""
    key = _get_key()
    if not key:
        return []
    try:
        r = _request("GET", _MODELS_URL, params={"key": key}, timeout=20)
        r.raise_for_status()
        return [m.get("name") for m in r.json().get("models", [])]
    except Exception as e:  # noqa: BLE001
        print(f"[gemini.list_models] error: {_redact(e)}")
        return []


def ask(prompt: str, system: str | None = None, model: str = DEFAULT_MODEL,
        temperature: float = 0.4, timeout: int = 45) -> dict:
    """
    یک پیام به Gemini می‌فرستد و پاسخ متنی می‌گیرد.
    خروجی: {ok, text, error, usage}.
    """
    key = _get_key()
    if not key:
        return {"ok": False, "text": "", "error": "کلید Gemini تنظیم نشده است.", "usage": None}

    body: dict = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    try:
        r = _request("POST", _ENDPOINT.format(model=model),
                     params={"key": key}, json=body, timeout=timeout)
        if r.status_code != 200:
            return {"ok": False, "text": "", "error": _http_error(r), "usage": None}
        j = r.json()
        parts = j["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        return {"ok": True, "text": text, "error": None, "usage": j.get("usageMetadata")}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "text": "", "error": _conn_error(e), "usage": None}


def _http_error(r) -> str:
    """پیام خطای دوستانهٔ فارسی برای کدهای رایج HTTP."""
    if r.status_code == 429:
        return ("محدودیت نرخ Gemini (۴۲۹): سهمیهٔ کلید پر شده است. چند دقیقه صبر کن "
                "یا در Google AI Studio پلن/سهمیه را بررسی کن.")
    if r.status_code in (500, 503):
        return f"سرور Gemini موقتاً در دسترس نیست ({r.status_code}). کمی بعد دوباره امتحان کن."
    if r.status_code == 403:
        body = (r.text or "").strip()
        if not body or "API key" not in body:
            return ("دسترسی به Gemini رد شد (۴۰۳) — به‌احتمال زیاد فیلترشکن وصل نیست و IP ایران "
                    "مسدود شده. OpenVPN/فیلترشکن را وصل کن و دوباره امتحان کن.")
        return "کلید Gemini نامعتبر است (۴۰۳). کلید را در secrets.toml بررسی کن."
    if r.status_code == 401:
        return "کلید Gemini نامعتبر یا فاقد دسترسی است (۴۰۱). کلید را در secrets.toml بررسی کن."
    return f"HTTP {r.status_code}: {_redact(r.text[:200])}"


def _conn_error(e) -> str:
    """پیام دوستانهٔ خطای اتصال (نه مستقیم نه پراکسی) با حذف کلید."""
    return ("اتصال به Gemini برقرار نشد — نه مستقیم و نه از پراکسی. "
            "فیلترشکن (TUN یا پراکسی) را روشن کن؛ اگر پورت پراکسی فرق دارد GEMINI_PROXY را در "
            f"`.streamlit/secrets.toml` اصلاح کن. جزئیات: {_redact(e)[:120]}")


def generate(contents: list, system: str | None = None, tools: list | None = None,
             model: str = DEFAULT_MODEL, temperature: float = 0.4, timeout: int = 60) -> dict:
    """
    فراخوانی سطح‌پایین برای گفتگوی چندنوبتی و function-calling.
    `contents`: فهرست پیام‌ها به فرمت Gemini (هر کدام {role, parts:[...]}).
    `tools`: فهرست ابزارها [{"functionDeclarations": [...]}] (اختیاری).
    خروجی: {ok, candidate, error, usage} که candidate همان content پاسخ (شامل parts با text یا functionCall) است.
    """
    key = _get_key()
    if not key:
        return {"ok": False, "candidate": None, "error": "کلید Gemini تنظیم نشده است.", "usage": None}

    body: dict = {"contents": contents, "generationConfig": {"temperature": temperature}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if tools:
        body["tools"] = tools

    try:
        r = _request("POST", _ENDPOINT.format(model=model),
                     params={"key": key}, json=body, timeout=timeout)
        if r.status_code != 200:
            return {"ok": False, "candidate": None, "error": _http_error(r), "usage": None}
        j = r.json()
        cand = (j.get("candidates") or [{}])[0]
        return {"ok": True, "candidate": cand.get("content"),
                "error": None, "usage": j.get("usageMetadata")}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "candidate": None, "error": _conn_error(e), "usage": None}


def health() -> dict:
    """تست سریع دسترسی به Gemini (برای نشانگر وضعیت). خروجی: {ok, msg, transport}."""
    key = _get_key()
    if not key:
        return {"ok": False, "msg": "کلید Gemini تنظیم نشده است.", "transport": None}
    try:
        r = _request("GET", _MODELS_URL, params={"key": key}, timeout=12)
        if r.status_code == 200:
            mode = "مستقیم (VPN/TUN)" if (_GOOD_TRANSPORT or {}).get("https") is None else "پراکسی"
            return {"ok": True, "msg": f"اتصال Gemini برقرار است — {mode}", "transport": mode}
        return {"ok": False, "msg": _http_error(r), "transport": None}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": _conn_error(e), "transport": None}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print("configured:", is_configured())
    print("models:", list_models()[:5])
    res = ask("در یک جملهٔ کوتاه فارسی بگو «حباب صندوق طلا» یعنی چه.")
    print("ok:", res["ok"])
    print("answer:", res["text"])
