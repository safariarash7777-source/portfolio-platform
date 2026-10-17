import type { IrMarket } from "@/lib/market-ir";
import type { SourceAvailability } from "@/lib/market-bounded";
import { withValidNav } from "@/lib/market-quality";
import {
  buildDesk,
  type DeskObservation,
  type DeskResult,
} from "@/lib/core/marketDesk";
import type { IndexSeries } from "@/lib/core/indexTrend";
import type { ResearchDraftsView } from "@/lib/intelligence/research-drafts-view";

export interface DeskRead<T> {
  data: T;
  state: "ready" | "empty" | "unavailable";
  reason: string | null;
}
export interface DeskCompanyReport {
  id: string;
  symbol: string;
  title: string;
  category: string | null;
  sourceDate: string | null;
  sourceTime: string | null;
  recordedAt: string | null;
  url: string | null;
}
export interface ArashDeskData {
  market: { data: IrMarket | null; availability: SourceAvailability };
  chart: DeskRead<IndexSeries[]>;
  reports: DeskRead<DeskCompanyReport[]>;
  research: ResearchDraftsView;
  readAt: string;
}
/** Same inputs/engine as the existing market desk. No new scores or financial formulas. */
export function deskObservations(ir: IrMarket | null, now: number): DeskResult {
  const funds = (ir?.funds ?? [])
    .map((row) => withValidNav(row, null, now))
    .map((row) => ({
      id: row.id,
      faName: row.faName,
      price: row.price ?? null,
      type: row.type ?? null,
      nav: row.nav ?? null,
      bubblePercent: row.bubblePercent ?? null,
      navDate: row.navDate ?? null,
      navTime: row.navTime ?? null,
    }));
  const stocks = (ir?.stocks ?? []).map((row) => ({
    id: row.id,
    faName: row.faName,
    price: row.price ?? null,
    closingPrice: row.closingPrice ?? null,
    bandHigh: row.bandHigh ?? null,
    bandLow: row.bandLow ?? null,
    volume: row.volume ?? null,
  }));
  return buildDesk({ funds, stocks }, { now, limit: 30 });
}
export function splitDeskObservations(rows: DeskObservation[]) {
  return {
    opportunities: rows.filter(
      (row) => row.kind !== "nav_stale" && row.kind !== "nav_missing",
    ),
    alerts: rows.filter(
      (row) => row.kind === "nav_stale" || row.kind === "nav_missing",
    ),
  };
}
export function approvedCodalUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value, "https://codal.ir");
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ["codal.ir", "www.codal.ir"].includes(u.hostname) &&
      ![...u.searchParams.keys()].some((key) =>
        /token|secret|password|api.?key/i.test(key),
      )
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export const chartWindow = (
  series: IndexSeries[],
  points: number,
): IndexSeries[] =>
  series.map((row) => ({ ...row, points: row.points.slice(-points) }));
