# -*- coding: utf-8 -*-
"""
ابزارهای خروجیِ سطحِ-انتشار (publication-grade): جدول‌های LaTeX با سبکِ booktabs،
ستاره‌های معناداری، و خطای استاندارد در پرانتز.

این ماژول مستقل از Streamlit است تا هم در داشبورد و هم در اسکریپت قابل‌استفاده باشد.
نام‌های انگلیسیِ مدل‌ها برای سازگاری با LaTeX استانداردِ pdflatex استفاده می‌شود
(متنِ فارسی در LaTeX نیازمندِ xepersian است؛ برای جدولِ مقاله انگلیسی تمیزتر است).
"""
import pandas as pd

# نگاشتِ کلیدِ مدل → نامِ انگلیسیِ مقاله
MODEL_EN = {
    "ppp": "PPP",
    "monetary_basic": "Monetary",
    "monetary_velocity": "Monetary+Velocity",
    "frenkel_bilson": "Frenkel--Bilson",
    "ecm": "ECM",
    "beer": "BEER",
}


def sig_stars(p) -> str:
    """ستارهٔ معناداری: *** p<۰٫۰۱، ** p<۰٫۰۵، * p<۰٫۱۰."""
    if p is None or pd.isna(p):
        return ""
    if p < 0.01:
        return "***"
    if p < 0.05:
        return "**"
    if p < 0.10:
        return "*"
    return ""


def _esc(s: str) -> str:
    """فرارِ کاراکترهای ویژهٔ LaTeX."""
    s = str(s)
    for a, b in [("\\", r"\textbackslash{}"), ("%", r"\%"), ("_", r"\_"),
                 ("&", r"\&"), ("#", r"\#"), ("$", r"\$")]:
        s = s.replace(a, b)
    return s


def comparison_latex(comp: pd.DataFrame,
                     caption: str = "Out-of-sample walk-forward accuracy versus a random walk.",
                     label: str = "tab:backtest") -> str:
    """
    جدولِ مقایسهٔ مدل‌ها (خروجیِ backtest.compare_models) را به LaTeX/booktabs می‌برد.

    ستون‌ها: Model، N، RMSE، MAPE(٪)، Theil's U، DM stat (با ستارهٔ معناداری در برابر RW).
    قاعدهٔ تفسیر در زیرنویس می‌آید: U<1 ⇒ بهتر از RW؛ ستاره ⇒ معناداریِ DM.
    """
    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        r"\caption{" + caption + "}",
        r"\label{" + label + "}",
        r"\begin{tabular}{lrrrrc}",
        r"\toprule",
        r"Model & $N$ & RMSE & MAPE (\%) & Theil's $U$ & DM vs.\ RW \\",
        r"\midrule",
    ]
    for _, r in comp.iterrows():
        key = r.get("_key", "")
        name = MODEL_EN.get(key, _esc(r.get("مدل", key)))
        n = "" if pd.isna(r.get("n")) else f"{int(r['n'])}"
        rmse = "--" if pd.isna(r.get("RMSE")) else f"{r['RMSE']:,.0f}"
        mape = "--" if pd.isna(r.get("MAPE_%")) else f"{r['MAPE_%']:.1f}"
        u = "--" if pd.isna(r.get("Theils_U")) else f"{r['Theils_U']:.3f}"
        dm = r.get("DM_stat")
        p = r.get("DM_p")
        dm_cell = "--" if (dm is None or pd.isna(dm)) else f"{dm:.2f}{sig_stars(p)}"
        lines.append(f"{name} & {n} & {rmse} & {mape} & {u} & {dm_cell} \\\\")
    lines += [
        r"\bottomrule",
        r"\end{tabular}",
        r"\begin{tablenotes}\footnotesize",
        r"\item Theil's $U<1$ indicates the model beats a random walk (RW).",
        r"\item DM = Diebold--Mariano statistic vs.\ RW with Harvey--Leybourne--Newbold "
        r"small-sample correction; negative favours the model. "
        r"Significance: $^{*}p<0.10$, $^{**}p<0.05$, $^{***}p<0.01$.",
        r"\end{tablenotes}",
        r"\end{table}",
    ]
    return "\n".join(lines)


