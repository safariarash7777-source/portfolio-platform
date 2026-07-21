"""
کلاینت کامل API «صندوق باز» (ETFbaz)
────────────────────────────────────────────────────────────────────────────
سایت app.etfbaz.com یک SPA (Vue) است که داده‌اش را از API زیر می‌گیرد:
    BASE = https://api.dev.etfbaz.com
این ماژول همهٔ endpointهای عمومی را پوشش می‌دهد تا بتوان هر داده‌ای را
«دید، مانیتور و استخراج» کرد: بازار لحظه‌ای (طلا/ارز/کالا/کریپتو)، فهرست و
جزئیات صندوق‌ها، ترکیب دارایی، تابلوی سفارش، تاریخچهٔ قیمت، حقیقی/حقوقی،
دسته‌بندی‌ها و متریک‌های بازار.

نکته‌ها:
  • endpointهای حساب/پرتفو/آلارم به توکن ورود نیاز دارند (با login(token) ست کن).
  • نگاشت داده از TSETMC است؛ insCodeها همان کدهای رسمی بورس‌اند.
  • چند endpoint سمت سرور dev ناپایدارند (bubble, fund/assets/metrics)؛
    برای حباب از compute_bubble() که از TSETMC می‌خواند استفاده کن.

اجرا برای تست سریع:  python etfbaz.py
"""
from __future__ import annotations

import json
import time
from typing import Any

import pandas as pd
import requests

BASE = "https://api.dev.etfbaz.com"
APP = "https://app.etfbaz.com"

# دستهٔ صندوق‌ها (id → نام) — از خود API استخراج شده
CATEGORIES = {
    "6812": "درآمد ثابت", "6811": "سهامی", "6819": "بخشی", "500": "طلا",
    "6810": "مختلط", "6821": "اهرمی", "230": "شاخصی", "6818": "املاک",
    "600": "نقره", "170": "فراصندوق", "240": "کالایی",
}


