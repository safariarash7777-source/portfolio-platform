import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import HoldingsWorkbench from "@/components/portfolio/HoldingsWorkbench";
import InvestmentScopeWorkbench from "@/components/portfolio/InvestmentScopeWorkbench";
import BalanceSheetSummary from "@/components/portfolio/BalanceSheetSummary";
import { buildBalanceSheet } from "@/lib/portfolio/balanceSheet";
import type { HoldingPosition } from "@/lib/portfolio/contracts";

const positions: HoldingPosition[] = [
  { positionKey: "house", manualLabel: "خانه مصرفی نمونه", symbol: null, assetClass: "property", qty: null, unit: "کل قلم", costBasis: null, asOf: "2026-10-02", ownershipPct: 50, valuationMode: "declared", declaredValue: 200000000, valuationSource: "اظهار ساختگی", valuationAsOf: "2026-10-02", valuationStatus: "valid" },
  { positionKey: "gold", manualLabel: "طلای سرمایه‌گذاری نمونه", symbol: null, assetClass: "gold", qty: null, unit: "کل قلم", costBasis: null, asOf: "2026-10-02", ownershipPct: 100, valuationMode: "declared", declaredValue: 600000, valuationSource: "اظهار ساختگی", valuationAsOf: "2026-10-02", valuationStatus: "valid" },
  { positionKey: "cash", manualLabel: "وجه نقد نمونه", symbol: null, assetClass: "cash", qty: null, unit: "کل قلم", costBasis: null, asOf: "2026-10-02", ownershipPct: 100, valuationMode: "declared", declaredValue: 400000, valuationSource: "اظهار ساختگی", valuationAsOf: "2026-10-02", valuationStatus: "valid" },
];
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
let saves = 0;
// This synthetic fixture has NO native API transport. The original components execute unchanged.
globalThis.fetch = async (_input, init) => {
  const log = document.querySelector("#transport-witness")!;
  const body = JSON.parse(String(init?.body));
  saves++;
  log.textContent = JSON.stringify({ synthetic: true, saves, base_version: body.base_version, client_token: body.client_token, positions: body.positions }, null, 2);
  return Response.json(saves === 1 ? { error: "نمونهٔ تعارض دو تب؛ فرم حفظ می‌شود." } : { version: 3, version_id: "synthetic-v3", position_count: body.positions.length, reused: false }, { status: saves === 1 ? 409 : 201 });
};
const sheet = buildBalanceSheet({ positions, debts: [{ debt_key: "debt", title: "بدهی نمونه", kind: "loan", balance_toman: 120000000, currency: "IRT", balance_as_of: "2026-10-02", next_installment_toman: null, next_due_on: null, note: null }], now: new Date("2026-10-02T10:00:00Z"), priceRows: [], recorded: true, assetsReady: true, debtsReady: true });
createRoot(document.getElementById("root")!).render(<AppRouterContext.Provider value={router}>
  <main className="space-y-6"><h1>نمونهٔ نمایشی P04 · اجزای واقعی، دادهٔ ساختگی</h1><p>هیچ ورود، دیتابیس، کارگزاری یا ارسال واقعی وجود ندارد. نخستین ثبت فقط پاسخ تعارض ساختگی می‌دهد.</p>
    <BalanceSheetSummary sheet={sheet} version={2} />
    <InvestmentScopeWorkbench holdings={{ id: "synthetic-v2", version: 2, positions }} storedTarget={{ id: "target", version: 1, referenceVersionId: null, allocations: [{ asset: "طلا", pct: 50 }, { asset: "نقد", pct: 50 }] }} priceRows={[]} pricesFailed={false} />
    <HoldingsWorkbench ready targetFailed={false} latestVersion={2} history={[]} activeVersion={2} activePositions={positions} rows={[]} gaps={[]} definitive={false} notes={[]} totalValue={null} showComparison={false} />
    <details><summary>شاهد درخواست ساختگی</summary><pre id="transport-witness" dir="ltr">هیچ درخواست ثبت نشده است</pre></details>
  </main>
</AppRouterContext.Provider>);
