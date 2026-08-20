import Reveal from "./Reveal";

/**
 * روشِ کار — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * جایگزینِ سه سکشنِ قبلی: `ThreeSteps` + `Capabilities` + `WhyArash`.
 * آن سه، ۱۳ کارت و ۲۹۸ کلمه بودند که یک مفهوم را سه بار می‌گفتند.
 *
 * `id="features"` عمداً حفظ شده — `components/dashboard/AccessStatusCard.tsx`
 * به `/#features` لینک می‌دهد و آن فایل در دامنهٔ Entitlement است (دست‌نخورده).
 *
 * بدونِ کارت، بدونِ آیکون، بدونِ ویژوالِ ساختگی. سه گزاره که هر کدام چیزِ
 * متفاوتی می‌گویند.
 */
const STEPS = [
  {
    n: "۰۱",
    title: "فرض را می‌نویسم",
    desc: "هر تحلیل با فرضِ صریح شروع می‌شود: چه چیزی باید درست باشد تا این نتیجه بگیرد.",
  },
  {
    n: "۰۲",
    title: "بازه می‌دهم، نه عدد",
    desc: "ارزش‌گذاری در سه سناریو منتشر می‌شود. عددِ هدفِ واحد نمی‌دهم، چون صادقانه نیست.",
  },
  {
    n: "۰۳",
    title: "نتیجه ثبت می‌ماند",
    desc: "تحلیل پس از انتشار قابل ویرایش نیست. درست یا غلط، در کارنامه باقی می‌ماند.",
  },
];

export default function Method() {
  return (
    <section id="features" className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <h2
            className="font-display"
            style={{
              color: "var(--heading)",
              fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
            }}
          >
            چطور تحلیل می‌کنم
          </h2>
          <div aria-hidden className="divider-gold mt-4" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <div
                className={
                  "h-full" +
                  (i < STEPS.length - 1
                    ? " md:pe-8 md:border-e md:border-[color:var(--line)]"
                    : "")
                }
              >
                <span
                  className="font-display block"
                  style={{
                    color: "var(--gold)",
                    fontSize: "1.5rem",
                    fontWeight: 900,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.n}
                </span>
                <h3
                  className="font-display mt-3 text-lg font-bold"
                  style={{ color: "var(--heading)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--text-2)", lineHeight: 1.9 }}
                >
                  {s.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
