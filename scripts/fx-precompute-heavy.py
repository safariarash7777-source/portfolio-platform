"""پیش‌محاسبهٔ مدل‌های «سنگین» ارز و آپلود نتایج به Supabase (مرحلهٔ ۲ داشبورد ارز).

چرا این اسکریپت؟
    مدل‌های سبک (PPP/پولی/حساسیت/پیش‌بینی نقطه‌ای) در خود سایت به TypeScript
    اجرا می‌شوند (lib/fx/engine.ts). اما آزمون آماری حباب (PSY/GSADF)، نوسان
    (GARCH) و بازهٔ احتمالاتی (مونت‌کارلو) کتابخانهٔ اقتصادسنجی می‌خواهند که فقط
    در پایتون هست. این اسکریپت آن‌ها را «گاه‌به‌گاه» روی PC تو حساب می‌کند و
    نتیجه را در جدول append-only «fx_heavy_analytics» می‌گذارد؛ سایت فقط نمایش
    می‌دهد. PC فقط لحظهٔ اجرا روشن است، نه دائمی.

اصل «بدون اختلال در محاسبات»:
    ورودی دقیقاً همان seedهای سایت است (lib/fx/data/*.json + override احتمالی در
    Supabase). PPP اینجا با engine.ts مو‌به‌مو یکی است (خودآزمون مقابل مقادیر
    طلایی، پایین). دادهٔ ناموجود = null با ذکر دلیل؛ هرگز عدد ساختگی.

اجرا روی PC خودت:
    pip install -r scripts/requirements-fx-heavy.txt
    # .env کنار پروژه: SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...
    python scripts/fx-precompute-heavy.py                 # حساب + درج در Supabase
    python scripts/fx-precompute-heavy.py --emit-json out.json   # فقط حساب (بدون درج)

نکتهٔ فرکانس داده:
    GARCH و PSYِ باتوان به سری «ماهانه/روزانهٔ دلار» نیاز دارند. تا وقتی فقط
    دادهٔ سالانه داری، مونت‌کارلو کامل، PSY سالانهٔ «کم‌توان/نمایه‌ای»، و GARCH
    = null (با دلیل) تولید می‌شود. سری ماهانهٔ دلار را با --usd-csv بده تا
    GARCH و PSYِ ماهانه فعال شوند (ستون‌ها: date,usd_toman).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

import numpy as np

ENGINE_VERSION = "v1"
DEFAULT_MC_SEED = 20260722
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.join(HERE, "..", "lib", "fx", "data")
sys.path.insert(0, HERE)  # تا fx_psy (پورتِ psy.py آرش) قابلِ import باشد

FA_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
             "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


# ─────────────────────────── ابزار عمومی ───────────────────────────
def n0(v) -> float:
    """None/NaN → 0.0 (مطابق n0 در engine.ts)."""
    if v is None:
        return 0.0
    try:
        f = float(v)
        return 0.0 if math.isnan(f) else f
    except (TypeError, ValueError):
        return 0.0


def load_dotenv(path: str) -> None:
    """پارس سادهٔ .env (بدون وابستگی) — فقط اگر فایل باشد."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


def gregorian_to_jalali(gy: int, gm: int, gd: int):
    """میلادی → شمسی (همان الگوریتم lib/fx/jalaliConvert)."""
    gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100
            + (gy2 + 399) // 400 + gd + gdm[gm - 1])
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


def forward_month_labels(start_shamsi: str, n: int):
    """برچسب ماه‌های شمسی رو به جلو از «yyyy/mm» (همان engine.ts)."""
    y0, m0 = (int(x) for x in start_shamsi.split("/")[:2])
    labels = []
    for i in range(1, n + 1):
        total = (m0 - 1) + i
        y = y0 + total // 12
        m = (total % 12) + 1
        labels.append(f"{FA_MONTHS[m - 1]} {y}")
    return labels


# ─────────────────────────── منبع داده ───────────────────────────
def supabase_headers(key: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}


def supabase_get(url: str, key: str, path: str):
    req = urllib.request.Request(f"{url}/rest/v1/{path}", headers=supabase_headers(key))
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"  ⚠ خواندن Supabase ({path}) ناموفق: {e} — از seed ریپو استفاده می‌شود.", file=sys.stderr)
        return None


def load_repo_json(data_dir: str, name: str):
    with open(os.path.join(data_dir, name), encoding="utf-8") as f:
        return json.load(f)


