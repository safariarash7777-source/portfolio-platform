import Link from "next/link";
import { notFound } from "next/navigation";
import MemberHome from "@/components/member/MemberHome";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import type { HoldingPosition } from "@/lib/portfolio/contracts";
import { MEMBER_FIXTURE_NOW, MEMBER_FIXTURE_SCENARIOS, MEMBER_FIXTURE_USER } from "@/lib/member/fixture";
export const dynamic = "force-dynamic";
export default async function MemberPreview({ searchParams }: { searchParams: Promise<{ scenario?: string; cohort?: string }> }) {
  if (process.env.MEMBER_HOME_FIXTURE_PREVIEW !== "1") notFound();
  const { scenario = "overlap", cohort } = await searchParams;
  if (!MEMBER_FIXTURE_SCENARIOS.includes(scenario as typeof MEMBER_FIXTURE_SCENARIOS[number])) notFound();
  const asset: HoldingPosition = { positionKey: "synthetic", symbol: null, manualLabel: "دارایی مشترک ساختگی", assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-10-01", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "fixture صریح", valuationAsOf: "2026-10-01", valuationStatus: "valid" };
  const sheet = buildBalanceSheet({ positions: [asset, { ...asset, positionKey: "unknown", manualLabel: "دارایی بی‌قیمت ساختگی", qty: 10, valuationMode: "unpriced", declaredValue: null, unit: "گرم" }], debts: [{ debt_key: "synthetic", title: "وام ساختگی", kind: "loan", balance_toman: 1500, currency: "IRT", balance_as_of: "2026-10-01", next_installment_toman: null, next_due_on: null, note: null }], priceRows: [], now: new Date(MEMBER_FIXTURE_NOW), recorded: true, assetsReady: true, debtsReady: true });
  return <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-5 py-8" dir="rtl"><h1 className="font-display text-3xl font-bold">خانهٔ عضو — پیش‌نمایش ساختگی</h1><nav aria-label="سناریوی ساختگی" className="flex flex-wrap gap-3">{MEMBER_FIXTURE_SCENARIOS.map(s => <Link key={s} href={`/member-home-preview?scenario=${s}`} className="inline-flex min-h-12 items-center underline">{s}</Link>)}</nav><MemberHome key={scenario} userId={MEMBER_FIXTURE_USER} selectedCohortId={cohort} now={MEMBER_FIXTURE_NOW} fixtureScenario={scenario} /><section aria-label="خلاصهٔ مالی ساختگی؛ مستقل از پایان دوره"><BalanceSheetSummary sheet={sheet} version={3} /></section></main>;
}
