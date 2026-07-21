"""
دستیار هوشمند مالی داشبورد (مبتنی بر Gemini)
────────────────────────────────────────────────────────────────────────────
سه قابلیت:
  • chat(history)            → گفتگوی مبتنی بر داده با function-calling (به دستورات گوش می‌دهد)
  • interpret_snapshot(snap) → تفسیر وضعیت حباب
  • daily_report()           → گزارش روزانهٔ بازار (مدل قوی‌تر)

ابزارها به توابع موجود وصل‌اند (data_sources, etfbaz) تا دستیار هر داده‌ای را که
کاربر بخواهد «زنده» بیاورد.
"""
from __future__ import annotations

import json

import pandas as pd

import gemini

MODEL_CHAT = "gemini-2.5-flash"
MODEL_REPORT = "gemini-2.5-pro"

SYSTEM_PROMPT = (
    "تو «دستیار تحلیل‌گر بازارهای مالی ایران» در داشبورد آرش صفری هستی.\n"
    "تخصص: طلا و سکه (حباب، آبشده، مظنه)، صندوق‌های ETF (طلا/نقره/اهرمی/سهامی — "
    "حباب نسبت به NAV، بازده دوره‌ای)، نرخ ارز (دلار آزاد/نیما، مدل‌های PPP و پولی) و بورس تهران.\n"
    "جایگاه: داخل یک داشبورد تحلیلی فارسی کار می‌کنی و از طریق ابزارها به دادهٔ زنده دسترسی داری.\n"
    "رفتار: همیشه پاسخ‌ها را بر پایهٔ دادهٔ زندهٔ ابزارها بساز، نه حافظه. هر وقت به عدد یا دادهٔ "
    "روز نیاز داری حتماً ابزار مناسب را صدا بزن. فارسی روان و حرفه‌ای بنویس، اعداد را با واحد "
    "(تومان/درصد) و دقیق بیاور، و مختصر باش مگر کاربر تفصیل بخواهد.\n"
    "واحدها: هر ابزار واحد را صریح می‌دهد (تومان یا دلار)؛ دقیقاً همان واحد را گزارش کن و "
    "هیچ‌وقت ریال را با تومان اشتباه نگیر.\n"
    "کنترل داشبورد (بسیار مهم): وقتی کاربر دستور می‌دهد ورودی‌ای را تغییر بده (سناریو، تورم، "
    "نقدینگی، GDP، نفت، کسری، افق، نرخ لنگر)، یا به تبی برو، یا داده را تازه کن — "
    "**حتماً و بی‌درنگ ابزار اقدام مربوط (set_inputs / goto_tab / refresh_market) را فراخوانی کن**. "
    "هرگز فقط در متن ادعا نکن که کاری را انجام دادی بدون اینکه واقعاً ابزارش را صدا زده باشی. "
    "اگر کاربر چند کار خواست، همهٔ ابزارهای لازم را در همان نوبت صدا بزن.\n"
    "محدودیت: توصیهٔ مالی قطعی نده؛ تحلیل‌ها آموزشی‌اند و ریسک بازار را یادآوری کن."
)

# دستهٔ صندوق‌ها برای نگاشت نام فارسی → id (هم‌راستا با etfbaz.CATEGORIES)
_CAT_NAME_TO_ID = {
    "درآمد ثابت": "6812", "سهامی": "6811", "بخشی": "6819", "طلا": "500",
    "مختلط": "6810", "اهرمی": "6821", "شاخصی": "230", "املاک": "6818",
    "نقره": "600", "فراصندوق": "170", "کالایی": "240",
}

# ── کنترل اِیجنتیک داشبورد ──
# ورودی‌های قابل‌تغییر توسط دستیار (هم‌نام آرگومان set_inputs)
INPUT_FIELDS = ["scenario", "infl_iran", "m2_iran", "gdp_iran",
                "oil_price", "deficit_pct", "horizon", "manual_rate"]
SCENARIO_VALUES = ["وضع موجود", "خوش‌بینانه", "بدبینانه"]
# نام تب‌ها (دقیقاً مطابق برچسب‌های st.tabs در app.py) برای goto_tab
TAB_NAMES = [
    "📈 مقایسه تاریخی", "🔮 نرخ زنده و پیش‌بینی", "💧 شکاف حباب", "🌪️ تحلیل حساسیت",
    "📐 اقتصادسنجی (BEER · PSY/GSADF · Monte Carlo)", "🧪 اعتبارسنجی گذشته‌نگر",
    "📚 روش‌شناسی", "🧠 تفسیر هوشمند", "🏦 نرخ بهره واقعی", "📊 بورس",
    "💎 حباب طلا و سکه", "🤖 دستیار هوشمند",
]


