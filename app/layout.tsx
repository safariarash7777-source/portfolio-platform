import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "پلتفرم مدیریت هوشمند پرتفوی | هوش مصنوعی",
  description: "مدیریت سبد سرمایه‌گذاری در بازار بورس ایران با قدرت هوش مصنوعی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.className}>
      <body>{children}</body>
    </html>
  );
}
