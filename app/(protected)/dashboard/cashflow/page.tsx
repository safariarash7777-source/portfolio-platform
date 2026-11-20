import { redirect } from "next/navigation";
import ReadError from "@/components/dashboard/ReadError";
import CashFlowWorkspace from "@/components/portfolio/cashflow/CashFlowWorkspace";
import { createClient } from "@/lib/supabase/server";
import { authSessionFailure } from "@/lib/auth/session-error";
import { withDeadline } from "@/lib/deadline";

export const dynamic = "force-dynamic";
export const metadata = { title: "جریان نقد شخصی", description: "برنامه و واقعیت جریان نقد در حساب‌های انتخاب‌شده و دورهٔ ثبت‌شدهٔ شما." };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ startOn?: string; endOn?: string; version?: string }> }) {
  const selected = await searchParams;
  let ownerId: string | null = null, unavailable = false;
  try {
    const auth = await withDeadline(async () => (await createClient()).auth.getUser(), 10000);
    unavailable = authSessionFailure(auth.error) === 503;
    ownerId = auth.error ? null : auth.data.user?.id ?? null;
  } catch { unavailable = true; }
  if (!unavailable && !ownerId) redirect("/login");
  return unavailable || !ownerId
    ? <ReadError label="نشستِ جریان نقد؛ ورود شما هنوز بررسی نشده است" code="CASHFLOW_AUTH" />
    : <CashFlowWorkspace key={`${ownerId}:${selected.startOn ?? ""}:${selected.endOn ?? ""}:${selected.version ?? ""}`} expectedOwnerId={ownerId} initialPeriod={{ startOn: selected.startOn ?? "", endOn: selected.endOn ?? "" }} initialVersion={selected.version} />;
}