def _match_tab(name: str) -> str | None:
    """نام آزاد کاربر را به نزدیک‌ترین برچسب تب نگاشت می‌کند (تطبیق لایه‌بندی‌شده)."""
    name = (name or "").strip()
    if not name:
        return None
    cores = [(t, (t.split(" ", 1)[1] if " " in t else t)) for t in TAB_NAMES]
    # لایه‌ها به‌ترتیب اولویت؛ اولین تطبیق در هر لایه برنده است
    for test in (
        lambda n, c: n == c,                  # تطابق کامل
        lambda n, c: c.startswith(n),         # هستهٔ تب با نام شروع شود (اولویت بر زیررشتهٔ ساده)
        lambda n, c: n.startswith(c),
        lambda n, c: n in c,                  # زیررشته
        lambda n, c: c in n,
    ):
        for t, core in cores:
            if test(name, core):
                return t
    return None

# ───────────────────────────── ابزارها (تعریف برای مدل) ─────────────────────
TOOLS = [{
    "functionDeclarations": [
        {
            "name": "get_bubbles",
            "description": "حباب لحظه‌ای طلای آبشده، سکه امامی، نیم سکه و صندوق‌های طلا/نقره به‌همراه دلار و انس.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "get_market",
            "description": "قیمت لحظه‌ای بازار. kind یکی از: gold (طلا/سکه/انس)، currency (ارزها)، commodity (کالا)، crypto (رمزارز).",
            "parameters": {
                "type": "object",
                "properties": {"kind": {"type": "string",
                                        "enum": ["gold", "currency", "commodity", "crypto"]}},
                "required": ["kind"],
            },
        },
        {
            "name": "get_funds",
            "description": "فهرست صندوق‌ها با بازده دوره‌ای. category می‌تواند نام فارسی دسته باشد "
                           "(طلا، نقره، اهرمی، سهامی، درآمد ثابت، مختلط، شاخصی، بخشی، املاک، کالایی) یا خالی برای همه.",
            "parameters": {
                "type": "object",
                "properties": {"category": {"type": "string"}},
            },
        },
        {
            "name": "search_instrument",
            "description": "جستجوی نماد/صندوق بر اساس نام یا نماد و گرفتن id آن.",
            "parameters": {
                "type": "object",
                "properties": {"q": {"type": "string"}},
                "required": ["q"],
            },
        },
        {
            "name": "get_price_history",
            "description": "تاریخچهٔ قیمت روزانهٔ یک نماد (با id از search_instrument).",
            "parameters": {
                "type": "object",
                "properties": {"instrument_id": {"type": "string"}},
                "required": ["instrument_id"],
            },
        },
        # ── ابزارهای اقدام (کنترل داشبورد) ──
        {
            "name": "set_inputs",
            "description": "تغییر ورودی‌های مدل نرخ ارز در نوار کناری داشبورد. فقط فیلدهایی را که کاربر "
                           "خواسته بفرست. scenario یکی از: «وضع موجود»، «خوش‌بینانه»، «بدبینانه».",
            "parameters": {
                "type": "object",
                "properties": {
                    "scenario": {"type": "string", "enum": SCENARIO_VALUES},
                    "infl_iran": {"type": "number", "description": "تورم ایران ٪ (۵ تا ۸۰)"},
                    "m2_iran": {"type": "number", "description": "رشد نقدینگی ٪ (۵ تا ۶۰)"},
                    "gdp_iran": {"type": "number", "description": "رشد GDP ٪ (-۱۰ تا ۱۲)"},
                    "oil_price": {"type": "number", "description": "قیمت نفت دلار (۳۰ تا ۱۳۰)"},
                    "deficit_pct": {"type": "number", "description": "کسری بودجه ٪ نقدینگی (۰ تا ۵۰)"},
                    "horizon": {"type": "number", "description": "افق پیش‌بینی ماه (۳ تا ۳۶)"},
                    "manual_rate": {"type": "number", "description": "نرخ لنگر دلار به تومان"},
                },
            },
        },
        {
            "name": "goto_tab",
            "description": "رفتن به یک تب داشبورد. نام تب یا بخشی از آن، مثلاً «حباب»، «بورس»، «پیش‌بینی»، «اقتصادسنجی».",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        },
        {
            "name": "refresh_market",
            "description": "تازه‌سازی (پاک‌کردن کش) داده‌های زندهٔ حباب و بازار.",
            "parameters": {"type": "object", "properties": {}},
        },
    ]
}]

# ───────────────────────────── پیاده‌سازی ابزارها ───────────────────────────
_etf_client = None


def _etf():
    global _etf_client
    if _etf_client is None:
        import etfbaz
        _etf_client = etfbaz.ETFBaz()
    return _etf_client


