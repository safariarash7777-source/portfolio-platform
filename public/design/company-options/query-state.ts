import { STATES, type DemoState } from "./chart-data";

const TABS = ["overview", "fundamental", "reports", "meetings"] as const;
export type PrototypeTab = typeof TABS[number];
export interface PrototypeSelection {
  state: DemoState;
  tab: PrototypeTab;
  fy: number;
  product: string;
  market: string;
  range: number;
  priceRange: number;
  query: string;
  kind: string;
}
const stringChoice = <T extends string>(input: string | null, choices: readonly T[], fallback: T): T => choices.find(choice => choice === input) ?? fallback;
const numberChoice = (input: string | null, choices: readonly number[], fallback: number): number => choices.find(choice => String(choice) === input) ?? fallback;
export const boundedPrototypeQuery = (input: string): string => Array.from(input).slice(0, 80).join("");

export function parsePrototypeSelection(search: string, hash: string): PrototypeSelection {
  const p = new URLSearchParams(search);
  return {
    state: stringChoice(p.get("state"), STATES, "ready"),
    tab: stringChoice(hash.replace(/^#/, ""), TABS, "overview"),
    fy: numberChoice(p.get("fy"), [1404, 1405], 1405),
    product: stringChoice(p.get("product"), ["all", "ورق گرم", "ورق سرد"], "all"),
    market: stringChoice(p.get("market"), ["all", "داخلی", "صادراتی"], "all"),
    range: numberChoice(p.get("range"), [4, 8, 12], 8),
    priceRange: numberChoice(p.get("priceRange"), [6, 12], 12),
    query: boundedPrototypeQuery(p.get("query") ?? ""),
    kind: stringChoice(p.get("kind"), ["all", "monthly", "quarterly"], "all"),
  };
}

export function prototypeComparisonHref(view: "decision" | "dossier", input: PrototypeSelection): string {
  const p = new URLSearchParams({ state: input.state, fy: String(input.fy), product: input.product, market: input.market,
    range: String(input.range), priceRange: String(input.priceRange), query: input.query, kind: input.kind });
  return `./${view}.html?${p.toString()}#${input.tab}`;
}
