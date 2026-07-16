// ترمینال تحلیلگر — فقط ادمین (همان گیت DB-سطح پنل مدیریت).
// نکته: middleware مسیر /terminal را هم باید بگیرد؛ matcher به‌روزرسانی شده است.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "ترمینال تحلیلگر — قطب‌نمای بازار",
  robots: { index: false, follow: false },
};

export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");
  return <div className="min-h-screen" style={{ background: "var(--bg)" }}>{children}</div>;
}