def _tool_get_bubbles() -> dict:
    import data_sources as ds
    snap = ds.fetch_bubbles_snapshot()
    return {
        "زمان": snap.get("ts_shamsi"), "منبع": snap.get("source"),
        "ورودی": snap.get("inputs"),
        "ردیف‌ها": [{"نام": r["name"], "گروه": r["group"],
                     "قیمت_تومان": r["market_toman"], "حباب_درصد": r["bubble_pct"]}
                    for r in snap.get("rows", [])],
    }


def _tool_get_market(kind: str = "gold") -> list:
    """قیمت بازار با واحد صریح: اقلام جهانی (انس، کالا) دلار؛ بقیه (ارز، سکه، طلای داخلی) به تومان."""
    df = _etf().market_df(kind)
    recs = []
    for _, r in df.head(40).iterrows():
        sym = str(r["نماد"])
        price = r["قیمت"]
        is_usd = (kind == "commodity") or ("انس" in sym) or \
                 (kind == "crypto" and "IRT" not in sym.upper())
        if is_usd:
            recs.append({"نماد": sym, "قیمت": price, "واحد": "دلار", "زمان": r["زمان"]})
        else:  # قیمت etfbaz ریالی است → تومان
            toman = round(price / 10) if pd.notna(price) else None
            recs.append({"نماد": sym, "قیمت": toman, "واحد": "تومان", "زمان": r["زمان"]})
    return recs


def _tool_get_funds(category: str | None = None) -> list:
    cid = _CAT_NAME_TO_ID.get((category or "").strip()) if category else None
    df = _etf().funds_df(category_id=cid)
    if "بازده ۱ماه" in df.columns:
        df = df.sort_values("بازده ۱ماه", ascending=False)
    cols = ["نماد", "نام", "دسته", "بازده ۱ماه", "بازده ۱سال"]
    return df[cols].head(30).to_dict("records")


def _tool_search(q: str) -> list:
    return [{"نماد": x.get("symbol"), "id": x.get("id"),
             "دسته": x.get("category")} for x in _etf().search(q)][:10]


def _tool_price_history(instrument_id: str) -> list:
    return _etf().price_history(instrument_id)[-15:]


TOOL_IMPL = {
    "get_bubbles": _tool_get_bubbles,
    "get_market": _tool_get_market,
    "get_funds": _tool_get_funds,
    "search_instrument": _tool_search,
    "get_price_history": _tool_price_history,
}


def _run_tool(name: str, args: dict) -> str:
    """ابزار را اجرا و خروجی را به JSON فشرده (با سقف طول) برمی‌گرداند."""
    fn = TOOL_IMPL.get(name)
    if not fn:
        return json.dumps({"error": f"ابزار ناشناخته: {name}"}, ensure_ascii=False)
    try:
        result = fn(**(args or {}))
    except Exception as e:  # noqa: BLE001
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    txt = json.dumps(result, ensure_ascii=False, default=str)
    return txt[:6000]


# ───────────────────────────── ابزارهای اقدام (کنترل داشبورد) ───────────────
_ACTION_TOOLS = {"set_inputs", "goto_tab", "refresh_market"}


def _run_action(name: str, args: dict, actions: dict) -> str:
    """اقدام را در ساختار actions ثبت می‌کند و تأیید متنی برای مدل برمی‌گرداند."""
    args = args or {}
    if name == "set_inputs":
        applied = {}
        for f in INPUT_FIELDS:
            if f in args and args[f] is not None:
                applied[f] = args[f]
        actions.setdefault("inputs", {}).update(applied)
        return json.dumps({"ok": True, "applied": applied}, ensure_ascii=False)
    if name == "goto_tab":
        tab = _match_tab(args.get("name", ""))
        if tab:
            actions["goto"] = tab
            return json.dumps({"ok": True, "tab": tab}, ensure_ascii=False)
        return json.dumps({"ok": False, "error": "تب پیدا نشد", "available": TAB_NAMES},
                          ensure_ascii=False)
    if name == "refresh_market":
        actions["refresh"] = True
        return json.dumps({"ok": True}, ensure_ascii=False)
    return json.dumps({"error": f"اقدام ناشناخته: {name}"}, ensure_ascii=False)


