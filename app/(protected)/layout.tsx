import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";
import ReadError from "@/components/dashboard/ReadError";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let verified = false, unavailable = false;
  try {
    const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000);
    unavailable = authSessionFailure(auth.error) === 503;
    verified = !auth.error && !!auth.data.user;
  } catch { unavailable = true; }

  if (unavailable) return <main id="main-content" dir="rtl" className="mx-auto w-full max-w-3xl px-5 py-10">
    <h1 className="font-display text-xl font-bold">وضعیت نشست نامشخص است</h1>
    <p className="mt-3 text-sm leading-7">بررسی ورود پاسخ معتبر نداد. این وضعیت به معنی خروج از حساب نیست؛ پس از بازیابی سرویس همین مسیر را بازخوانی کنید.</p>
    <ReadError label="نشست حساب" code="PROTECTED_AUTH" />
  </main>;
  // Next redirects throw; keep this outside the transport-error catch.
  if (!verified) redirect("/login");

  return <>{children}</>;
}
