import Container from "../ui/Container";

export default function Quote() {
  return (
    <section
      className="py-20 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 right-10 text-[180px] leading-none select-none pointer-events-none"
        style={{
          color: "var(--gold)",
          opacity: 0.12,
          fontFamily: "Georgia, serif",
        }}
      >
        “
      </div>

      <Container>
        <div className="text-center max-w-3xl mx-auto">
          <p
            className="font-display text-2xl md:text-3xl leading-relaxed mb-6 font-bold"
            style={{ color: "var(--text-on-navy)" }}
          >
            سرمایه‌گذاری <span style={{ color: "var(--gold-soft)" }}>علمی</span>،
            نه شانسی —
            <br />
            هر تصمیم بر پایه‌ی <span style={{ color: "var(--gold-soft)" }}>داده، منطق و نظم</span>.
          </p>
          <div className="mx-auto h-[2px] w-16 bg-[color:var(--gold)] mb-4" />
          <p
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: "var(--gold-soft)" }}
          >
            آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری
          </p>
        </div>
      </Container>
    </section>
  );
}