# ───────────────────────────── چت با function-calling ──────────────────────
def chat(history: list, model: str = MODEL_CHAT, max_rounds: int = 5) -> dict:
    """
    history: فهرست {"role": "user"|"assistant", "text": str}
    خروجی: {ok, text, error, actions} که actions = {inputs:{...}, goto:str, refresh:bool}
    """
    contents = [{"role": ("user" if m["role"] == "user" else "model"),
                 "parts": [{"text": m["text"]}]} for m in history]
    actions: dict = {}

    for _ in range(max_rounds):
        res = gemini.generate(contents, system=SYSTEM_PROMPT, tools=TOOLS,
                              model=model, temperature=0.2)
        if not res["ok"]:
            return {"ok": False, "text": "", "error": res["error"], "actions": actions}
        cand = res["candidate"] or {}
        parts = cand.get("parts", []) or []
        calls = [p["functionCall"] for p in parts if "functionCall" in p]

        if calls:
            contents.append({"role": "model", "parts": parts})
            resp_parts = []
            for fc in calls:
                name = fc.get("name")
                fargs = fc.get("args") or {}
                if name in _ACTION_TOOLS:
                    result = _run_action(name, fargs, actions)
                else:
                    result = _run_tool(name, fargs)
                resp_parts.append({"functionResponse":
                                   {"name": name, "response": {"result": result}}})
            contents.append({"role": "user", "parts": resp_parts})
            continue

        text = "".join(p.get("text", "") for p in parts)
        if not text and not actions:
            # کاندیدای خالی معمولاً یعنی محدودیت نرخ یا فیلتر محتوا
            return {"ok": True, "actions": actions, "error": None,
                    "text": "پاسخی دریافت نشد (احتمالاً محدودیت نرخ Gemini یا فیلتر محتوا). کمی بعد دوباره امتحان کن."}
        return {"ok": True, "text": text or "✅ انجام شد.", "error": None, "actions": actions}

    return {"ok": True, "actions": actions,
            "text": "تعداد دفعات استفاده از ابزار به سقف رسید؛ لطفاً ساده‌تر بپرس.",
            "error": None}


# ───────────────────────────── تفسیر و گزارش ────────────────────────────────
def interpret_snapshot(snapshot: dict, model: str = MODEL_CHAT) -> dict:
    """تفسیر کوتاه و کاربردی وضعیت حباب از روی snapshot موجود (بدون فراخوانی مجدد داده)."""
    rows = snapshot.get("rows", [])
    inp = snapshot.get("inputs", {})
    lines = [f"- {r['name']} ({r['group']}): حباب "
             f"{r['bubble_pct']:.2f}% — قیمت {r['market_toman']:,.0f} تومان"
             for r in rows if r.get("bubble_pct") == r.get("bubble_pct")]
    data_txt = (f"زمان: {snapshot.get('ts_shamsi')} | منبع: {snapshot.get('source')}\n"
                f"دلار: {inp.get('dollar_toman')} تومان | انس: {inp.get('ons_usd')} دلار\n"
                + "\n".join(lines))
    prompt = ("وضعیت لحظه‌ای حباب زیر را در ۳ تا ۵ جملهٔ فارسی تحلیل کن: کدام ابزار "
              "گران/ارزان است، چه سیگنالی از بازار می‌دهد، و یک نکتهٔ کاربردی. "
              "در پایان یک خط ریسک/disclaimer بیاور.\n\n" + data_txt)
    return gemini.ask(prompt, system=SYSTEM_PROMPT, model=model)


def daily_report(model: str = MODEL_REPORT) -> dict:
    """گزارش جامع روزانهٔ بازار با مدل قوی‌تر، بر پایهٔ دادهٔ زنده."""
    import data_sources as ds
    snap = ds.fetch_bubbles_snapshot()
    try:
        gold = _tool_get_market("gold")
        cur = _tool_get_market("currency")
    except Exception:  # noqa: BLE001
        gold, cur = [], []
    try:
        lev = _tool_get_funds("اهرمی")
        gfund = _tool_get_funds("طلا")
    except Exception:  # noqa: BLE001
        lev, gfund = [], []

    payload = {
        "حباب_و_سکه": _tool_get_bubbles() if not snap.get("ok") else {
            "زمان": snap.get("ts_shamsi"), "ردیف‌ها": [
                {"نام": r["name"], "حباب": r["bubble_pct"], "قیمت": r["market_toman"]}
                for r in snap.get("rows", [])]},
        "طلا_بازار": gold, "ارز": cur,
        "صندوق_اهرمی": lev, "صندوق_طلا": gfund,
    }
    prompt = ("بر پایهٔ این دادهٔ زندهٔ بازار، یک «گزارش بازار امروز» فارسی و حرفه‌ای بنویس با بخش‌های: "
              "۱) طلا و سکه (حباب)، ۲) ارز، ۳) صندوق‌ها (بهترین‌ها)، ۴) جمع‌بندی و نکات. "
              "با اعداد و کوتاه. در پایان disclaimer.\n\n"
              + json.dumps(payload, ensure_ascii=False, default=str)[:9000])
    return gemini.ask(prompt, system=SYSTEM_PROMPT, model=model, timeout=90)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print("— تست چت با ابزار —")
    r = chat([{"role": "user", "text": "بازده یک‌ماههٔ صندوق‌های اهرمی را خلاصه بگو."}])
    print("ok:", r["ok"], "| err:", r["error"])
    print(r["text"][:600])
