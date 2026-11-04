import "server-only";
import { fundamentalReadPair } from "./fundamental/read-config.server";
import { getStoredIrMarket, getLastIrDiag, type IrMarket } from "./market-ir";
import { readIranMarket, type SourceAvailability } from "./market-bounded";
import { iranReadQuality, failedIranReadQuality } from "./market-quality";

export interface FundsMarketReadOptions {
  environment: Readonly<Record<string, string | undefined>>;
}

// Only fixed keys and allowlisted scalar values may leave this server module.
// Diagnostics must never change a read result, even if the logging sink throws.
const failureStates = ["absent", "error", "timeout", "stale"] as const;
const failureReasons = ["configuration", "http", "body", "request", "absent", "deadline", "read-error", "read-timeout", "source-error", "empty-source"] as const;
function observeFailure(input: {
  selector: "legacy" | "explicit"; state: unknown; reason: unknown; status: unknown;
  readAt: unknown; urlPresent: boolean | null; keyPresent: boolean | null;
  selectedPair: boolean; data: IrMarket | null;
}) {
  try {
    const count = Array.isArray(input.data?.funds) ? input.data.funds.length : null;
    const record = Object.freeze({
      event: "funds_read_failure",
      selector: input.selector,
      scope: input.selector === "legacy" ? "shared-last-observation" : "stored-read-result",
      state: failureStates.find(value => value === input.state) ?? "unknown",
      reason: failureReasons.find(value => value === input.reason) ?? "unknown",
      status: typeof input.status === "number" && Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : null,
      readAt: typeof input.readAt === "number" && Number.isSafeInteger(input.readAt) && input.readAt >= 0 ? input.readAt : null,
      urlPresent: input.urlPresent,
      keyPresent: input.keyPresent,
      selectedPair: input.selectedPair,
      fundCount: typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null,
    });
    console.warn(record);
  } catch { /* Observation failure cannot alter availability or trigger a retry. */ }
}

/** Reuse the approved server selector, without installing configuration or changing legacy readers. */
export async function readFundsMarket(options?: FundsMarketReadOptions): Promise<{ data: IrMarket | null; availability: SourceAvailability }> {
  let pair: ReturnType<typeof fundamentalReadPair>;
  let urlPresent: boolean | null = null, keyPresent: boolean | null = null;
  try {
    const environment = options?.environment ?? process.env;
    const captured = Object.freeze({ FUNDAMENTAL_READ_URL: environment.FUNDAMENTAL_READ_URL, FUNDAMENTAL_READ_ANON_KEY: environment.FUNDAMENTAL_READ_ANON_KEY });
    urlPresent = captured.FUNDAMENTAL_READ_URL !== undefined;
    keyPresent = captured.FUNDAMENTAL_READ_ANON_KEY !== undefined;
    if (!urlPresent && !keyPresent) return readIranMarket().then(result => {
      try {
        const { availability } = result;
        if (availability.reason === "read-error" || availability.reason === "read-timeout" || availability.state === "error" || availability.state === "timeout") {
          // This diagnostic is shared across legacy consumers, not request-local.
          observeFailure({ selector: "legacy", state: availability.state, reason: availability.reason,
            status: getLastIrDiag()?.status, readAt: availability.readAt, urlPresent: false, keyPresent: false,
            selectedPair: false, data: result.data });
        }
      } catch { /* Keep even unexpected observation failures outside the read contract. */ }
      return result;
    });
    pair = fundamentalReadPair(captured);
  } catch { pair = null; }
  const result = await getStoredIrMarket({ pair });
  const quality = result.state === "read" ? iranReadQuality(result.data, result.readAt) : failedIranReadQuality(null, result.readAt);
  if (result.state !== "read") observeFailure({ selector: "explicit", state: result.state, reason: result.reason,
    status: result.status, readAt: result.readAt, urlPresent, keyPresent, selectedPair: pair !== null, data: result.data });
  return {
    data: result.data,
    availability: {
      ...quality, sourceAt: quality.receivedAt, readAt: result.readAt,
      ...(result.state === "read" ? {} : { state: result.state === "timeout" ? "timeout" as const : "error" as const,
        reason: result.state === "timeout" ? "read-timeout" as const : result.reason === "configuration" || result.state === "absent" ? undefined : "read-error" as const }),
    },
  };
}
