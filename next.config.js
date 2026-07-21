// داشبوردِ نرخ ارز روی دامنهٔ دیگری (لیارا، داخلِ ایران) اجرا می‌شود و در
// /admin/fx داخلِ iframe می‌آید. CSP هیچ frame-src نداشت، پس به default-src
// 'self' می‌افتاد و قاب را بلاک می‌کرد. فقط همان مبدأ را اجازه می‌دهیم — نه '*'.
const FX_ORIGIN = (() => {
  try {
    return process.env.FX_DASHBOARD_URL ? new URL(process.env.FX_DASHBOARD_URL).origin : "";
  } catch {
    return "";
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
              `frame-src 'self'${FX_ORIGIN ? ` ${FX_ORIGIN}` : ""}`,
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