class ETFBaz:
    """کلاینت سبک و کامل برای API صندوق باز."""

    def __init__(self, token: str | None = None, timeout: int = 15, retries: int = 2):
        self.timeout = timeout
        self.retries = retries
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": "Mozilla/5.0",
            "Origin": APP,
            "Referer": APP + "/",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
        })
        if token:
            self.login(token)

    # ── ورود (برای endpointهای حساب/پرتفو/آلارم) ──
    def login(self, bearer_token: str) -> None:
        self.s.headers["Authorization"] = (
            bearer_token if bearer_token.lower().startswith("bearer")
            else f"Bearer {bearer_token}")

    # ── هستهٔ درخواست با retry ──
    def _req(self, method: str, path: str, **kw) -> Any:
        url = BASE + path
        last = None
        for _ in range(max(1, self.retries)):
            try:
                r = self.s.request(method, url, timeout=self.timeout, **kw)
                if r.status_code >= 400:
                    last = f"HTTP {r.status_code}: {r.text[:160]}"
                    # خطاهای ۵xx را یک‌بار دیگر تلاش کن، ۴xx را نه
                    if r.status_code < 500:
                        break
                    continue
                ct = r.headers.get("content-type", "")
                return r.json() if "json" in ct else r.text
            except Exception as e:  # noqa: BLE001
                last = f"{type(e).__name__}: {e}"
                time.sleep(0.4)
        raise RuntimeError(f"[etfbaz {method} {path}] {last}")

    def get(self, path: str, **params) -> Any:
        return self._req("GET", path, params=params or None)

    def post(self, path: str, body: dict | None = None) -> Any:
        return self._req("POST", path, json=body or {})

    # ════════════════════════════════════════════════════════════════════════
    # بازار لحظه‌ای
    # ════════════════════════════════════════════════════════════════════════
    def gold(self) -> list:            return self.get("/gold")
    def currency(self) -> list:        return self.get("/currency")
    def commodity(self) -> list:       return self.get("/commodity")
    def crypto(self) -> list:          return self.get("/crypto")
    def energy(self) -> list:          return self.get("/energy")

    # ════════════════════════════════════════════════════════════════════════
    # صندوق‌ها
    # ════════════════════════════════════════════════════════════════════════
    def funds(self) -> list:
        """فهرست همهٔ صندوق‌ها با بازدهٔ دوره‌ای (≈۴۲۱ صندوق)."""
        return self.get("/fund")

    def fund(self, fund_id: int | str) -> dict:
        """جزئیات یک صندوق: instrument + returns + cardSet + فلگ‌ها."""
        return self.get(f"/fund/{fund_id}")

    def fund_asset(self, fund_id: int | str) -> list:
        """ترکیب دارایی صندوق (سهام/اوراق/نقد …)."""
        return self.get(f"/fund/{fund_id}/asset")

    def fund_bubble(self, fund_id: int | str) -> dict:
        """نمودار حباب صندوق (سری‌زمانی). توجه: سمت سرور dev ناپایدار است."""
        return self.post(f"/fund/{fund_id}/bubble")

    def fund_compare(self, fund_ids: list) -> Any:
        return self.post("/fund/compare", {"ids": list(fund_ids)})

    # ════════════════════════════════════════════════════════════════════════
    # نمادها (instrument)
    # ════════════════════════════════════════════════════════════════════════
    def instruments(self) -> list:                 return self.get("/instrument")
    def instrument_details(self, iid) -> dict:     return self.get(f"/instrument/{iid}/details")
    def orderbook(self, iid) -> dict:              return self.get(f"/instrument/{iid}/orderbook")
    def price_history(self, iid) -> list:          return self.get(f"/instrument/{iid}/price/historical")
    def client_type(self, iid) -> dict:            return self.get(f"/instrument/{iid}/clienttype")
    def return_chart(self, iid) -> dict:           return self.get(f"/instrument/{iid}/chart/return")
    def indicators(self, iid) -> dict:             return self.get(f"/instrument/{iid}/indicators")

    def search(self, q: str) -> list:
        """جستجوی نماد/صندوق بر اساس نام یا نماد."""
        return self.get("/instrument/search", q=q)

    # ════════════════════════════════════════════════════════════════════════
    # دسته‌ها و متریک‌های بازار
    # ════════════════════════════════════════════════════════════════════════
    def categories(self) -> list:                  return self.get("/instrument/category")
    def category(self, cid) -> dict:               return self.get(f"/instrument/category/{cid}")
    def category_metrics(self, cid) -> list:       return self.get(f"/instrument/category/{cid}/metrics")
    def category_card_report(self, cid) -> dict:   return self.get(f"/instrument/category/{cid}/card/report")
    def type_metrics(self, type_id: int = 1) -> list:
        return self.get(f"/instrument/type/{type_id}/metrics")

    # ════════════════════════════════════════════════════════════════════════
    # کمک‌ابزارهای استخراج (DataFrame / ذخیره)
    # ════════════════════════════════════════════════════════════════════════
    def funds_df(self, category_id: str | None = None) -> pd.DataFrame:
        """همهٔ صندوق‌ها را به DataFrame تخت تبدیل می‌کند (نماد، نام، دسته، بازده‌ها)."""
        rows = []
        for f in self.funds():
            ins = f.get("instrument", {})
            cat = ins.get("category") or {}
            if category_id and str(cat.get("id")) != str(category_id):
                continue
            ret = f.get("returns") or {}
            rows.append({
                "id": f.get("id"),
                "نماد": ins.get("symbol"),
                "نام": ins.get("name"),
                "دسته": cat.get("name"),
                "insCode": ins.get("insCode"),
                "بازده ۱روز": ret.get("return1d"),
                "بازده ۱هفته": ret.get("return1w"),
                "بازده ۱ماه": ret.get("return1m"),
                "بازده ۳ماه": ret.get("return3m"),
                "بازده ۱سال": ret.get("return1y"),
            })
        return pd.DataFrame(rows)

    def market_df(self, kind: str = "gold") -> pd.DataFrame:
        """بازار لحظه‌ای (gold/currency/commodity/crypto/energy) به DataFrame."""
        data = {"gold": self.gold, "currency": self.currency, "commodity": self.commodity,
                "crypto": self.crypto, "energy": self.energy}[kind]()
        rows = []
        for it in data:
            p = it.get("price") or {}
            rows.append({
                "نماد": it.get("symbol"), "نام": it.get("name"),
                "قیمت": p.get("close"), "باز": p.get("open"),
                "کف": p.get("low"), "سقف": p.get("high"),
                "زمان": p.get("timestamp"),
            })
        return pd.DataFrame(rows)

    def dump_all(self, path: str = "etfbaz_dump.json", with_assets: bool = False) -> str:
        """عکس کاملی از بازار + همهٔ صندوق‌ها را در یک فایل JSON ذخیره می‌کند."""
        snap = {
            "fetched_at": pd.Timestamp.now().isoformat(),
            "market": {k: getattr(self, k)() for k in
                       ["gold", "currency", "commodity", "crypto", "energy"]},
            "funds": self.funds(),
            "categories": CATEGORIES,
        }
        if with_assets:
            snap["assets"] = {}
            for f in snap["funds"]:
                fid = f.get("id")
                try:
                    snap["assets"][fid] = self.fund_asset(fid)
                except Exception:  # noqa: BLE001
                    pass
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(snap, fh, ensure_ascii=False, indent=1)
        return path


def compute_bubble(insCode: str) -> dict:
    """
    حباب جاری یک صندوق ETF را مستقیم از TSETMC حساب می‌کند (مسیر قابل‌اتکا،
    مستقل از endpoint ناپایدار bubble در etfbaz).
    خروجی: {price, nav, bubble_pct} بر حسب ریال.
    """
    import data_sources as ds
    f = ds._tsetmc_fund(insCode)
    nav = f.get("nav")
    mkt = f.get("price") or f.get("close")
    out = {"price": mkt, "nav": nav, "bubble_pct": None}
    if nav and mkt and nav > 0:
        out["bubble_pct"] = (mkt / nav - 1) * 100
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    c = ETFBaz()
    print("● بازار طلا (نمونه):")
    print(c.market_df("gold").head(6).to_string(index=False))
    print("\n● دلار/ارز (نمونه):")
    print(c.market_df("currency").head(4).to_string(index=False))
    funds = c.funds_df()
    print(f"\n● مجموع صندوق‌ها: {len(funds)}")
    print("\n● صندوق‌های اهرمی (دستهٔ ?id=6821):")
    lev = c.funds_df(category_id="6821").sort_values("بازده ۱ماه", ascending=False)
    print(lev.to_string(index=False))
    print("\n● بهترین بازده ۱ماههٔ صندوق‌های طلا:")
    gold = c.funds_df(category_id="500").sort_values("بازده ۱ماه", ascending=False).head(8)
    print(gold[["نماد", "نام", "بازده ۱ماه", "بازده ۱سال"]].to_string(index=False))
