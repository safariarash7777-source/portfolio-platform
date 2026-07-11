"use client";

import Image from "next/image";

interface LogoProps {
  size?: number;
  showText?: boolean;
  textVariant?: "navy" | "light";
  href?: string;
}

/**
 * Logo lockup — نشان + نام + عنوان حرفه‌ای
 * نشان (تیر آرش + حلقهٔ Enso) از /public/brand/mark.png بارگذاری می‌شود.
 * نشان عمودی است (نسبت ~365:723)، پس عرضش نصفِ ارتفاع نگه داشته می‌شود تا کج/کشیده نشود.
 * نام و عنوان با Flexbox نسبت به نشان به‌صورت عمودی هم‌تراز هستند.
 */
export default function Logo({
  size = 44,
  showText = true,
  textVariant = "navy",
}: LogoProps) {
  const nameColor = textVariant === "navy" ? "var(--navy-deep)" : "var(--text-on-navy)";
  const subColor  = textVariant === "navy" ? "var(--text-3)"   : "rgba(248,250,252,0.7)";
  const markW = Math.round(size * 0.505); // preserve the mark's 365×723 aspect

  return (
    <div className="flex items-center gap-3 select-none">
      {/* Logo mark — perfectly centered to text via flex */}
      <div
        className="relative flex-shrink-0 flex items-center justify-center"
        style={{ width: markW, height: size }}
      >
        <Image
          src="/brand/mark.png"
          alt="نشان آرش صفری"
          width={markW}
          height={size}
          priority
          className="object-contain"
          style={{ width: markW, height: size }}
        />
      </div>

      {showText && (
        <div className="flex flex-col justify-center leading-tight">
          <span
            className="font-display"
            style={{
              color: nameColor,
              fontSize: size * 0.42,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            آرش صفری
          </span>
          <span
            style={{
              color: subColor,
              fontSize: Math.max(size * 0.24, 11),
              fontWeight: 500,
              marginTop: 2,
            }}
          >
            تحلیلگر و مشاور سرمایه‌گذاری
          </span>
        </div>
      )}
    </div>
  );
}