def resolve_seeds(data_dir: str, url: str | None, key: str | None):
    """seedها = JSON ریپو، با override احتمالی از Supabase (دقیقاً مثل dataLoader)."""
    macro = load_repo_json(data_dir, "macro_annual.json")
    base_rates = load_repo_json(data_dir, "base_rates.json")
    src = "repo"
    if url and key:
        rows = supabase_get(url, key,
                            "ir_market_snapshots?key=in.(fx_seed_macro_annual,fx_seed_base_rates)&select=key,payload")
        if rows:
            for r in rows:
                payload = r.get("payload") or {}
                if r.get("key") == "fx_seed_macro_annual" and payload.get("rows"):
                    macro = payload["rows"]; src = "supabase-override"
                elif r.get("key") == "fx_seed_base_rates" and payload.get("rows"):
                    base_rates = payload["rows"]; src = "supabase-override"
    return macro, base_rates, src


def latest_fx_rate(url: str | None, key: str | None):
    """آخرین نرخ زندهٔ دلار از fx_rates (میلادی). → (usd_toman, 'YYYY-MM-DD') یا None."""
    if not (url and key):
        return None
    rows = supabase_get(url, key, "fx_rates?select=usd_toman,rate_date&order=rate_date.desc&limit=1")
    if rows and rows[0].get("usd_toman"):
        return float(rows[0]["usd_toman"]), str(rows[0]["rate_date"])
    return None


# ─────────────────────── PPP (پورت مو‌به‌موی engine.ts) ───────────────────────
def ppp_series(rows, base_year: int, base_rate: float) -> dict:
    out = {base_year: base_rate}
    rate = base_rate
    for r in sorted(rows, key=lambda x: x["year_shamsi"]):
        if r["year_shamsi"] <= base_year:
            continue
        rate *= (1 + n0(r.get("infl_cbi")) / 100) / (1 + n0(r.get("usa_infl")) / 100)
        out[r["year_shamsi"]] = rate
    return out


def ppp_multi_base(rows, bases: dict) -> dict:
    indiv = {by: ppp_series(rows, by, br) for by, br in bases.items()}
    years = sorted({y for m in indiv.values() for y in m})
    mean = {}
    for y in years:
        vals = [m[y] for m in indiv.values() if y in m and m[y] > 0]
        if vals:
            mean[y] = math.exp(sum(math.log(v) for v in vals) / len(vals))
    return mean


def self_check_ppp(macro, base_rates):
    """خودآزمون: PPP پایتون باید با مقادیر طلایی engine.test.ts یکی باشد."""
    try:
        s = ppp_series(macro, 1381, float(base_rates["1381"]))
        assert abs(s.get(1404, 0) - 70639.94884) / 70639.94884 < 1e-6
        bases = {1381: float(base_rates["1381"]), 1390: float(base_rates["1390"]),
                 1396: float(base_rates["1396"])}
        m = ppp_multi_base(macro, bases)
        assert abs(m.get(1404, 0) - 51823.181633) / 51823.181633 < 1e-6
        return True
    except (AssertionError, KeyError, ZeroDivisionError):
        return False


# ─────────────────────────── PSY / GSADF ───────────────────────────
def adf_tstat(y: np.ndarray, lag: int = 0) -> float:
    """t-آمارهٔ ضریب y_{t-1} در رگرسیون ADF راست‌دُم (Phillips–Shi–Yu)."""
    y = np.asarray(y, float)
    dy = np.diff(y)
    if len(dy) - lag < lag + 4:
        return np.nan
    if lag == 0:
        # مسیرِ سریعِ بسته برای رگرسیونِ سادهٔ Δy ~ 1 + y_{t-1} (عددِ یکسان با lstsq)
        x = y[:-1]
        dep0 = dy
        n = len(dep0)
        sx = x.sum(); sy = dep0.sum()
        denom = n * (x * x).sum() - sx * sx
        if denom == 0:
            return np.nan
        b = (n * (x * dep0).sum() - sx * sy) / denom
        a = (sy - b * sx) / n
        resid = dep0 - a - b * x
        dof = n - 2
        if dof <= 0:
            return np.nan
        s2 = float(resid @ resid) / dof
        var_b = s2 * n / denom
        return float(b / math.sqrt(var_b)) if var_b > 0 else np.nan
    dep = dy[lag:]
    cols = [np.ones(len(dep)), y[lag:-1]]
    for i in range(1, lag + 1):
        cols.append(dy[lag - i:-i])
    X = np.column_stack(cols)
    try:
        beta, *_ = np.linalg.lstsq(X, dep, rcond=None)
    except np.linalg.LinAlgError:
        return np.nan
    resid = dep - X @ beta
    dof = len(dep) - X.shape[1]
    if dof <= 0:
        return np.nan
    s2 = float(resid @ resid) / dof
    try:
        xtxinv = np.linalg.inv(X.T @ X)
    except np.linalg.LinAlgError:
        return np.nan
    var_b1 = s2 * xtxinv[1, 1]
    if var_b1 <= 0:
        return np.nan
    return float(beta[1] / math.sqrt(var_b1))


