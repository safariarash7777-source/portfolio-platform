"""
اعتبارسنجی گذشته‌نگر (Walk-Forward Backtest) برای مدل‌های ارزش‌گذاری نرخ ارز.

اصل کلیدی (No Look-ahead):
  در هر گام t، مدل فقط با داده تا t−1 برآورد می‌شود. پیش‌بینی t با واقعیت
  بازار در t مقایسه می‌شود.

معیارها:
  RMSE, MAE, MAPE, Theil's U
  Theil's U > 1 ⇒ مدل بدتر از قدم‌زنی تصادفی (Random Walk).
  در FX، شکست مدل‌های ساختاری در برابر RW (Meese–Rogoff 1983) امری شناخته‌شده است.
"""
import numpy as np
import pandas as pd

import models as m
import data_sources as ds
import econometrics as ec


# ────────────────────────────────────────────────────────────────────────────
# معیارهای ارزیابی
# ────────────────────────────────────────────────────────────────────────────
def rmse(y_true, y_pred):
    e = np.asarray(y_true) - np.asarray(y_pred)
    return float(np.sqrt(np.mean(e ** 2)))


def mae(y_true, y_pred):
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def mape(y_true, y_pred):
    y = np.asarray(y_true, dtype=float)
    p = np.asarray(y_pred, dtype=float)
    mask = y != 0
    if mask.sum() == 0:
        return np.nan
    return float(np.mean(np.abs((y[mask] - p[mask]) / y[mask])) * 100)


def theils_u(y_true, y_pred, y_naive):
    """
    Theil's U vs Random Walk:
      U = sqrt(mean((y - p)^2)) / sqrt(mean((y - rw)^2))
      U < 1 ⇒ مدل بهتر از RW
    """
    num = rmse(y_true, y_pred)
    den = rmse(y_true, y_naive)
    return float(num / den) if den > 0 else np.nan


