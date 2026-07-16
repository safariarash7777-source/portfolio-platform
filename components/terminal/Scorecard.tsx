// نمایش کارت امتیاز سه‌محوره + بازهٔ ارزش‌گذاری — کامپوننت سروری خالص.
// قوانین: هر امتیاز با driver؛ دادهٔ ناموجود = «—»؛ هیچ واژهٔ سیگنالی.
import type {
  AxisScore,
  Scorecard as ScorecardType,
  ValuationBand,
  Driver,
} from "@/lib/core/engine";
import { toPersianDigits } from "@/lib/format";

const EFFECT_COLOR: Record<Driver["effect"], string> = {
  positive: "var(--success)",
  negative: "var(--danger)",
  neutral: "var(--text-3)",
};

function scoreColor(s: number): string {
  if (s >= 65) return "var(--success)";
  if (s >= 40) return "var(--warning)";
  return "var(--danger)";
}

function AxisCard({ title, weight, axis }: { title: string; weight: string; axis: AxisScore }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[13px] font-bold" style={{ color: "var(--navy-deep)" }}>
            {title}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            وزن {weight}
          </p>
        </div>
        <p
          className="text-2xl font-extrabold"
          style={{
            color: axis.score != null ? scoreColor(axis.score) : "var(--text-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {axis.score != null ? toPersianDigits(axis.score) : "—"}
        </p>
      </div>
      {axis.drivers.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {axis.drivers.map((d) => (
            <li key={d.label} className="text-[12px] leading-5">
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: "var(--text-2)" }}>{d.label}</span>
                <span
                  className="font-bold"
                  style={{ color: EFFECT_COLOR[d.effect], fontVariantNumeric: "tabular-nums" }}
                >
                  {d.value}
                </span>
              </div>
              {d.note ? (
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  {d.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-3)" }}>
          دادهٔ کافی برای این محور موجود نیست.
        </p>
      )}
    </div>
  );
}

export function ScorecardView({ sc }: { sc: ScorecardType }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
          کارت امتیاز سه‌محوره
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            امتیاز ترکیبی
          </span>
          <span
            className="text-3xl font-extrabold"
            style={{
              color: sc.composite != null ? scoreColor(sc.composite) : "var(--text-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {sc.composite != null ? toPersianDigits(sc.composite) : "—"}
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            / ۱۰۰
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <AxisCard title="بنیادی" weight="٪۴۵" axis={sc.fundamental} />
        <AxisCard title="روند قیمت" weight="٪۳۰" axis={sc.trend} />
        <AxisCard title="نقدینگی و جریان پول" weight="٪۲۵" axis={sc.liquidity} />
      </div>
      <p className="mt-3 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
        امتیازها چارچوب تحلیلی داخلی برای اولویت‌بندی بررسی هستند؛ محورهای بدون دادهٔ کافی از
        میانگین ترکیبی حذف و وزن‌ها بازتوزیع می‌شوند.
      </p>
    </section>
  );
}

export function ValuationView({ band, lastClose }: { band: ValuationBand; lastClose: number | null }) {
  const rial = (x: number) => `${toPersianDigits(x.toLocaleString("en-US"))} ریال`;
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
        بازهٔ ارزش‌گذاری سناریویی
      </h2>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
        روش: {band.method}
        {lastClose != null ? ` · آخرین قیمت پایانی: ${rial(lastClose)}` : ""}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {(
          [
            ["محافظه‌کارانه", band.low],
            ["پایه", band.base],
            ["خوش‌بینانه", band.high],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded border px-3 py-4" style={{ borderColor: "var(--line)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {label}
            </p>
            <p
              className="mt-1 text-[15px] font-extrabold"
              style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
            >
              {rial(v)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <p className="text-[12px] font-bold" style={{ color: "var(--text-2)" }}>
          فروض هر سناریو
        </p>
        <ul className="mt-2 space-y-1">
          {band.assumptions.map((a) => (
            <li key={a} className="text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
              · {a}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-5" style={{ color: "var(--warning)" }}>
          {band.caveat}
        </p>
      </div>
    </section>
  );
}

export function MaskView({ mask }: { mask: Record<string, string> }) {
  const LABELS: Record<string, string> = {
    gross_margin: "حاشیه سود ناخالص",
    operating_margin: "حاشیه سود عملیاتی",
    net_margin: "حاشیه سود خالص",
    revenue_growth: "رشد فروش",
    net_profit_growth: "رشد سود خالص",
  };
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
        خروجی ماسک کیفی (لایهٔ LLM)
      </h2>
      <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-3)" }}>
        تنها همین باندهای کیفی به مدل زبانی داده می‌شوند — هیچ عدد خام مالی از این مرز عبور
        نمی‌کند.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {Object.entries(mask).map(([k, v]) => (
          <div key={k} className="rounded border px-3 py-3 text-center" style={{ borderColor: "var(--line)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {LABELS[k] ?? k}
            </p>
            <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--navy)" }}>
              {v}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
