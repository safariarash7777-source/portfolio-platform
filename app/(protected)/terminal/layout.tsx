// ترمینال تحلیلگر — دسترسی «کامل» (ادمین یا مشاوره/وبینار فعال — سند مانیتایز فاز ۱۱).
// نکته: middleware مسیر /terminal را هم می‌گیرد؛ گیت دولایه است.
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";

export const metadata = {
  title: "ترمینال تحلیلگر — قطب‌نمای بازار",
  robots: { index: false, follow: false },
};

export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccess();
  if (access.level === "visitor") redirect("/login");
  if (access.level !== "full") redirect("/dashboard?upgrade=terminal");

  return <div className="min-h-screen" style={{ background: "var(--bg)" }}>{children}</div>;
}