# ────────────────────────────────────────────────────────────────────────────
# Walk-Forward
# ────────────────────────────────────────────────────────────────────────────
def walk_forward(df: pd.DataFrame,
                 market: pd.Series,
                 model_name: str,
                 start_year: int,
                 end_year: int = None,
                 lookback: int = 1) -> pd.DataFrame:
    """
    برای هر سال t در [start_year, end_year]:
      - مدل با سال پایه = اولین سال قابل برآورد (یا start_year-5) و داده تا t−1 برآورد می‌شود
      - مقدار مدل در سال t با نرخ بازار سال t مقایسه می‌شود

    Args:
        df: داده سالانه (year_shamsi, infl_*, m2_*, gdp_*)
        market: نرخ بازار سالانه (شاخص = year_shamsi)
        model_name: 'ppp' | 'monetary_basic' | 'monetary_velocity' | 'frenkel_bilson'
        start_year, end_year: بازه ارزیابی

    Returns:
        DataFrame(year, actual, predicted, naive_rw)
    """
    end_year = end_year or int(market.index.max())
    years_eval = [y for y in range(start_year, end_year + 1) if y in market.index]
    rows = []

    for t in years_eval:
        # سال پایه: لنگر غلتان نزدیک (t − lookback) به‌جای قدیمی‌ترین سال.
        # استفاده از قدیمی‌ترین سال (۱۳۳۸) باعث انباشت ۶۰+ سال خطای تجمعی می‌شد
        # و Theil's U را به‌طور کاذب بالای ۱ می‌برد (مدل بدتر از RW جلوه می‌کرد).
        # لنگر نزدیک، آزمون واقع‌گرایانه‌ی توان پیش‌بینی یک‌قدم‌جلوتر است.
        candidate_bases = [y for y in market.index if y < t]
        if not candidate_bases:
            continue
        base_year = max(candidate_bases) - (lookback - 1)
        if base_year not in market.index:
            base_year = max(candidate_bases)  # fallback: نزدیک‌ترین
        base_rate = float(market.loc[base_year])

        # فقط داده تا t-1 برای جلوگیری از look-ahead
        df_train = df[df["year_shamsi"] <= t - 1]
        if df_train.empty:
            continue
        # اضافه کردن سطر سال t با همان مقادیر t-1 برای انباشت (تخمین آینده‌نگر)
        last_row = df[df["year_shamsi"] == t]
        if last_row.empty:
            continue
        df_eval = pd.concat([df_train, last_row], ignore_index=True)

        try:
            if model_name == "ppp":
                series = m.ppp_series(df_eval, base_year, base_rate)
            elif model_name == "monetary_basic":
                series = m.monetary_series(df_eval, base_year, base_rate)
            elif model_name == "monetary_velocity":
                series = m.monetary_velocity_series(df_eval, base_year, base_rate, delta_v_pct=0)
            elif model_name == "frenkel_bilson":
                series = m.frenkel_bilson_series(df_eval, base_year, base_rate)
            elif model_name == "ecm":
                # ECM پویای واقعی، بدون look-ahead:
                # ضرایب فقط با داده تا t-1 برآورد می‌شوند؛ پیش‌بینی t از
                # u_{t-1} و Δx_t ساخته می‌شود (نرخ بازار سال t استفاده نمی‌شود).
                frame_all = ds.cointegration_inputs(df_eval, market)
                frame_train = frame_all[frame_all.index <= t - 1]
                xs = [c for c in ("ln_m2_ir", "ln_gdp_ir", "ln_oil")
                      if c in frame_train.columns]
                ecm = ec.ecm_fit(frame_train, "ln_E", xs)
                pred = ec.ecm_one_step(ecm, frame_all, t)
                series = None
            else:
                continue
            if series is not None:
                pred = float(series.get(t, np.nan))
        except Exception:  # noqa: BLE001
            pred = np.nan

        # Random walk naive: نرخ سال قبل
        prev_years = [y for y in market.index if y < t]
        naive = float(market.loc[max(prev_years)]) if prev_years else np.nan

        rows.append({
            "year": t,
            "actual": float(market.loc[t]),
            "predicted": pred,
            "naive_rw": naive,
        })
    return pd.DataFrame(rows)


def summarize(bt: pd.DataFrame) -> dict:
    """خلاصه معیارها روی نتایج walk-forward."""
    bt = bt.dropna(subset=["actual", "predicted", "naive_rw"])
    if bt.empty:
        return {"n": 0}
    return {
        "n": len(bt),
        "RMSE": rmse(bt["actual"], bt["predicted"]),
        "MAE": mae(bt["actual"], bt["predicted"]),
        "MAPE_%": mape(bt["actual"], bt["predicted"]),
        "Theils_U": theils_u(bt["actual"], bt["predicted"], bt["naive_rw"]),
        "Naive_RMSE": rmse(bt["actual"], bt["naive_rw"]),
    }


