import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // پیش‌نمایش محلی ترمینال — فقط با TERMINAL_PREVIEW_OPEN=1 (هرگز روی Vercel ست نمی‌شود)
  if (process.env.TERMINAL_PREVIEW_OPEN === "1") {
    return <>{children}</>;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
