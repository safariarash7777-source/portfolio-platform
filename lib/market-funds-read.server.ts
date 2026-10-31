import "server-only";
import { fundamentalReadPair } from "./fundamental/read-config.server";
import { getStoredIrMarket, type IrMarket } from "./market-ir";
import { readIranMarket, type SourceAvailability } from "./market-bounded";
import { iranReadQuality, failedIranReadQuality } from "./market-quality";

export interface FundsMarketReadOptions {
  environment: Readonly<Record<string, string | undefined>>;
}

/** Reuse the approved server selector, without installing configuration or changing legacy readers. */
export async function readFundsMarket(options?: FundsMarketReadOptions): Promise<{ data: IrMarket | null; availability: SourceAvailability }> {
  let pair: ReturnType<typeof fundamentalReadPair>;
  try {
    const environment = options?.environment ?? process.env;
    const captured = Object.freeze({ FUNDAMENTAL_READ_URL: environment.FUNDAMENTAL_READ_URL, FUNDAMENTAL_READ_ANON_KEY: environment.FUNDAMENTAL_READ_ANON_KEY });
    if (captured.FUNDAMENTAL_READ_URL === undefined && captured.FUNDAMENTAL_READ_ANON_KEY === undefined) return readIranMarket();
    pair = fundamentalReadPair(captured);
  } catch { pair = null; }
  const result = await getStoredIrMarket({ pair });
  const quality = result.state === "read" ? iranReadQuality(result.data, result.readAt) : failedIranReadQuality(null, result.readAt);
  return {
    data: result.data,
    availability: {
      ...quality, sourceAt: quality.receivedAt, readAt: result.readAt,
      ...(result.state === "read" ? {} : { state: result.state === "timeout" ? "timeout" as const : "error" as const,
        reason: result.state === "timeout" ? "read-timeout" as const : result.reason === "configuration" || result.state === "absent" ? undefined : "read-error" as const }),
    },
  };
}
