// Real route and React SSR, with only its data boundary, shell and Next navigation substituted.
// All records are synthetic; no Supabase instance, credentials, or server-only client is loaded.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { HoldingVersion } from "@/lib/portfolio/contracts";
import type { PortfolioSnapshot } from "@/lib/portfolio/service";

export async function holdingsHistoryMarkup(v?: string, revision = 2, missingPrice = false) {
  const date = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const history = [{ id: "v2", version: 2, createdAt: date(2), note: null }, { id: "v1", version: 1, createdAt: date(14), note: null }];
  const seen: string[] = [];
  const modules = new Map<string, unknown>();
  const stub = (component: React.ElementType) => ({ __esModule: true, default: component });
  function load(file: string): unknown {
    if (modules.has(file)) return modules.get(file);
    const source = readFileSync(file, "utf8"), mod = { exports: {} };
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const req = createRequire(file);
    function dep(name: string): unknown {
      if (name === "@/lib/portfolio/service") return {
        loadPortfolioSnapshot: (versionId?: string): PortfolioSnapshot => {
          const chosen = versionId ? history.find(h => h.id === versionId) : history[0];
          if (!chosen) return { history, holdings: null, ready: false, holdingsState: "not_found", storedTarget: null };
          return { history, ready: true, holdings: { id: chosen.id, version: chosen.version,
            positions: [{ positionKey: "instrument", title: "قلم آزمایشی " + chosen.id, unit: "سهم", symbol: "نماد", manualLabel: null, assetClass: "equity_ir", qty: chosen.version * 2, asOf: chosen.createdAt.slice(0,10), costBasis: null }] },
            storedTarget: { id: "synthetic-latest-target-" + revision, version: revision, referenceVersionId: null, allocations: [{ asset: "سهام", pct: revision === 2 ? 60 : 70 }, { asset: "نقد", pct: revision === 2 ? 40 : 30 }] }, targetState: "ready" };
        },
        loadVersionDebts: (id: string | null) => { seen.push("debts:" + id); return { ready: true, debts: id ? [{ debt_key: "test", title: "بدهی آزمایشی " + id, kind: "other", balance_toman: id === "v1" ? 0 : 1000, currency: "IRT", balance_as_of: date(15).slice(0,10), next_installment_toman: null, next_due_on: null, note: null }] : [] }; },
        loadPriceRows: () => ({ status: missingPrice ? "empty" : "ready", data: missingPrice ? [] : [
          { symbol: "نماد", close: 1000, last_price: null, source: "old-quote", trade_date: date(14).slice(0,10) },
          { symbol: "نماد", close: revision * 1000, last_price: null, source: "latest-quote", trade_date: date(1).slice(0,10) }] }),
      };
      if (name === "@/lib/portfolio/scopeService") return { loadInvestmentScope: (h: HoldingVersion) => {
        seen.push("scope:" + h.id);
        return { status: "ready", review: { id: "scope-" + h.id, scopeVersion: 1, holdingVersionId: h.id, holdingVersion: h.version, rulesVersion: "member-selected.v0.1", memberConfirmedAt: date(1), assignments: [{ positionKey:"instrument", use:"allocatable" }] } };
      }};
      if (name.startsWith("@/components/layout/")) return stub(() => null);
      if (name === "next/link") return stub("a");
      if (name === "next/navigation") return { useRouter: () => ({}) };
      if (!name.startsWith("@/") && !name.startsWith(".")) return req(name);
      const local = name.startsWith("@/") ? resolve(name.slice(2)) : resolve(dirname(file), name);
      return existsSync(local + ".tsx") ? load(local + ".tsx") : req(local);
    }
    new Function("require", "module", "exports", code)(dep, mod, mod.exports);
    modules.set(file, mod.exports);
    return mod.exports;
  }
  const route = load(resolve("app/(protected)/dashboard/holdings/page.tsx")) as { default: (props: {searchParams: Promise<{v?: string}>}) => Promise<React.ReactElement> };
  return { html: renderToStaticMarkup(await route.default({ searchParams: Promise.resolve({v}) })), seen, date: history[1].createdAt };
}
