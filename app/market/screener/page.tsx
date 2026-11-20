import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoredIrMarket } from "@/lib/market-ir";
import { iranReadQuality } from "@/lib/market-quality";
import Screener from "./Screener";
import publicBoardCapture from "./public-board-capture.json";
import type { Row } from "./rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دیده‌بان بازار سهام", robots: { index: false, follow: false } };

const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

export default async function MarketScreenerPreview() {
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "preview") notFound();
  const market = await getStoredIrMarket();
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const item of market?.stocks ?? []) {
    if (!item.id.trim() || seen.has(item.id)) continue;
    seen.add(item.id);
    rows.push({
      id: item.id, name: item.faName, industry: item.industry?.trim() || null,
      price: item.unit === "toman" ? number(item.price) : null, change: number(item.changePercent),
      volume: number(item.volume), pe: number(item.pe),
    });
  }
  const backup = market === null;
  const receipt = backup ? Date.parse(publicBoardCapture.receivedAt) : iranReadQuality(market).families.stocks.receivedAt;
  const received = receipt
    ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle:"short", timeStyle:"short" }).format(receipt)
    : null;
  return <Screener rows={backup ? publicBoardCapture.rows : rows} received={received} backup={backup} />;
}
