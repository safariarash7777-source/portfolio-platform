import type { ArashDeskData } from "./workspace-model";

export interface DeskReaders {
  market: () => Promise<ArashDeskData["market"]>;
  chart: () => Promise<ArashDeskData["chart"]>;
  reports: () => Promise<ArashDeskData["reports"]>;
  research: () => Promise<ArashDeskData["research"]>;
}
/** Run only after authorization. Unexpected reader failures remain source-specific. */
export async function collectDeskReads(
  readers: DeskReaders,
  clock = () => new Date(),
): Promise<ArashDeskData> {
  const [market, chart, reports, research] = await Promise.allSettled([
    Promise.resolve().then(readers.market),
    Promise.resolve().then(readers.chart),
    Promise.resolve().then(readers.reports),
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
            reason: "خواندن تاریخچهٔ شاخص اکنون ممکن نیست.",
          },
    reports:
      reports.status === "fulfilled"
        ? reports.value
        : {
            data: [],
            state: "unavailable",
            reason: "خواندن فید گزارش‌ها اکنون ممکن نیست.",
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
