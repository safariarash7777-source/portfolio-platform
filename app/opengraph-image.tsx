// Default OpenGraph image for all public pages — P2-MANUS-MEGA-002
// Uses Next.js ImageResponse (no external dependencies)
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "آرش صفری — تحلیلگر و مشاور سرمایه‌گذاری";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "64px",
          background: "linear-gradient(135deg, #0a1628 0%, #0d2045 60%, #1a3a6e 100%)",
          fontFamily: "system-ui, sans-serif",
          direction: "rtl",
        }}
      >
        {/* Decorative top-right circle */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(59,130,246,0.12)",
            display: "flex",
          }}
        />
        {/* Eyebrow */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.12em",
            color: "#60a5fa",
            marginBottom: 16,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          arashsafari.ir
        </div>
        {/* Main title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#f8fafc",
            lineHeight: 1.2,
            marginBottom: 20,
            display: "flex",
          }}
        >
          آرش صفری
        </div>
        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            fontWeight: 400,
            color: "#94a3b8",
            marginBottom: 40,
            display: "flex",
          }}
        >
          تحلیلگر و مشاور سرمایه‌گذاری
        </div>
        {/* Tagline pills */}
        <div style={{ display: "flex", gap: 12 }}>
          {["رصد بازار", "کارنامهٔ تحلیل‌ها", "بدون وعدهٔ سود"].map((label) => (
            <div
              key={label}
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#bfdbfe",
                background: "rgba(59,130,246,0.18)",
                border: "1px solid rgba(59,130,246,0.35)",
                borderRadius: 8,
                padding: "8px 18px",
                display: "flex",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
