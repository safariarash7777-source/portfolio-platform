interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "right" | "center";
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: SectionHeaderProps) {
  const alignClass = align === "center" ? "text-center items-center" : "text-right items-start";

  return (
    <div className={`flex flex-col gap-3 mb-12 ${alignClass}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2
        className="font-display"
        style={{
          color: "var(--navy-deep)",
          fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
          fontWeight: 800,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h2>
      <div className="divider-gold" />
      {subtitle && (
        <p
          style={{
            color: "var(--text-2)",
            fontSize: "1rem",
            maxWidth: "42rem",
            lineHeight: 1.7,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