def sadf_gsadf(y: np.ndarray, r0: float, lag: int = 0):
    """SADF (پنجرهٔ گسترشی) و GSADF (پنجرهٔ متحرک تعمیم‌یافته)."""
    T = len(y)
    minw = max(int(math.floor(r0 * T)), lag + 4)
    if T < minw:
        return np.nan, np.nan
    sadf = -np.inf
    gsadf = -np.inf
    for r2 in range(minw, T + 1):
        # SADF: شروع ثابت از ۰
        t0 = adf_tstat(y[0:r2], lag)
        if np.isfinite(t0):
            sadf = max(sadf, t0)
        # GSADF: sup روی همهٔ شروع‌های ممکن
        for r1 in range(0, r2 - minw + 1):
            t = adf_tstat(y[r1:r2], lag)
            if np.isfinite(t):
                gsadf = max(gsadf, t)
    return (sadf if np.isfinite(sadf) else np.nan,
            gsadf if np.isfinite(gsadf) else np.nan)


def simulate_gsadf_crit(T: int, r0: float, lag: int, reps: int, seed: int):
    """مقادیر بحرانیِ متناهی‌نمونهٔ GSADF زیر H0 (گشت تصادفی) — seed پین‌شده."""
    rng = np.random.default_rng(seed)
    stats = np.empty(reps)
    for i in range(reps):
        y = np.cumsum(rng.standard_normal(T))
        _, g = sadf_gsadf(y, r0, lag)
        stats[i] = g
    stats = stats[np.isfinite(stats)]
    if len(stats) < reps // 2:
        return None
    return {"90": float(np.percentile(stats, 90)),
            "95": float(np.percentile(stats, 95)),
            "99": float(np.percentile(stats, 99))}


def build_monthly_ppp(ppp_annual: dict, months: list) -> dict:
    """PPP ماهانه با درون‌یابیِ لگاریتمیِ PPP سالانه (هم‌فرکانس با دلارِ ماهانه)."""
    out = {}
    for ym in months:
        y, m = int(ym[:4]), int(ym[5:7])
        if y not in ppp_annual:
            continue
        p0 = ppp_annual[y]
        p1 = ppp_annual.get(y + 1, p0)
        if p0 > 0 and p1 > 0:
            out[ym] = p0 * (p1 / p0) ** ((m - 1) / 12)
    return out


