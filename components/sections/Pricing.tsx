import { Check } from "lucide-react";
import Container from "../ui/Container";
import SectionHeader from "../ui/SectionHeader";

const PLANS = [
  {
    name: "پایه",
    tagline: "برای شروع",
    price: "۲۹۰",
    unit: "هزار تومان / ماه",
    features: [
      "ارزیابی پروفایل ریسک",
      "پرتفوی پیشنهادی اولیه",
      "گزارش ماهانه عملکرد",
      "پشتیبانی ایمیلی",
    ],
    highlight: false,
    ctaLabel: "انتخاب پلن پایه",
  },
  {
    name: "حرفه‌ای",
    tagline: "محبوب‌ترین",
    price: "۷۹۰",
    unit: "هزار تومان / ماه",
    features: [
      "همه امکانات پلن پایه",
      "ریبالانس خودکار ماهانه",
      "گفت‌وگو با مشاور هوش مصنوعی",
      "تحلیل سفارشی صنایع",
      "پشتیبانی اولویت‌دار",
    ],
    highlight: true,
    ctaLabel: "انتخاب پلن حرفه‌ای",
  },
  {
    name: "ویژه",
    tagline: "برای سرمایه بالا",
    price: "۱٬۹۹۰",
    unit: "هزار تومان / ماه",
    features: [
      "همه امکانات پلن حرفه‌ای",
      "مشاوره مستقیم با تیم آرش صفری",
      "دسترسی به API",
      "تحلیل اختصاصی پرتفوی",
      "جلسات ماهانه رو در رو",
    ],
    highlight: false,
    ctaLabel: "گفت‌وگو با تیم فروش",
  },
];

export default function Pricing() {
  return (
    <section
      id="pricing"
      className="section"
      style={{ background: "var(--surface-2)" }}
    >
      <Container>
        <SectionHeader
          eyebrow="۰۳ · تعرفه"
          title="پلن‌های اشتراک شفاف، بدون هزینه پنهان"
          subtitle="هر سه پلن شامل دوره ارزیابی رایگان ۷ روزه است. در هر زمان می‌توانید ارتقا یا تنزل دهید."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((p) => {
            const isHi = p.highlight;
            return (
              <div
                key={p.name}
                className="relative card-elevated p-7 flex flex-col"
                style={{
                  background: isHi ? "var(--navy-deep)" : "var(--surface)",
                  borderColor: isHi ? "var(--navy-deep)" : "var(--line)",
                  color: isHi ? "var(--text-on-navy)" : "var(--text)",
                }}
              >
                {isHi && (
                  <div
                    className="absolute -top-3 right-6 text-[11px] font-bold px-3 py-1 rounded-full"
                    style={{
                      background: "var(--gold)",
                      color: "var(--navy-deep)",
                    }}
                  >
                    {p.tagline}
                  </div>
                )}
                <div
                  className="text-xs font-bold mb-1"
                  style={{
                    color: isHi ? "rgba(248,250,252,0.7)" : "var(--text-3)",
                  }}
                >
                  {!isHi && p.tagline}
                </div>
                <h3
                  className="font-display text-2xl font-bold mb-4"
                  style={{
                    color: isHi ? "var(--text-on-navy)" : "var(--navy-deep)",
                  }}
                >
                  پلن {p.name}
                </h3>

                <div className="mb-5 flex items-baseline gap-1">
                  <span
                    className="font-display text-4xl font-bold"
                    style={{
                      color: isHi ? "var(--gold-soft)" : "var(--navy)",
                    }}
                  >
                    {p.price}
                  </span>
                  <span
                    className="text-sm"
                    style={{
                      color: isHi ? "rgba(248,250,252,0.6)" : "var(--text-3)",
                    }}
                  >
                    {p.unit}
                  </span>
                </div>

                <ul className="space-y-3 mb-7 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check
                        size={16}
                        style={{
                          color: isHi ? "var(--gold-soft)" : "var(--navy)",
                          marginTop: 3,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: isHi
                            ? "rgba(248,250,252,0.85)"
                            : "var(--text-2)",
                        }}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={isHi ? "btn btn-gold w-full" : "btn btn-primary w-full"}
                >
                  {p.ctaLabel}
                </button>
              </div>
            );
          })}
        </div>

        <p
          className="text-center text-xs mt-8"
          style={{ color: "var(--text-3)" }}
        >
          پرداخت امن از طریق درگاه زرین‌پال · بدون ذخیره اطلاعات کارت بانکی
        </p>
      </Container>
    </section>
  );
}
