"use client";

/**
 * ابزارِ سناریوی سبد — حسابِ یک دورهٔ واحد روی فرض‌های خودِ کاربر.
 *
 * ── مرزها ───────────────────────────────────────────────────────────────────
 * · محاسبه **فقط** در `evaluatePortfolioScenario` است؛ اینجا موتور دوم نیست.
 * · خواندنِ عددِ کاربر در `parseNumericField` است، چون «خالی» و «صفر» و
 *   «نامعتبر» سه چیزِ متفاوت‌اند و موتور ورودیِ خام را نمی‌بیند.
 * · هیچ مقداری به سرور نمی‌رود: کلِ state داخلِ همین کامپوننت است، هیچ
 *   fetch/localStorage/رویدادِ تحلیلی وجود ندارد.
 * · این ابزار پیش‌بینی نیست. هر عدد فرضِ خودِ کاربر است و هیچ احتمالی به آن
 *   نسبت داده نمی‌شود.
 */

import { useId, useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw, Beaker, Info, AlertTriangle } from "lucide-react";
import {
  evaluatePortfolioScenario,
  type PortfolioScenarioResult,
} from "@/lib/core/portfolioScenario";
import { parseNumericField, type NumericField } from "@/lib/core/scenarioInput";
import { scenarioErrorTexts } from "@/lib/core/scenarioLabels";
import { toPersianDigits, formatToman } from "@/lib/format";

const MAX_SCENARIOS = 3;
const MAX_ASSETS = 12;

type Asset = { id: string; label: string; weight: string };
type Scenario = { id: string; name: string; returns: Record<string, string>; inflation: string };

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

const blankAsset = (): Asset => ({ id: nextId("a"), label: "", weight: "" });
const blankScenario = (name: string): Scenario => ({ id: nextId("s"), name, returns: {}, inflation: "" });

/** درصد با دقتِ کافی برای اینکه ۹٪ با ۸٫۹۶٪ اشتباه نشود. */
function pct(value: number, digits = 2): string {
  const sign = value < 0 ? "−" : "";
  const body = toPersianDigits(Math.abs(value).toFixed(digits)).replace(".", "٫");
  return `${sign}${body}٪`;
}
/** «واحد درصد» عمداً واحدِ دیگری است و هرگز با ٪ نوشته نمی‌شود. */
function pp(value: number, digits = 2): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}${toPersianDigits(Math.abs(value).toFixed(digits)).replace(".", "٫")} واحد درصد`;
}
function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}${formatToman(Math.abs(value))}`;
}

/** نمونهٔ آموزشی — فقط با انتخابِ کاربر پر می‌شود و همه‌جا «فرضی» نامیده می‌شود. */
function sampleState(): { assets: Asset[]; scenarios: Scenario[]; initial: string; horizon: string } {
  const a = [
    { id: nextId("a"), label: "صندوق درآمد ثابت", weight: "60" },
    { id: nextId("a"), label: "صندوق سهامی", weight: "30" },
    { id: nextId("a"), label: "طلا", weight: "10" },
  ];
  const mk = (name: string, r: [string, string, string], inf: string): Scenario => ({
    id: nextId("s"),
    name,
    returns: { [a[0].id]: r[0], [a[1].id]: r[1], [a[2].id]: r[2] },
    inflation: inf,
  });
  return {
    initial: "۱۰۰۰",
    horizon: "یک سال",
    assets: a,
    scenarios: [
      mk("فرضِ محتاطانه", ["۲۰", "-۱۰", "۰"], "۱۰"),
      mk("فرضِ میانه", ["۲۵", "۱۵", "۱۰"], "۱۰"),
    ],
  };
}

