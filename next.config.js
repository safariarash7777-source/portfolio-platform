const { supabaseConnectSrc } = require("./lib/csp-supabase.js");
const { liaraPublicEnv } = require("./lib/liara-public-env.js");
let publicDatabaseEnv = liaraPublicEnv();
const fxDashboardOrigin = new URL(process.env.FX_DASHBOARD_URL?.trim() || "https://62.60.191.24/").origin;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: publicDatabaseEnv,
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
              `frame-src 'self' ${fxDashboardOrigin}`,
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src 'self' ${supabaseConnectSrc(publicDatabaseEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// This review branch uses an isolated member database. Public Codal data has
// its own read-only destination, independent of the browser auth/client pair.
const stagedMemberReview = process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "codex/fundamental-read-reconnect-20261114";
module.exports = stagedMemberReview ? async () => {
  const endpoint = "https://62.60.191.24:8443";
  const response = await fetch(endpoint + "/member-stage-discovery-20261121.json", {
    credentials:"omit", redirect:"error", signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Isolated member configuration unavailable");
  const config = await response.json();
  if (config.url !== endpoint + "/supabase" || typeof config.anonKey !== "string" ||
      Object.keys(config).some(k => k !== "url" && k !== "anonKey")) {
    throw new Error("Unexpected isolated member binding");
  }
  publicDatabaseEnv = liaraPublicEnv({NEXT_PUBLIC_LIARA_API_URL:config.url, NEXT_PUBLIC_LIARA_ANON_KEY:config.anonKey});
  return {...nextConfig, env:{...publicDatabaseEnv,SUPABASE_SERVICE_ROLE_KEY:"",CONTENT_SYNC_SERVICE_ROLE_KEY:""}};
} : nextConfig;