def run_psy_fundamental(market_map: dict, ppp_map: dict, freq: str, series_name: str,
                        seed: int, n_sim: int = 299):
    """آزمون حباب PSY روی «نسبتِ بازار به PPP» — پورتِ مستقیمِ psy.py آرش
    (misalignment_target + انتخابِ وقفه با BIC + مقدار بحرانیِ دنباله‌ای)."""
    import pandas as pd
    import fx_psy
    idx = sorted(set(market_map) & set(ppp_map))
    if len(idx) < 20:
        return {"available": False, "frequency": freq, "series": series_name,
                "reason": f"هم‌پوشانیِ ناکافیِ بازار/فاندامنتال (n={len(idx)})."}
    mk = pd.Series({k: market_map[k] for k in idx})
    fd = pd.Series({k: ppp_map[k] for k in idx})
    try:
        target = fx_psy.misalignment_target(mk, fd, how="log_ratio")
        res = fx_psy.psy_test(target, n_sim=n_sim, seed=seed)
    except Exception as e:  # noqa: BLE001
        return {"available": False, "frequency": freq, "series": series_name,
                "reason": f"خطا در PSY: {e}"}
    tab = res.table
    labels = [str(x) for x in target.index]
    bsadf = []
    for i, lab in enumerate(labels):
        b = tab["bsadf"].iloc[i]
        c = tab["cv95"].iloc[i]
        if np.isfinite(b):
            bsadf.append({"m": lab, "b": round(float(b), 4),
                          "cv": round(float(c), 4) if np.isfinite(c) else None})
    exploded = [labels[i] for i in range(len(labels)) if bool(tab["is_explosive"].iloc[i])]
    cv95 = float(res.gsadf_cv.get(0.95, float("nan")))
    verdict = ("شواهدِ رفتارِ انفجاری (حباب فراتر از فاندامنتال) در سطحِ ۵٪ رد نمی‌شود"
               if res.significant else
               "فرضِ نبودِ حباب (فراتر از فاندامنتال) در سطحِ ۵٪ رد نمی‌شود")
    return {
        "available": True,
        "frequency": freq,
        "series": series_name,
        "n_obs": int(target.size),
        "lag": int(res.k),
        "r0": round(float(res.r0), 4),
        "min_window": int(res.min_window),
        "gsadf_stat": None if not np.isfinite(res.gsadf) else round(float(res.gsadf), 4),
        "gsadf_cv95": None if not np.isfinite(cv95) else round(cv95, 4),
        "gsadf_pvalue": round(float(res.gsadf_pvalue), 4),
        "sim_reps": int(res.n_sim),
        "seed": int(res.seed),
        "verdict": verdict,
        "bsadf": bsadf,
        "explosive_months": exploded,
        "note": ("آزمون روی نسبتِ بازار به PPP (نه نرخِ اسمی)؛ وقفه با BIC انتخاب شده. "
                 "عددِ بزرگ عمدتاً از جهشِ سطحِ گذشته (مثلاً ۱۳۹۷) می‌آید، نه لزوماً وضعیتِ جاری."),
    }


# ─────────────────────────── مونت‌کارلو ───────────────────────────
def run_montecarlo(start_rate: float, start_shamsi: str, horizon: int,
                   infl_iran: float, infl_usa: float, annual_vol: float,
                   vol_source: str, n_sims: int, seed: int):
    """شبیه‌سازی مسیر لگ‌نرمالِ دلار: دریفت = PPP، نوسان = فرض/برآورد. seed پین‌شده."""
    mu_month = math.log((1 + infl_iran / 100) / (1 + infl_usa / 100)) / 12  # دریفت لگاریتمی ماهانه
    sigma_month = annual_vol / math.sqrt(12)
    rng = np.random.default_rng(seed)
    shocks = rng.normal(mu_month, sigma_month, size=(n_sims, horizon))
    log_paths = np.log(start_rate) + np.cumsum(shocks, axis=1)
    paths = np.exp(log_paths)
    labels = forward_month_labels(start_shamsi, horizon)
    return {
        "available": True,
        "start_rate": round(start_rate, 1),
        "start_date_shamsi": start_shamsi,
        "horizon_months": horizon,
        "n_sims": n_sims,
        "seed": seed,
        "months": labels,
        "p05": [round(float(x), 1) for x in np.percentile(paths, 5, axis=0)],
        "p50": [round(float(x), 1) for x in np.percentile(paths, 50, axis=0)],
        "p95": [round(float(x), 1) for x in np.percentile(paths, 95, axis=0)],
        "assumptions": {
            "drift_model": "PPP (تفاوتِ تورمِ ایران و آمریکا)",
            "infl_iran_annual": infl_iran,
            "infl_usa_annual": infl_usa,
            "annual_vol": annual_vol,
            "vol_source": vol_source,  # 'assumed' یا 'estimated'
        },
        "note": ("بازهٔ احتمالاتی مشروط بر فروضِ بالاست، نه پیش‌بینیِ قطعی. "
                 "نوسان «فرضی» است چون سری ماهانهٔ دلار موجود نیست." if vol_source == "assumed"
                 else "بازهٔ احتمالاتی مشروط بر فروضِ بالاست، نه پیش‌بینیِ قطعی."),
    }


