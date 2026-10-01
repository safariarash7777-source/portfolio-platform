import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadConsultation } from "@/lib/consultation/service";
import ConsultationWorkbench from "@/components/consultation/ConsultationWorkbench";
import ReadError from "@/components/dashboard/ReadError";
import { loadAdvisorBalanceSheet, loadPriceRows } from "@/lib/portfolio/service";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import HoldingsSummary from "@/components/portfolio/HoldingsSummary";
import { DebtList } from "@/components/portfolio/DebtsWorkbench";
import { toPersianDigits } from "@/lib/format";
export const metadata = {title:"پروندهٔ مشاوره"};
export const dynamic = "force-dynamic";
export default async function ConsultationPage({searchParams}:{searchParams:Promise<{relation?:string;financialVersion?:string}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/consultation");
  const {relation,financialVersion}=await searchParams;
  let data;
  try {data=await loadConsultation(relation);} catch {data=null;}
  let financial = null;
  let financialFailed = false;
  if (data?.selected?.advisor_id === user.id && !data.revoked) {
    try {
      const file = await loadAdvisorBalanceSheet(data.selected.id, financialVersion);
      const prices = await loadPriceRows(file.positions);
      financial = { file, prices, sheet: buildBalanceSheet({ positions: file.positions, debts: file.debts, priceRows: prices.data ?? [], now: new Date(), recorded: !!file.version, assetsReady: true, debtsReady: true, pricesFailed: prices.status === "error" }) };
    } catch { financialFailed = true; }
  }
  return <main className="mx-auto max-w-6xl p-5 space-y-5">
    <Link href="/dashboard" className="btn btn-outline">بازگشت به داشبورد</Link>
    <h1 className="font-display text-2xl font-bold">پروندهٔ مشاوره و اقدام بعدی</h1>
    <p className="text-sm leading-7">این پرونده سابقهٔ جلسه، هدف و اقدام‌های توافق‌شده را نگه می‌دارد. دسترسی مشاور به دارایی، بدهی و خلاصهٔ وضعیت مالی را خودتان می‌دهید و هر زمان می‌توانید لغو کنید.</p>
    {financialFailed && <ReadError label="وضعیت مالی پرونده" code="CONSULTATION_FINANCIAL_READ" />}
    {data?.selected?.advisor_id === user.id && !data.revoked && <nav aria-label="تاریخچهٔ تصویر مالی" className="flex flex-wrap gap-3">{data.holdings.map(h => <Link className="btn btn-outline" key={h.id} href={`?relation=${data.selected!.id}&financialVersion=${h.id}`}>تصویر مالی نسخهٔ {toPersianDigits(h.version)}</Link>)}</nav>}
    {financial && <><BalanceSheetSummary sheet={financial.sheet} version={financial.file.version?.version ?? null} /><HoldingsSummary readOnly valuation={financial.sheet.valuation} version={financial.file.version?.version ?? null} pricesFailed={financial.prices.status === "error"} /><DebtList debts={financial.file.debts} /></>}
    {data ? <ConsultationWorkbench key={data.selected?.id ?? "empty"} data={data} /> : <ReadError label="پروندهٔ مشاوره" code="CONSULTATION_READ" />}
  </main>;
}