export default function PortfolioScenario() {
  const uid = useId();
  const [horizon, setHorizon] = useState("");
  const [initial, setInitial] = useState("");
  const [assets, setAssets] = useState<Asset[]>(() => [blankAsset(), blankAsset()]);
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [blankScenario("سناریوی ۱")]);
  const [isSample, setIsSample] = useState(false);

  const initialField = parseNumericField(initial);
  const weightFields = useMemo(
    () => assets.map((a) => parseNumericField(a.weight)),
    [assets],
  );
  const weightSum = weightFields.some((f) => f.state === "invalid")
    ? null
    : weightFields.reduce((s, f) => s + (f.state === "ok" ? f.value : 0), 0);

  function patchAsset(id: string, patch: Partial<Asset>) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function removeAsset(id: string) {
    setAssets((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.id !== id)));
    setScenarios((prev) =>
      prev.map((s) => {
        const { [id]: _drop, ...rest } = s.returns;
        return { ...s, returns: rest };
      }),
    );
  }
  function patchScenario(id: string, patch: Partial<Scenario>) {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function setReturn(sid: string, aid: string, value: string) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === sid ? { ...s, returns: { ...s.returns, [aid]: value } } : s)),
    );
  }
  function resetAll() {
    setHorizon(""); setInitial(""); setIsSample(false);
    setAssets([blankAsset(), blankAsset()]);
    setScenarios([blankScenario("سناریوی ۱")]);
  }
  function loadSample() {
    const s = sampleState();
    setInitial(s.initial); setHorizon(s.horizon);
    setAssets(s.assets); setScenarios(s.scenarios);
    setIsSample(true);
  }

  const assetLabel = (id: string) => {
    const a = assets.find((x) => x.id === id);
    const i = assets.findIndex((x) => x.id === id);
    return a?.label.trim() || `دارایی ${toPersianDigits(i + 1)}`;
  };

  /** خطاهای «خواندنِ ورودی» — پیش از موتور، چون موتور متنِ خام را نمی‌بیند. */
  function readingErrors(s: Scenario): string[] {
    const out: string[] = [];
    if (initialField.state === "invalid") out.push("سرمایهٔ اولیه عدد خوانده نشد.");
    assets.forEach((a, i) => {
      if (parseNumericField(a.weight).state === "invalid")
        out.push(`وزنِ «${a.label.trim() || `دارایی ${toPersianDigits(i + 1)}`}» عدد خوانده نشد.`);
      const r = s.returns[a.id] ?? "";
      if (parseNumericField(r).state === "invalid")
        out.push(`بازدهٔ فرضیِ «${a.label.trim() || `دارایی ${toPersianDigits(i + 1)}`}» عدد خوانده نشد.`);
    });
    if (parseNumericField(s.inflation).state === "invalid") out.push("تورمِ فرضی عدد خوانده نشد.");
    return [...new Set(out)];
  }

  function evaluate(s: Scenario): { reading: string[]; result: PortfolioScenarioResult | null } {
    const reading = readingErrors(s);
    if (reading.length) return { reading, result: null };
    if (initialField.state !== "ok") return { reading: [], result: null };

    const num = (f: NumericField) => (f.state === "ok" ? f.value : null);
    const holdings = assets.map((a) => ({
      id: a.id,
      weightPct: num(parseNumericField(a.weight)) ?? 0,
      returnPct: num(parseNumericField(s.returns[a.id] ?? "")),
    }));
    const inflationField = parseNumericField(s.inflation);
    return {
      reading: [],
      result: evaluatePortfolioScenario({
        initialValue: initialField.value,
        holdings,
        inflationPct: inflationField.state === "ok" ? inflationField.value : null,
      }),
    };
  }

  const anyWeightBlank = weightFields.some((f) => f.state === "blank");
  const ready = initialField.state === "ok" && !anyWeightBlank;

  return (
    <div className="space-y-5">
      {isSample ? (
        <p
          className="card px-4 py-3 text-[12.5px] leading-7 flex items-start gap-2"
          style={{ borderColor: "var(--gold)", background: "var(--gold-tint)", color: "var(--gold-ink)" }}
          role="status"
        >
          <Beaker size={16} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            این اعداد <strong>نمونهٔ فرضی</strong> برای آشنایی با ابزارند — نه دادهٔ بازار، نه سبدِ
            واقعی و نه پیش‌بینی. آزادانه عوضشان کنید.
          </span>
        </p>
      ) : null}

      {/* ── سرمایه و افق ───────────────────────────────────────────── */}
      <section className="card p-4 sm:p-5" aria-labelledby={`${uid}-basis`}>
        <h2 id={`${uid}-basis`} className="text-[15px] font-extrabold mb-3" style={{ color: "var(--heading)" }}>
          مبنای محاسبه
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-initial`} className="block text-[12.5px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
              سرمایهٔ اولیه <span style={{ color: "var(--text-3)" }}>(تومان)</span>
            </label>
            <input
              id={`${uid}-initial`}
              className="input"
              inputMode="decimal"
              dir="ltr"
              style={{ textAlign: "right" }}
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="۱۰۰٬۰۰۰٬۰۰۰"
              aria-describedby={`${uid}-initial-help`}
              aria-invalid={initialField.state === "invalid"}
            />
            <p id={`${uid}-initial-help`} className="text-[11.5px] mt-1.5" style={{ color: initialField.state === "invalid" ? "var(--danger)" : "var(--text-3)" }}>
              {initialField.state === "invalid"
                ? "این مقدار عدد خوانده نشد. ارقام فارسی، ٫ و / هم پذیرفته می‌شوند."
                : "واحد تومان است. ارقام فارسی و جداکنندهٔ هزارگان پذیرفته می‌شود."}
            </p>
          </div>
          <div>
            <label htmlFor={`${uid}-horizon`} className="block text-[12.5px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
              افق زمانی <span style={{ color: "var(--text-3)" }}>(برچسب)</span>
            </label>
            <input
              id={`${uid}-horizon`}
              className="input"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              placeholder="مثلاً یک سال"
              aria-describedby={`${uid}-horizon-help`}
            />
            <p id={`${uid}-horizon-help`} className="text-[11.5px] mt-1.5" style={{ color: "var(--text-3)" }}>
              همهٔ بازده‌ها و تورم به <strong>همین یک افق</strong> مربوط‌اند. تبدیل سالانه انجام نمی‌شود.
            </p>
          </div>
        </div>
      </section>

      {/* ── دارایی‌ها ───────────────────────────────────────────────── */}
      <section className="card p-4 sm:p-5" aria-labelledby={`${uid}-assets`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 id={`${uid}-assets`} className="text-[15px] font-extrabold" style={{ color: "var(--heading)" }}>
            دارایی‌ها و وزن‌ها
          </h2>
          <span
            className="text-[12px] font-bold rounded-full px-3 py-1"
            style={{
              background: weightSum === null ? "var(--surface-2)" : Math.abs(weightSum - 100) < 1e-8 ? "rgba(21,128,61,0.10)" : "var(--surface-2)",
              color: weightSum === null ? "var(--text-3)" : Math.abs(weightSum - 100) < 1e-8 ? "var(--success)" : "var(--warning)",
            }}
            aria-live="polite"
          >
            {weightSum === null ? "جمع وزن‌ها نامعلوم" : `جمع وزن‌ها: ${pct(weightSum, 2)}`}
          </span>
        </div>

        <ul className="space-y-2.5">
          {assets.map((a, i) => {
            const wf = parseNumericField(a.weight);
            return (
              <li key={a.id} className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                <div className="grow min-w-[150px]">
                  <label htmlFor={`${uid}-l-${a.id}`} className="block text-[11.5px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>
                    نام دارایی {toPersianDigits(i + 1)}
                  </label>
                  <input
                    id={`${uid}-l-${a.id}`}
                    className="input"
                    value={a.label}
                    onChange={(e) => patchAsset(a.id, { label: e.target.value })}
                    placeholder="مثلاً صندوق درآمد ثابت"
                  />
                </div>
                <div className="w-[116px] shrink-0">
                  <label htmlFor={`${uid}-w-${a.id}`} className="block text-[11.5px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>
                    وزن (٪)
                  </label>
                  <input
                    id={`${uid}-w-${a.id}`}
                    className="input"
                    inputMode="decimal"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                    value={a.weight}
                    onChange={(e) => patchAsset(a.id, { weight: e.target.value })}
                    placeholder="۶۰"
                    aria-invalid={wf.state === "invalid"}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  style={{ minHeight: 44, minWidth: 44 }}
                  onClick={() => removeAsset(a.id)}
                  disabled={assets.length <= 1}
                  aria-label={`حذف ${assetLabel(a.id)}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="btn btn-outline mt-3"
          style={{ minHeight: 44 }}
          onClick={() => setAssets((p) => (p.length >= MAX_ASSETS ? p : [...p, blankAsset()]))}
          disabled={assets.length >= MAX_ASSETS}
        >
          <Plus size={16} aria-hidden /> افزودن دارایی
        </button>
      </section>

      {/* ── سناریوها ───────────────────────────────────────────────── */}
      <section aria-labelledby={`${uid}-scn`} className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id={`${uid}-scn`} className="text-[15px] font-extrabold" style={{ color: "var(--heading)" }}>
            سناریوها <span className="font-normal text-[12.5px]" style={{ color: "var(--text-3)" }}>(حداکثر {toPersianDigits(MAX_SCENARIOS)} مورد)</span>
          </h2>
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 44 }}
            onClick={() =>
              setScenarios((p) =>
                p.length >= MAX_SCENARIOS ? p : [...p, blankScenario(`سناریوی ${toPersianDigits(p.length + 1)}`)],
              )
            }
            disabled={scenarios.length >= MAX_SCENARIOS}
          >
            <Plus size={16} aria-hidden /> افزودن سناریو
          </button>
        </div>

        <div className={`grid gap-4 ${scenarios.length > 1 ? "lg:grid-cols-2" : ""} ${scenarios.length > 2 ? "xl:grid-cols-3" : ""}`}>
          {scenarios.map((s) => {
            const { reading, result } = evaluate(s);
            const inflationField = parseNumericField(s.inflation);
            return (
              <article key={s.id} className="card-elevated p-4 sm:p-5 space-y-4 min-w-0">
                <div className="flex items-end gap-2">
                  <div className="grow min-w-0">
                    <label htmlFor={`${uid}-n-${s.id}`} className="block text-[11.5px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>
                      نام سناریو
                    </label>
                    <input
                      id={`${uid}-n-${s.id}`}
                      className="input"
                      value={s.name}
                      onChange={(e) => patchScenario(s.id, { name: e.target.value })}
                      placeholder="مثلاً فرضِ محتاطانه"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    style={{ minHeight: 44, minWidth: 44 }}
                    onClick={() => setScenarios((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== s.id)))}
                    disabled={scenarios.length <= 1}
                    aria-label={`حذف سناریوی ${s.name || ""}`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-[11.5px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>
                    بازدهٔ فرضی هر دارایی در {horizon.trim() || "همان افق"} (٪)
                  </legend>
                  {assets.map((a) => {
                    const raw = s.returns[a.id] ?? "";
                    const f = parseNumericField(raw);
                    return (
                      <div key={a.id} className="flex items-center gap-2">
                        <label htmlFor={`${uid}-r-${s.id}-${a.id}`} className="text-[12.5px] grow min-w-0 truncate" style={{ color: "var(--text-2)" }}>
                          {assetLabel(a.id)}
                        </label>
                        <input
                          id={`${uid}-r-${s.id}-${a.id}`}
                          className="input w-[110px] shrink-0"
                          inputMode="decimal"
                          dir="ltr"
                          style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}
                          value={raw}
                          onChange={(e) => setReturn(s.id, a.id, e.target.value)}
                          placeholder="خالی"
                          aria-invalid={f.state === "invalid"}
                        />
                      </div>
                    );
                  })}
                </fieldset>

                <div>
                  <label htmlFor={`${uid}-i-${s.id}`} className="block text-[11.5px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>
                    تورم همین افق (٪) — اختیاری
                  </label>
                  <input
                    id={`${uid}-i-${s.id}`}
                    className="input"
                    inputMode="decimal"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                    value={s.inflation}
                    onChange={(e) => patchScenario(s.id, { inflation: e.target.value })}
                    placeholder="خالی = نامعلوم"
                    aria-invalid={inflationField.state === "invalid"}
                    aria-describedby={`${uid}-i-help-${s.id}`}
                  />
                  <p id={`${uid}-i-help-${s.id}`} className="text-[11.5px] mt-1.5" style={{ color: "var(--text-3)" }}>
                    خالی یعنی <strong>نامعلوم</strong>، نه صفر. بازدهٔ واقعی فقط وقتی نشان داده می‌شود که این را پر کنید.
                  </p>
                </div>

                <Result
                  reading={reading}
                  result={result}
                  ready={ready}
                  assetLabel={assetLabel}
                  horizon={horizon.trim()}
                />
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={loadSample}>
          <Beaker size={16} aria-hidden /> پر کردن با نمونهٔ فرضی
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={resetAll}>
          <RotateCcw size={16} aria-hidden /> پاک کردن همه
        </button>
      </div>

      <section className="card p-4 sm:p-5" aria-labelledby={`${uid}-limits`}>
        <h2 id={`${uid}-limits`} className="text-[13.5px] font-extrabold mb-2 flex items-center gap-1.5" style={{ color: "var(--heading)" }}>
          <Info size={15} aria-hidden /> این حساب چه چیزی را در نظر نمی‌گیرد
        </h2>
        <ul className="text-[12.5px] leading-7 list-disc pr-5 space-y-0.5" style={{ color: "var(--text-2)" }}>
          <li>کارمزد معامله، مالیات و هزینهٔ صدور/ابطال</li>
          <li>واریز یا برداشت در میانهٔ دوره</li>
          <li>ریبالانس، اهرم و فروش استقراضی</li>
          <li>ترتیب رخدادها درون دوره — فقط یک دورهٔ کامل حساب می‌شود</li>
        </ul>
        <p className="text-[12.5px] leading-7 mt-2" style={{ color: "var(--text-2)" }}>
          بازدهٔ هر دارایی <strong>بازدهٔ کل همان دوره</strong> فرض می‌شود. اعداد را شما وارد
          می‌کنید؛ این ابزار نه پیش‌بینی می‌کند، نه احتمالی به سناریوها نسبت می‌دهد و نه
          سابقهٔ واقعی بازار را می‌خواند.
        </p>
        <p className="text-[12.5px] leading-7 mt-2" style={{ color: "var(--text-3)" }}>
          مقادیری که وارد می‌کنید در همین صفحه و در مرورگر شما می‌مانند؛ در این نسخه هیچ‌کدام
          ذخیره یا به سرور ارسال نمی‌شوند.
        </p>
      </section>
    </div>
  );
}

function Result({
  reading,
  result,
  ready,
  assetLabel,
  horizon,
}: {
  reading: string[];
  result: PortfolioScenarioResult | null;
  ready: boolean;
  assetLabel: (id: string) => string;
  horizon: string;
}) {
  const box = "rounded-[var(--r)] px-3.5 py-3 text-[12.5px] leading-7";

  if (reading.length) {
    return (
      <div className={box} style={{ background: "rgba(185,28,28,0.07)", color: "var(--danger)" }} role="alert">
        <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle size={15} aria-hidden /> ورودی خوانده نشد</p>
        <ul className="list-disc pr-5">{reading.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    );
  }
  if (!ready || !result) {
    return (
      <div className={box} style={{ background: "var(--surface-2)", color: "var(--text-3)" }} aria-live="polite">
        سرمایهٔ اولیه و وزنِ همهٔ دارایی‌ها را پر کنید تا نتیجه ساخته شود.
      </div>
    );
  }
  if (result.status === "invalid") {
    return (
      <div className={box} style={{ background: "rgba(185,28,28,0.07)", color: "var(--danger)" }} role="alert">
        <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle size={15} aria-hidden /> نتیجه ساخته نشد</p>
        <ul className="list-disc pr-5">{scenarioErrorTexts(result.errors).map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    );
  }
  if (result.status === "incomplete") {
    return (
      <div className={box} style={{ background: "rgba(180,83,9,0.08)", color: "var(--warning)" }} aria-live="polite">
        <p className="font-bold mb-1">نتیجهٔ کل سبد ساخته نشد</p>
        <p>
          برای {result.missingIds.map(assetLabel).join("، ")} هنوز فرضی وارد نشده. تا آن وقت
          هیچ بازدهی برای کلِ سبد گفته نمی‌شود — <strong>خالی صفر فرض نمی‌شود</strong>.
        </p>
        <p className="mt-1" style={{ color: "var(--text-3)" }}>
          اکنون {pct(result.coveredWeightPct, 2)} از وزن سبد فرض دارد.
        </p>
      </div>
    );
  }

  const gain = result.profitLoss >= 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="ارزش نهایی (فرضی)" value={money(result.finalValue)} />
        <Stat label="سود / زیان" value={money(result.profitLoss)} tone={gain ? "var(--success)" : "var(--danger)"} />
        <Stat label={`بازدهٔ اسمی${horizon ? ` · ${horizon}` : ""}`} value={pct(result.returnPct)} tone={result.returnPct >= 0 ? "var(--success)" : "var(--danger)"} />
        <Stat
          label="بازدهٔ واقعی (پس از تورم)"
          value={result.realReturnPct === null ? "—" : pct(result.realReturnPct)}
          tone={result.realReturnPct === null ? undefined : result.realReturnPct >= 0 ? "var(--success)" : "var(--danger)"}
          hint={result.realReturnPct === null ? "تورم وارد نشده" : undefined}
        />
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <caption className="text-[11.5px] text-right pb-1.5" style={{ color: "var(--text-3)" }}>
            سهم هر دارایی در بازدهٔ سبد. ستون «سهم» <strong>واحد درصد</strong> است، نه درصدِ بازدهِ خودِ دارایی.
          </caption>
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th scope="col" className="text-right font-semibold pb-1.5">دارایی</th>
              <th scope="col" className="text-left font-semibold pb-1.5">سهم در بازدهٔ سبد</th>
              <th scope="col" className="text-left font-semibold pb-1.5">سود / زیان</th>
              <th scope="col" className="text-left font-semibold pb-1.5">وزن پایانی</th>
            </tr>
          </thead>
          <tbody>
            {result.contributions.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                <th scope="row" className="text-right font-medium py-1.5 max-w-[10rem] truncate" style={{ color: "var(--text-2)" }}>
                  {assetLabel(c.id)}
                </th>
                <td className="text-left py-1.5 tabular-nums" style={{ color: c.contributionPctPoints >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {pp(c.contributionPctPoints)}
                </td>
                <td className="text-left py-1.5 tabular-nums" style={{ color: "var(--text-2)" }}>{money(c.profitLoss)}</td>
                <td className="text-left py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>
                  {c.finalWeightPct === null ? "تعریف‌نشده" : pct(c.finalWeightPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-[var(--r)] px-3 py-2.5 min-w-0" style={{ background: "var(--surface-2)" }}>
      <dt className="text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd className="text-[14px] font-extrabold mt-0.5 tabular-nums break-words" style={{ color: tone ?? "var(--text)" }}>
        {value}
      </dd>
      {hint ? <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-3)" }}>{hint}</p> : null}
    </div>
  );
}
