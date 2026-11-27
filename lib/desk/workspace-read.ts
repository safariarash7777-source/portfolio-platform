import { DeadlineError, withDeadline } from "../deadline";
import type { ArashDeskData } from "./workspace-model";

export interface DeskReaders {
  market: () => Promise<ArashDeskData["market"]>;
  chart: (signal: AbortSignal) => Promise<ArashDeskData["chart"]>;
  reports: (signal: AbortSignal) => Promise<ArashDeskData["reports"]>;
  research: () => Promise<ArashDeskData["research"]>;
}
// Match the existing research panel's separate four-second budget. Market
// and research retain their own bounds; neither is cancelled by another panel.
const DESK_PANEL_READ_MS = 4000;

/** Run only after authorization. Unexpected reader failures remain source-specific. */
export async function collectDeskReads(
  readers: DeskReaders,
  clock = () => new Date(),
): Promise<ArashDeskData> {
  const [market, chart, reports, research] = await Promise.allSettled([
    Promise.resolve().then(readers.market),
    withDeadline(readers.chart, DESK_PANEL_READ_MS),
    withDeadline(readers.reports, DESK_PANEL_READ_MS),
    Promise.resolve().then(readers.research),
  ]);
  const now = clock();
  return {
    readAt: now.toISOString(),
    market:
      market.status === "fulfilled"
        ? market.value
        : {
            data: null,
            availability: {
              state: "error",
              sourceAt: null,
              receivedAt: null,
              validAt: null,
              readAt: now.getTime(),
              reason: "read-error",
            },
          },
    chart:
      chart.status === "fulfilled"
        ? chart.value
        : {
            data: [],
            state: "unavailable",
            reason: chart.reason instanceof DeadlineError
              ? "خواندن تاریخچهٔ شاخص در مهلت مقرر کامل نشد."
              : "خواندن تاریخچهٔ شاخص اکنون ممکن نیست.",
          },
    reports:
      reports.status === "fulfilled"
        ? reports.value
        : {
            data: [],
            state: "unavailable",
            reason: reports.reason instanceof DeadlineError
              ? "خواندن فید گزارش‌ها در مهلت مقرر کامل نشد."
              : "خواندن فید گزارش‌ها اکنون ممکن نیست.",
          },
    research:
      research.status === "fulfilled"
        ? research.value
        : {
            drafts: [],
            invalidCount: 0,
            unavailableReason: "خواندن پیش‌نویس‌های پژوهش اکنون ممکن نیست.",
          },
  };
}