def cointegration_latex(eg=None, ardl=None, gh=None,
                        caption: str = "Cointegration tests between the exchange rate and fundamentals.",
                        label: str = "tab:coint") -> str:
    """
    باتریِ آزمون‌های هم‌انباشتگی (EG · ARDL Bounds · Gregory–Hansen) را به LaTeX/booktabs می‌برد.
    ورودی‌ها خروجیِ توابعِ econometrics هستند (هر کدام None باشد رد می‌شود).
    """
    rows = []
    if eg and eg.get("ok"):
        c = "Yes" if eg.get("is_cointegrated") else "No"
        rows.append(("Engle--Granger (ADF)", f"{eg['adf_stat']:.2f}", f"{eg['eg_cv_5']:.2f}", c))
    if ardl and ardl.get("ok"):
        dec = {"cointegrated": "Yes", "none": "No", "inconclusive": "Inconcl."}[ardl["decision"]]
        rows.append((r"ARDL bounds ($F$)", f"{ardl['f_stat']:.2f}",
                     f"{ardl['lower_5']:.2f}/{ardl['upper_5']:.2f}", dec))
    if gh and gh.get("ok"):
        c = "Yes" if gh.get("is_cointegrated") else "No"
        rows.append((f"Gregory--Hansen (break {gh['break_index']})",
                     f"{gh['gh_stat']:.2f}", f"{gh['cv_5']:.2f}", c))
    lines = [
        r"\begin{table}[htbp]", r"\centering",
        r"\caption{" + caption + "}", r"\label{" + label + "}",
        r"\begin{tabular}{lccc}", r"\toprule",
        r"Test & Statistic & Crit.\ (5\%) & Cointegrated? \\", r"\midrule",
    ]
    for name, stat, cv, c in rows:
        lines.append(f"{name} & {stat} & {cv} & {c} \\\\")
    lines += [
        r"\bottomrule",
        r"\begin{tablenotes}\footnotesize",
        r"\item ARDL bounds reports lower/upper $I(0)/I(1)$ critical values (Pesaran et al.\ 2001, case 3).",
        r"\item Gregory--Hansen (1996) model C allows one endogenous level shift; rejection implies "
        r"cointegration with a structural break.",
        r"\end{tablenotes}",
        r"\end{tabular}", r"\end{table}",
    ]
    return "\n".join(lines)


def regression_latex(coefs: dict, r2=None, n=None,
                     caption: str = "Regression estimates.",
                     label: str = "tab:reg",
                     title: str = "Dependent variable") -> str:
    """
    جدولِ رگرسیون به LaTeX/booktabs: ضریب با ستارهٔ معناداری و SE در پرانتزِ زیرِ آن.

    coefs: {نام متغیر: {"beta": .., "se": .., "t": .., "p": (اختیاری)}}
    اگر p نبود، از |t|>1.64/1.96/2.58 برای ستاره استفاده می‌شود.
    """
    def stars_from(c):
        if "p" in c and c["p"] is not None and not pd.isna(c["p"]):
            return sig_stars(c["p"])
        t = abs(c.get("t", 0) or 0)
        return "***" if t > 2.58 else "**" if t > 1.96 else "*" if t > 1.64 else ""

    lines = [
        r"\begin{table}[htbp]", r"\centering",
        r"\caption{" + caption + "}", r"\label{" + label + "}",
        r"\begin{tabular}{lc}", r"\toprule",
        f"Variable & {_esc(title)} \\\\", r"\midrule",
    ]
    for name, c in coefs.items():
        beta = c.get("beta", float("nan"))
        se = c.get("se", float("nan"))
        lines.append(f"{_esc(name)} & {beta:.3f}{stars_from(c)} \\\\")
        if se is not None and not pd.isna(se):
            lines.append(f" & ({se:.3f}) \\\\")
    lines.append(r"\midrule")
    if n is not None:
        lines.append(f"$N$ & {int(n)} \\\\")
    if r2 is not None and not pd.isna(r2):
        lines.append(f"$R^2$ & {r2:.3f} \\\\")
    lines += [
        r"\bottomrule",
        r"\begin{tablenotes}\footnotesize",
        r"\item Standard errors in parentheses. "
        r"$^{*}p<0.10$, $^{**}p<0.05$, $^{***}p<0.01$.",
        r"\end{tablenotes}",
        r"\end{tabular}", r"\end{table}",
    ]
    return "\n".join(lines)