def diebold_mariano(bt: pd.DataFrame, h: int = 1, loss: str = "squared") -> dict:
    """
    آزمون Diebold–Mariano (1995) با تصحیح نمونه‌کوچکِ Harvey–Leybourne–Newbold (1997).

    آیا دقتِ پیش‌بینیِ «مدل» با «قدم‌زنی تصادفی (RW)» تفاوتِ معنادار دارد؟
    تفاضلِ زیان d_t = L(e_model) − L(e_rw)؛ زیان مربعی پیش‌فرض است.

    H0: دقتِ برابر (E[d]=0).  dbar<0 ⇒ مدل بهتر؛ dbar>0 ⇒ RW بهتر.
    آمارهٔ DM* با ضریبِ HLN تصحیح و با توزیع t (df=n−1) سنجیده می‌شود.

    خروجی: dict شامل ok, n, dm (آمارهٔ تصحیح‌شده), p (دوطرفه),
            mse_model, mse_rw, better ∈ {model, rw, tie}.
    گریس‌فول: اگر n<4 یا واریانس صفر باشد، ok=False برمی‌گرداند.
    """
    b = bt.dropna(subset=["actual", "predicted", "naive_rw"])
    n = len(b)
    if n < 4:
        return {"ok": False, "n": n, "reason": "نمونهٔ ناکافی (n<4)"}
    e_m = (b["actual"].to_numpy(float) - b["predicted"].to_numpy(float))
    e_n = (b["actual"].to_numpy(float) - b["naive_rw"].to_numpy(float))
    if loss == "absolute":
        d = np.abs(e_m) - np.abs(e_n)
    else:  # squared (پیش‌فرض)
        d = e_m ** 2 - e_n ** 2
    dbar = float(d.mean())
    h = max(1, int(h))
    # واریانس بلندمدت با (h−1) خودهم‌بستگی (پنجرهٔ مستطیلیِ DM اصلی)
    gamma0 = float(np.mean((d - dbar) ** 2))
    lrv = gamma0
    for k in range(1, h):
        if k < n:
            cov = float(np.mean((d[k:] - dbar) * (d[:-k] - dbar)))
            lrv += 2 * cov
    if lrv <= 0:
        lrv = gamma0
    if lrv <= 0:
        return {"ok": False, "n": n, "reason": "واریانسِ صفر در تفاضلِ زیان"}
    dm = dbar / np.sqrt(lrv / n)
    # تصحیح HLN + توزیع t
    factor = np.sqrt(max((n + 1 - 2 * h + h * (h - 1) / n) / n, 1e-9))
    dm_star = float(dm * factor)
    try:
        from scipy import stats
        p = float(2 * (1 - stats.t.cdf(abs(dm_star), df=n - 1)))
    except Exception:  # noqa: BLE001 — در نبود scipy، تقریبِ نرمال
        from math import erf, sqrt
        p = float(2 * (1 - 0.5 * (1 + erf(abs(dm_star) / sqrt(2)))))
    better = "model" if (dbar < 0 and p < 0.10) else ("rw" if (dbar > 0 and p < 0.10) else "tie")
    return {"ok": True, "n": n, "dm": dm_star, "p": p,
            "mse_model": float(np.mean(e_m ** 2)), "mse_rw": float(np.mean(e_n ** 2)),
            "better": better}


def compare_models(df: pd.DataFrame, market: pd.Series,
                   start_year: int, end_year: int = None,
                   models_list=("ppp", "monetary_basic", "monetary_velocity"),
                   lookback: int = 1) -> pd.DataFrame:
    """ماتریس مقایسه چند مدل با معیارهای استاندارد."""
    rows = []
    for name in models_list:
        bt = walk_forward(df, market, name, start_year, end_year, lookback=lookback)
        s = summarize(bt)
        dm = diebold_mariano(bt, h=lookback)          # آزمونِ معناداریِ برتری نسبت به RW
        s["DM_stat"] = dm.get("dm") if dm.get("ok") else np.nan
        s["DM_p"] = dm.get("p") if dm.get("ok") else np.nan
        s["مدل"] = m.MODEL_INFO.get(name, {}).get("name", name)
        s["_key"] = name
        rows.append(s)
    out = pd.DataFrame(rows)
    cols = ["مدل", "n", "RMSE", "MAE", "MAPE_%", "Theils_U", "DM_stat", "DM_p", "Naive_RMSE", "_key"]
    return out[[c for c in cols if c in out.columns]]


def regime_split(bt: pd.DataFrame, split_year: int = 1397) -> dict:
    """
    تقسیم نتایج به دو رژیم: پیش از شوک (تا split_year-1) و پس از شوک.
    در ایران، ۱۳۹۷ گسست اصلی است.
    """
    pre = bt[bt["year"] < split_year]
    post = bt[bt["year"] >= split_year]
    return {
        f"پیش از {split_year}": summarize(pre),
        f"از {split_year} به بعد": summarize(post),
    }
