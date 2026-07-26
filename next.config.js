/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // لینت کارِ CI است، نه کارِ build. تا پیش از افزودنِ ESLint به این مخزن،
    // `next build` بی‌سروصدا از لینت رد می‌شد (چون ESLint نصب نبود)؛ به‌محضِ نصب،
    // build شروع به اجرای لینت کرد و به نسخهٔ Node و ابزارِ لینتِ محیطِ build
    // گره خورد — که استقرار را شکست.
    // لینت در `.github/workflows/ci.yml` با `--max-warnings=0` و نودِ پین‌شده
    // اجرا می‌شود، پس اینجا چیزی از دست نمی‌رود؛ فقط build و لینت از هم جدا
    // می‌شوند. (P1-011)
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Enforcing. Inline script/style are allowed for the theme bootstrap +
          // inline styles; 'unsafe-eval' is needed for the Next dev runtime.
          // Tighten further with a per-request nonce if you drop 'unsafe-inline'.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
