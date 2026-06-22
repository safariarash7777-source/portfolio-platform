import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-vazirmatn",
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
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
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
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" className={vazirmatn.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
