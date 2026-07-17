import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const pelak = localFont({
  src: [
    { path: "../public/fonts/Pelak-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/Pelak-ExtraBold.woff2", weight: "800", style: "normal" },
    { path: "../public/fonts/Pelak-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-pelak",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری",
    template: "%s · آرش صفری",
  },
  description:
    "پلتفرم تخصصی تحلیل ریسک و طراحی پرتفوی سرمایه‌گذاری در بازار سرمایه ایران. مبتنی بر نظریه مدرن پرتفوی و هوش مصنوعی.",
  keywords: [
    "آرش صفری",
    "تحلیل سرمایه‌گذاری",
    "مشاور سرمایه‌گذاری",
    "پرتفوی",
    "بورس ایران",
    "ریسک",
    "MPT",
  ],
  authors: [{ name: "آرش صفری" }],
  creator: "آرش صفری",
  applicationName: "Arash Safari Portfolio Platform",
  robots: { index: true, follow: true },
  openGraph: {
    title: "آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری",
    description:
      "تحلیل علمی پروفایل ریسک و طراحی سبد سرمایه‌گذاری اختصاصی برای بازار ایران.",
    locale: "fa_IR",
    type: "website",
    siteName: "Arash Safari",
  },
  icons: {
    icon: "/brand/mark.png",
    apple: "/brand/mark.png",
  },
};

export const viewport: Viewport = {
  // استثنای مستند C4: themeColor متادیتای مرورگر است و پیش از لود CSS خوانده می‌شود؛ CSS var ممکن نیست.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)",  color: "#0B1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

// FOUC-free theme bootstrap — runs before paint
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : false; // Light is the institutional default
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" className={`${vazirmatn.variable} ${pelak.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
