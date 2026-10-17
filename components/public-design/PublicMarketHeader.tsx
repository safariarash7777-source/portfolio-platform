import Link from "next/link";
import MarketAutoRefresh from "@/components/market/MarketAutoRefresh";
import MarketSearch from "@/components/market/MarketSearch";
import { MARKET_SECTIONS, type MarketSearchEntry } from "@/lib/market-nav";
import type { SourceAvailability } from "@/lib/market-bounded";
import { marketQualityLabel } from "@/lib/market-quality";
import s from "./PublicDesign.module.css";

export default function PublicMarketHeader({
  index,
  from,
  availability,
  boardState,
}: {
  index: readonly MarketSearchEntry[];
  from: string;
  availability: SourceAvailability;
  boardState?: string | null;
}) {
  return (
    <>
      <MarketAutoRefresh />
      <header className={s.marketHeader}>
        <div>
          <p className={s.eyebrow}>بازار، با منبع و زمان روشن</p>
          <h1>نمای کلان بازار</h1>
          <p className={s.quality}>
            {marketQualityLabel(
              availability.state === "timeout" ? "error" : availability.state,
            )}
          </p>
          {availability.families?.indices.state === "ready" && boardState && (
            <p className={s.boardState}>{boardState}</p>
          )}
        </div>
        <div className={s.search}>
          <MarketSearch index={index} from={from} />
        </div>
      </header>
      <nav className={s.marketNav} aria-label="بخش‌های بازار">
        {MARKET_SECTIONS.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            aria-current={section.key === "overview" ? "page" : undefined}
            title={section.hint}
          >
            {section.label}
            {section.anchor && <small className={s.anchorBadge}>بخش</small>}
          </Link>
        ))}
      </nav>
    </>
  );
}
