import { classifyLegacyConsultingAccess, type LegacyConsultingAccessRow } from "./tickets";

type LegacyState = ReturnType<typeof classifyLegacyConsultingAccess>["legacyAccessState"];

/** Caller-reported ledger metadata, never verified purchase/service authority. */
export interface TicketRightProvenanceRow {
  readonly entitlementId: string;
  readonly kind: LegacyConsultingAccessRow["kind"];
  readonly recordedSource: string | null;
  readonly sourceAuthority: "unverified";
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly matchesLegacyAccess: boolean;
}

export interface TicketServiceRightDiagnostic {
  readonly legacyAccessState: LegacyState;
  readonly matchingLegacyEntitlementIds: readonly string[] | null;
  readonly evaluatedAt: string | null;
  readonly provenance: Readonly<{
    state: "reported" | "unknown" | "not_connected";
    rows: readonly TicketRightProvenanceRow[] | null;
  }>;
  readonly serviceRightState: "unknown" | "not_connected";
  readonly serviceIdentifier: null;
  readonly quota: null;
  readonly obligations: null;
  readonly authority: "not_connected";
  readonly writeEnabled: false;
  readonly readOnly: true;
}

function unresolved(legacyAccessState: "unknown" | "not_connected"): TicketServiceRightDiagnostic {
  return Object.freeze({
    legacyAccessState,
    matchingLegacyEntitlementIds: null,
    evaluatedAt: null,
    provenance: Object.freeze({ state: legacyAccessState, rows: null }),
    serviceRightState: legacyAccessState,
    serviceIdentifier: null,
    quota: null,
    obligations: null,
    authority: "not_connected",
    writeEnabled: false,
    readOnly: true,
  });
}

/**
 * Pure diagnostic of a caller-supplied legacy snapshot and evaluation time.
 * The existing classifier owns validation, completeness and microsecond expiry.
 * A reported source, active consulting row or empty complete list supplies no
 * approved service mapping. No transport, provider, grant or write capability
 * is created, and history/receipts are outside this diagnostic's input/output.
 */
export function diagnoseTicketServiceRight(snapshot: unknown, clientId: string, evaluatedAt: string): TicketServiceRightDiagnostic {
  const legacy = classifyLegacyConsultingAccess(snapshot, clientId, evaluatedAt);
  if (legacy.legacyAccessState === "unknown" || legacy.legacyAccessState === "not_connected") {
    return unresolved(legacy.legacyAccessState);
  }

  try {
    // Only a complete, validated snapshot reaches here. Copy metadata instead
    // of retaining caller-owned objects or parsing free text into authority.
    const input = snapshot as { rows: LegacyConsultingAccessRow[] };
    const matchingIds = Object.freeze([...(legacy.matchingLegacyEntitlementIds ?? [])]);
    const matching = new Set(matchingIds);
    const rows = Object.freeze(input.rows.map(row => Object.freeze({
      entitlementId: row.id.toLowerCase(),
      kind: row.kind,
      recordedSource: row.source,
      sourceAuthority: "unverified" as const,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      matchesLegacyAccess: matching.has(row.id.toLowerCase()),
    })));
    return Object.freeze({
      legacyAccessState: legacy.legacyAccessState,
      matchingLegacyEntitlementIds: matchingIds,
      evaluatedAt,
      provenance: Object.freeze({ state: "reported", rows }),
      serviceRightState: "not_connected",
      serviceIdentifier: null,
      quota: null,
      obligations: null,
      authority: "not_connected",
      writeEnabled: false,
      readOnly: true,
    });
  } catch {
    return unresolved("unknown");
  }
}