# ─────────────────────────── GARCH (مشروط به داده) ───────────────────────────
def run_garch(usd_monthly: list | None):
    """GARCH(1,1) فقط اگر سری ماهانه/روزانهٔ دلار با ≥۶۰ مشاهده باشد؛ وگرنه null+دلیل."""
    if not usd_monthly or len(usd_monthly) < 60:
        have = 0 if not usd_monthly else len(usd_monthly)
        return {"available": False,
                "reason": (f"GARCH به سریِ ماهانه/روزانهٔ دلار با حداقل ۶۰ مشاهده نیاز دارد "
                           f"(اکنون: {have}). سری را با --usd-csv بده تا فعال شود."),
                "n_obs": have}
    try:
        from arch import arch_model
    except ImportError:
        return {"available": False, "reason": "کتابخانهٔ arch نصب نیست (pip install arch)."}
    prices = np.array([r["usd_toman"] for r in usd_monthly], float)
    rets = np.diff(np.log(prices)) * 100  # درصد بازده لگاریتمی
    am = arch_model(rets, mean="Constant", vol="GARCH", p=1, q=1, dist="normal")
    res = am.fit(disp="off")
    p = res.params
    omega, alpha, beta = float(p["omega"]), float(p["alpha[1]"]), float(p["beta[1]"])
    persistence = alpha + beta
    uncond_var = omega / (1 - persistence) if persistence < 1 else float("nan")
    cond_vol_month = abs(float(res.conditional_volatility[-1]))
    near_igarch = persistence >= 0.99
    note = "نوسانِ برآوردی از دادهٔ واقعی؛ خوشه‌بندیِ واریانس مدل‌سازی شده."
    if near_igarch:
        note += " پایداریِ بالا (نزدیک به IGARCH): واریانسِ بلندمدت تعریف‌نشده؛ نوسانِ جاری گزارش می‌شود."
    return {
        "available": True,
        "n_obs": len(rets),
        "omega": round(omega, 6),
        "alpha": round(alpha, 6),
        "beta": round(beta, 6),
        "persistence": round(persistence, 6),
        # واریانسِ بلندمدت (تنها اگر پایداری<۱ متناهی است)
        "annualized_vol_pct": None if (math.isnan(uncond_var) or uncond_var <= 0) else round(math.sqrt(uncond_var) * math.sqrt(12), 4),
        # نوسانِ جاری (همیشه تعریف‌شده): σ_ماهانهٔ آخر × √۱۲
        "current_cond_vol_pct": round(cond_vol_month, 4),
        "current_cond_vol_annual_pct": round(cond_vol_month * math.sqrt(12), 4),
        "loglik": round(float(res.loglikelihood), 4),
        "dist": "normal",
        "note": note,
    }


# ─────────────────────────── هم‌جمعی (Engle–Granger) ───────────────────────────
def run_cointegration(market: dict, ppp: dict):
    years = sorted(set(market) & set(ppp))
    pairs = [(market[y], ppp[y]) for y in years if market[y] > 0 and ppp[y] > 0]
    if len(pairs) < 12:
        return {"available": False, "reason": f"نمونهٔ ناکافی (n={len(pairs)})."}
    try:
        from statsmodels.tsa.stattools import coint
    except ImportError:
        return {"available": False, "reason": "statsmodels نصب نیست."}
    m = np.log([p[0] for p in pairs])
    f = np.log([p[1] for p in pairs])
    tstat, pvalue, _ = coint(m, f)
    return {
        "available": True,
        "method": "Engle–Granger (log بازار ~ log PPP)",
        "n_obs": len(pairs),
        "tstat": round(float(tstat), 4),
        "pvalue": round(float(pvalue), 4),
        "verdict": ("رابطهٔ بلندمدتِ PPP در سطحِ ۵٪ رد نمی‌شود (هم‌جمعی)"
                    if pvalue < 0.05 else "شواهدِ هم‌جمعیِ PPP در سطحِ ۵٪ کافی نیست"),
        "note": "دادهٔ سالانه — نتیجه نمایه‌ای.",
    }


