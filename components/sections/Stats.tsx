import Container from "../ui/Container";

const STATS = [
  { value: "+۱۰۰", label: "ساعت تحلیل علمی", caption: "پشتوانه‌ی هر پروفایل" },
  { value: "۲۲",   label: "پرسش تخصصی",      caption: "در ۶ بخش رفتاری/مالی" },
  { value: "۴",    label: "پروفایل ریسک",     caption: "از محافظه‌کار تا تهاجمی" },
  { value: "۱۰۰٪", label: "حفظ حریم خصوصی",  caption: "داده‌های شما رمزنگاری می‌شود" },
];

export default function Stats() {
  return (
    <section
      className="py-16 border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <Container>
        <p
          className="text-center text-xs font-bold tracking-widest uppercase mb-8"
          style={{ color: "var(--text-3)" }}
        >
          مورد اعتماد سرمایه‌گذاران حرفه‌ای
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="text-center p-6 rounded-xl"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
              }}
            >
              <div
                className="font-display text-3xl md:text-4xl font-bold mb-2"
                style={{ color: "var(--navy)" }}
              >
                {s.value}
              </div>
              <div
                className="text-sm font-bold mb-1"
                style={{ color: "var(--navy-deep)" }}
              >
                {s.label}
              </div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                {s.caption}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