# ─────────────────────────── main ───────────────────────────
def main():
    ap = argparse.ArgumentParser(description="پیش‌محاسبهٔ مدل‌های سنگین ارز → Supabase")
    ap.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="پوشهٔ seedهای JSON (پیش‌فرض lib/fx/data)")
    ap.add_argument("--usd-csv", help="سری ماهانه/روزانهٔ دلار (ستون‌ها: date,usd_toman) — GARCH/PSYِ ماهانه را فعال می‌کند")
    ap.add_argument("--horizon", type=int, default=12, help="افق مونت‌کارلو (ماه)")
    ap.add_argument("--mc-annual-vol", type=float, default=0.25, help="نوسانِ سالانهٔ فرضیِ مونت‌کارلو (اگر سری دلار نباشد)")
    ap.add_argument("--mc-sims", type=int, default=10000, help="تعداد مسیرهای مونت‌کارلو")
    ap.add_argument("--mc-seed", type=int, default=DEFAULT_MC_SEED, help="seed پین‌شده (بازتولیدپذیری)")
    ap.add_argument("--psy-reps", type=int, default=499, help="تعداد شبیه‌سازی مقادیر بحرانی PSY")
    ap.add_argument("--start-rate", type=float, help="نرخِ شروعِ مونت‌کارلو (اگر خواندنِ زندهٔ fx_rates ممکن نباشد)")
    ap.add_argument("--start-shamsi", help="تاریخِ شمسیِ شروع «yyyy/mm» (همراه --start-rate)")
    ap.add_argument("--emit-json", help="فقط حساب و نوشتن نتیجه در این فایل (بدون درج در Supabase)")
    ap.add_argument("--env", default=os.path.join(HERE, "..", ".env"), help="مسیر .env")
    args = ap.parse_args()

    load_dotenv(args.env)
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    read_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                or os.environ.get("SUPABASE_ANON_KEY")
                or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    print("• خواندن seedها …")
    macro, base_rates, src = resolve_seeds(args.data_dir, url, read_key)
    print(f"  منبع دادهٔ کلان: {src} | {len(macro)} سال")

    if not self_check_ppp(macro, base_rates):
        sys.exit("✗ خودآزمونِ PPP با مقادیر طلاییِ engine.ts نخورد — دادهٔ ورودی مشکوک است. متوقف شد (بدونِ عددِ ساختگی).")
    print("  ✓ خودآزمونِ PPP با engine.ts هم‌تراز است.")

    # سری‌های سالانه
    bases = {y: float(base_rates[str(y)]) for y in (1381, 1390, 1396) if str(y) in base_rates}
    ppp = ppp_multi_base(macro, bases)
    market = {int(y): float(r) for y, r in base_rates.items() if float(r) > 0}
    ratio_years = sorted(y for y in ppp if y in market and ppp[y] > 0)
    ratio_vals = np.array([market[y] / ppp[y] for y in ratio_years], float)
    as_of_year = max(market) if market else None

    # سری ماهانهٔ دلار (اختیاری) → GARCH و PSYِ ماهانه
    usd_monthly = None
    if args.usd_csv:
        import csv
        with open(args.usd_csv, encoding="utf-8") as f:
            usd_monthly = [{"date": row["date"], "usd_toman": float(row["usd_toman"])}
                           for row in csv.DictReader(f) if row.get("usd_toman")]
        print(f"  سری ماهانهٔ دلار: {len(usd_monthly)} مشاهده")

    # نرخ زندهٔ شروعِ مونت‌کارلو
    live = latest_fx_rate(url, read_key)
    if live:
        start_rate, gdate = live
        gy, gm, gd = (int(x) for x in gdate.split("-"))
        jy, jm, jd = gregorian_to_jalali(gy, gm, gd)
        start_shamsi = f"{jy}/{jm:02d}"
    else:
        start_rate = float(market[as_of_year])
        start_shamsi = f"{as_of_year}/01"
    if args.start_rate:  # override دستی (وقتی خواندنِ زنده ممکن نیست)
        start_rate = args.start_rate
        start_shamsi = args.start_shamsi or start_shamsi
    print(f"  نقطهٔ شروعِ مونت‌کارلو: {start_rate:.0f} تومان ({start_shamsi})")

    infl_iran = n0(macro[-1].get("infl_cbi")) or 40.0
    infl_usa = n0(macro[-1].get("usa_infl")) or 3.0

    # نوسان: از سری ماهانه برآورد شود اگر باشد، وگرنه فرضی
    if usd_monthly and len(usd_monthly) >= 24:
        rets = np.diff(np.log([r["usd_toman"] for r in usd_monthly]))
        annual_vol = float(np.std(rets, ddof=1) * math.sqrt(12))
        vol_source = "estimated"
    else:
        annual_vol = args.mc_annual_vol
        vol_source = "assumed"

    print("• PSY/GSADF (نسبتِ بازار/PPP) …")
    if usd_monthly and len(usd_monthly) >= 40:
        months = [r["date"] for r in usd_monthly]  # «yyyy/mm»
        market_m = {r["date"]: r["usd_toman"] for r in usd_monthly}
        ppp_m = build_monthly_ppp(ppp, months)
        psy = run_psy_fundamental(market_m, ppp_m, "monthly", "log(بازار ÷ PPP) ماهانه", args.mc_seed)
    else:
        psy = run_psy_fundamental({y: market[y] for y in ratio_years},
                                  {y: ppp[y] for y in ratio_years},
                                  "annual", "log(بازار ÷ PPP) سالانه", args.mc_seed)

    print("• GARCH …")
    garch = run_garch(usd_monthly)
    print("• مونت‌کارلو …")
    mc = run_montecarlo(start_rate, start_shamsi, args.horizon, infl_iran, infl_usa,
                        annual_vol, vol_source, args.mc_sims, args.mc_seed)
    print("• هم‌جمعی …")
    coint_res = run_cointegration(market, ppp)

    warnings = []
    if not garch.get("available"):
        warnings.append("GARCH: " + garch.get("reason", ""))
    if psy.get("frequency") == "annual":
        warnings.append("PSY روی دادهٔ سالانه اجرا شد (کم‌توان). برای نتیجهٔ معتبر سریِ ماهانهٔ دلار بده.")

    lib_versions = {"numpy": np.__version__}
    for mod in ("scipy", "statsmodels", "arch"):
        try:
            lib_versions[mod] = __import__(mod).__version__
        except ImportError:
            lib_versions[mod] = None

    row = {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": (f"{max(m['year_miladi'] for m in macro if m.get('year_miladi'))}-12-31"
                       if any(m.get("year_miladi") for m in macro) else None),
        "data_range": f"{min(market)}..{max(market)} (سالانه) · نسبت: {len(ratio_years)} سال",
        "frequency": psy.get("frequency", "annual"),
        "n_obs": psy.get("n_obs"),
        "engine_version": ENGINE_VERSION,
        "mc_seed": args.mc_seed,
        "lib_versions": lib_versions,
        "results": {
            "psy": psy, "garch": garch, "montecarlo": mc,
            "cointegration": coint_res, "warnings": warnings,
        },
        "created_by": "pc-script",
        "notes": None,
    }

    if args.emit_json:
        with open(args.emit_json, "w", encoding="utf-8") as f:
            json.dump(row, f, ensure_ascii=False, indent=2)
        print(f"✓ نتیجه در {args.emit_json} نوشته شد (بدونِ درج در Supabase).")
        _print_summary(row)
        return

    if not (url and service_key):
        sys.exit("✗ برای درج به SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY نیاز است "
                 "(در .env). یا از --emit-json برای تست بدونِ درج استفاده کن.")

    data = json.dumps(row, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/fx_heavy_analytics", data=data, method="POST",
        headers={**supabase_headers(service_key), "Content-Type": "application/json",
                 "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"✓ درج شد در fx_heavy_analytics (HTTP {resp.status}).")
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ درج ناموفق: HTTP {e.code} — {e.read().decode('utf-8', 'ignore')}")
    _print_summary(row)


def _print_summary(row):
    r = row["results"]
    print("\n──────── خلاصه ────────")
    print(f"as_of: {row['as_of_date']} | فرکانس: {row['frequency']} | n={row['n_obs']}")
    if r["psy"].get("available"):
        print(f"PSY GSADF={r['psy'].get('gsadf_stat')} crit95={r['psy'].get('gsadf_cv95')} p={r['psy'].get('gsadf_pvalue')} k={r['psy'].get('lag')} → {r['psy'].get('verdict')}")
    else:
        print(f"PSY: — ({r['psy'].get('reason')})")
    if r["garch"].get("available"):
        print(f"GARCH persistence={r['garch']['persistence']} vol‌سالانه={r['garch']['annualized_vol_pct']}%")
    else:
        print(f"GARCH: null — {r['garch'].get('reason')}")
    mc = r["montecarlo"]
    print(f"MC افق {mc['horizon_months']}م: p50[آخر]={mc['p50'][-1]:.0f} | p05={mc['p05'][-1]:.0f} p95={mc['p95'][-1]:.0f} (نوسان {mc['assumptions']['vol_source']})")
    if r["cointegration"].get("available"):
        print(f"هم‌جمعی: p={r['cointegration']['pvalue']} → {r['cointegration']['verdict']}")


if __name__ == "__main__":
    main()
